import { ToolBase, type IToolParams, type ITool } from '@ericnunes/frame-agent-sdk';
import * as fs from 'fs';
import * as path from 'path';
import { resolve } from 'path';
import { parse } from '@typescript-eslint/typescript-estree';
import { logger } from '../../infrastructure/logging/logger';

const SHOW_TOOL_LOGS_INLINE = (process.env.SHOW_TOOL_LOGS_INLINE || '').toLowerCase() === 'true';

const toolLog = (...args: any[]) => {
  if (!SHOW_TOOL_LOGS_INLINE) return;
  const message = args.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))).join(' ');
  logger.info(message);
};

const errorLog = (...args: any[]) => {
  if (!SHOW_TOOL_LOGS_INLINE) return;
  const message = args.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))).join(' ');
  logger.error(message);
};

const TOOL_ID = '[file_outline]';

interface FileOutlineParams extends IToolParams {
  filePath: string;
}

class FileOutlineParamsSchema {
  static schemaProperties = {
    filePath: 'string',
  } as const;
}

enum SymbolType {
  CLASS = 'class',
  INTERFACE = 'interface',
  FUNCTION = 'function',
  METHOD = 'method',
  VARIABLE = 'variable',
  ENUM = 'enum',
  TYPE_ALIAS = 'type_alias',
}

interface SymbolInfo {
  name: string;
  type: SymbolType;
  line: number;
  signature: string;
  children?: SymbolInfo[];
}

interface FileOutlineResult {
  success: boolean;
  message: string;
  outline?: string;
  symbolsCount: number;
}

