import * as fs from 'fs';
import * as path from 'path';
import { resolve } from 'path';
import { logger } from '../infrastructure/logging/logger';

export const loadSystemPrompt = {
  loadFileContent(args: {
    projectRoot: string;
    filename: string;
    // If provided, appended at the end with a stable header.
    compressionContext?: string;
    // Directory of the agent markdown file (higher priority for relative prompts).
    agentDir?: string;
  }): string {
    const projectRoot = resolve(args.projectRoot);
    const filename = args.filename;

    try {
      const possiblePaths: string[] = [];

      if (path.isAbsolute(filename)) {
        possiblePaths.push(filename);
      } else {
        // 1) relative to agent file (if provided)
        if (args.agentDir) possiblePaths.push(path.join(args.agentDir, filename));

        // 2) relative to project root
        possiblePaths.push(path.join(projectRoot, filename));

        // 3) conventional prompt folders
        possiblePaths.push(path.join(projectRoot, 'src', 'prompts', filename));
        possiblePaths.push(path.join(projectRoot, 'prompts', filename));
      }

      let content = '';
      let foundPath = '';
      for (const promptPath of possiblePaths) {
        if (fs.existsSync(promptPath)) {
          content = fs.readFileSync(promptPath, 'utf-8');
          foundPath = promptPath;
          break;
        }
      }

      if (!content) {
        logger.warn(`[loadSystemPrompt] Arquivo nao encontrado: ${filename}`);
        logger.debug('[loadSystemPrompt] Caminhos tentados:', possiblePaths);
        return '';
      }

      logger.debug(`[loadSystemPrompt] Carregado de: ${foundPath}`);

      if (args.compressionContext && args.compressionContext.trim().length > 0) {
        content += '\n\n---\n\n## Contexto de Compressao\n\n' + args.compressionContext.trim();
      }

      return content;
    } catch (error) {
      logger.error(`[loadSystemPrompt] Erro ao carregar ${filename}:`, error);
      return '';
    }
  },
};