export function createFileOutlineTool(args: { projectRoot: string }): ITool {
  const projectRoot = resolve(args.projectRoot);

  return new (class extends ToolBase<FileOutlineParams, FileOutlineResult> {
    public readonly name = 'file_outline';
    public readonly description = 'Extrai estrutura hierarquica de arquivos TypeScript/JavaScript (sem corpos).';
    public readonly parameterSchema = FileOutlineParamsSchema;

    private validate(params: FileOutlineParams): void {
      if (!params.filePath || params.filePath.trim() === '') {
        throw new Error('Caminho do arquivo e obrigatorio');
      }
    }

    private extractFunctionSignature(node: any): string {
      const nome = node.id?.name || node.key?.name || 'anonymous';
      const parametros =
        node.params
          ?.map((param: any) => {
            if (param.type === 'Identifier') return param.name;
            if (param.type === 'AssignmentPattern') return `${param.left.name} = ${this.extractDefaultValue(param.right)}`;
            return 'param';
          })
          .join(', ') || '';

      const tipoRetorno = node.returnType ? `: ${this.extractType(node.returnType.typeAnnotation)}` : '';
      return `${nome}(${parametros})${tipoRetorno}`;
    }

    private extractDefaultValue(node: any): string {
      if (node.type === 'Literal') return node.raw || String(node.value);
      if (node.type === 'Identifier') return node.name;
      return '...';
    }

    private extractType(node: any): string {
      if (node.type === 'TSAnyKeyword') return 'any';
      if (node.type === 'TSStringKeyword') return 'string';
      if (node.type === 'TSNumberKeyword') return 'number';
      if (node.type === 'TSBooleanKeyword') return 'boolean';
      if (node.type === 'TSVoidKeyword') return 'void';
      if (node.type === 'TSTypeReference' && node.typeName) return node.typeName.name;
      return 'unknown';
    }

    private extractSymbols(node: any, out: SymbolInfo[]): void {
      if (!node || typeof node !== 'object') return;

      if (node.type === 'ClassDeclaration' && node.id) {
        const simbolo: SymbolInfo = {
          name: node.id.name,
          type: SymbolType.CLASS,
          line: node.loc.start.line,
          signature: `class ${node.id.name}`,
          children: [],
        };

        if (node.body?.body) {
          node.body.body.forEach((member: any) => {
            if (member.type === 'MethodDefinition' && member.key) {
              simbolo.children?.push({
                name: member.key.name,
                type: SymbolType.METHOD,
                line: member.loc.start.line,
                signature: this.extractFunctionSignature(member),
              });
            }
          });
        }

        out.push(simbolo);
        return;
      }

      if (node.type === 'TSInterfaceDeclaration' && node.id) {
        out.push({
          name: node.id.name,
          type: SymbolType.INTERFACE,
          line: node.loc.start.line,
          signature: `interface ${node.id.name}`,
        });
        return;
      }

      if (node.type === 'FunctionDeclaration' && node.id) {
        out.push({
          name: node.id.name,
          type: SymbolType.FUNCTION,
          line: node.loc.start.line,
          signature: this.extractFunctionSignature(node),
        });
        return;
      }

      if (node.type === 'VariableDeclaration' && node.declarations) {
        node.declarations.forEach((decl: any) => {
          if (decl.id && (decl.init?.type === 'FunctionExpression' || decl.init?.type === 'ArrowFunctionExpression')) {
            out.push({
              name: decl.id.name,
              type: SymbolType.FUNCTION,
              line: node.loc.start.line,
              signature: this.extractFunctionSignature(decl.init),
            });
          }
        });
        return;
      }

      if (node.type === 'TSEnumDeclaration' && node.id) {
        out.push({
          name: node.id.name,
          type: SymbolType.ENUM,
          line: node.loc.start.line,
          signature: `enum ${node.id.name}`,
        });
        return;
      }

      if (node.type === 'TSTypeAliasDeclaration' && node.id) {
        out.push({
          name: node.id.name,
          type: SymbolType.TYPE_ALIAS,
          line: node.loc.start.line,
          signature: `type ${node.id.name}`,
        });
        return;
      }

      for (const key in node) {
        const value = node[key];
        if (!value || typeof value !== 'object') continue;
        if (Array.isArray(value)) value.forEach((child: any) => this.extractSymbols(child, out));
        else this.extractSymbols(value, out);
      }
    }

    private formatSymbols(symbols: SymbolInfo[], level = 0): string {
      const indent = '  '.repeat(level);
      let out = '';
      for (const s of symbols) {
        out += `${indent}- ${s.signature} (${s.type}, line ${s.line})\n`;
        if (s.children && s.children.length > 0) {
          out += this.formatSymbols(s.children, level + 1);
        }
      }
      return out;
    }

    public async execute(params: FileOutlineParams): Promise<FileOutlineResult> {
      try {
        toolLog(`${TOOL_ID} start file_outline`, { filePath: params.filePath });
        this.validate(params);

        const resolvedPath = path.isAbsolute(params.filePath) ? params.filePath : path.resolve(projectRoot, params.filePath);
        if (!fs.existsSync(resolvedPath)) {
          const message = `Arquivo nao encontrado: ${resolvedPath}`;
          errorLog(`${TOOL_ID} ${message}`);
          return { success: false, message, symbolsCount: 0 };
        }

        const stats = fs.statSync(resolvedPath);
        if (!stats.isFile()) {
          const message = `Caminho nao e um arquivo: ${resolvedPath}`;
          errorLog(`${TOOL_ID} ${message}`);
          return { success: false, message, symbolsCount: 0 };
        }

        const content = fs.readFileSync(resolvedPath, 'utf-8');
        if (!content.trim()) {
          return {
            success: true,
            message: 'Arquivo vazio',
            outline: 'Arquivo vazio - nenhum simbolo encontrado',
            symbolsCount: 0,
          };
        }

        const ast = parse(content, { loc: true, range: true, jsx: true });
        const symbols: SymbolInfo[] = [];
        this.extractSymbols(ast, symbols);

        if (symbols.length === 0) {
          return {
            success: true,
            message: 'Nenhum simbolo encontrado',
            outline: 'Nenhum simbolo encontrado (arquivo pode conter apenas codigo de execucao)',
            symbolsCount: 0,
          };
        }

        const outline = this.formatSymbols(symbols);
        const symbolsCount = symbols.reduce((count, s) => count + 1 + (s.children?.length || 0), 0);

        return {
          success: true,
          message: `Estrutura extraida (${symbolsCount} simbolo(s))`,
          outline,
          symbolsCount,
        };
      } catch (error: any) {
        const message = error?.message ?? 'motivo desconhecido';
        errorLog(`${TOOL_ID} erro`, message);
        return { success: false, message: `Erro ao extrair estrutura de ${params.filePath}: ${message}`, symbolsCount: 0 };
      }
    }
  })() as unknown as ITool;
}
