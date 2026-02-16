import { ToolBase, type IToolParams } from '@ericnunes/frame-agent-sdk';
import * as fs from 'fs';
import { SkillLoader } from '../../skills/loader';
import { McpLoader } from '../mcp/loader';
import { discoverMcpTools, type IMcpToolInfo } from '../mcp/discoverer';
import { logger } from '../../infrastructure/logging/logger';

type CapabilityType = 'skill' | 'mcp';

interface IListCapabilitiesParams extends IToolParams {
  query?: string;
}

class ListCapabilitiesSchema {
  static schemaProperties = {
    query: { type: 'string', required: false, description: 'Termo de busca (nome ou description)' },
  } as const;
}

interface IListCapabilitiesResult {
  success: boolean;
  capabilities: Array<{
    name: string;
    description: string;
    type: CapabilityType;
    keywords?: string[];
    namespace?: string;
    registered?: boolean;
  }>;
  message?: string;
}

export function createListCapabilitiesTool(args: {
  projectRoot: string;
  mcpConfigFile?: string;
  skillsDir?: string;
  skillsDirs?: string[];
}) {
  return new (class extends ToolBase<IListCapabilitiesParams, IListCapabilitiesResult> {
    public readonly name = 'list_capabilities';
    public readonly description = 'Lista Skills e MCPs disponiveis no sistema.';
    public readonly parameterSchema = ListCapabilitiesSchema;

    public async execute(params: IListCapabilitiesParams): Promise<IListCapabilitiesResult> {
      const query = params.query?.toLowerCase();

      const skillLoader = new SkillLoader({
        projectRoot: args.projectRoot,
        ...(args.skillsDirs ? { skillsDirs: args.skillsDirs } : {}),
        ...(args.skillsDir ? { skillsDir: args.skillsDir } : {}),
      });
      const skills = skillLoader.loadAllSkills().map((s) => ({
        name: s.name,
        description: s.description,
        type: 'skill' as const,
        keywords: s.keywords,
      }));

      const mcpLoader = new McpLoader({ projectRoot: args.projectRoot, configFile: args.mcpConfigFile });
      const mcpConfigs = mcpLoader.loadVisibleMcpConfigs().map((m) => ({
        name: m.id,
        description: m.name,
        type: 'mcp' as const,
        namespace: m.namespace,
        registered: m.registered,
      }));

      const all = [...skills, ...mcpConfigs];
      const matches = query
        ? all.filter((c) => c.name.toLowerCase().includes(query) || c.description.toLowerCase().includes(query))
        : all;

      logger.info(`[list_capabilities] Encontradas ${matches.length} capabilities para query "${query || '*'}"`);

      return {
        success: true,
        capabilities: matches,
        message:
          matches.length > 0
            ? `Encontradas ${matches.length} capabilities. Use enable_capability para detalhes.`
            : 'Nenhuma capability encontrada.',
      };
    }
  })();
}

interface IEnableCapabilityParams extends IToolParams {
  capabilityName: string;
}

class EnableCapabilitySchema {
  static schemaProperties = {
    capabilityName: { type: 'string', required: true, description: 'Nome exato da capability (via list_capabilities)' },
  } as const;
}

interface IEnableCapabilityResult {
  success: boolean;
  type: CapabilityType;
  content?: string;
  mcpName?: string;
  registered?: boolean;
  tools?: IMcpToolInfo[];
  message?: string;
}

export function createEnableCapabilityTool(args: {
  projectRoot: string;
  mcpConfigFile?: string;
  skillsDir?: string;
  skillsDirs?: string[];
}) {
  return new (class extends ToolBase<IEnableCapabilityParams, IEnableCapabilityResult> {
    public readonly name = 'enable_capability';
    public readonly description = 'Habilita uma Skill ou MCP. Para Skill, le instrucoes. Para MCP, lista ferramentas.';
    public readonly parameterSchema = EnableCapabilitySchema;

    public async execute(params: IEnableCapabilityParams): Promise<IEnableCapabilityResult> {
      const name = params.capabilityName;

      const skillLoader = new SkillLoader({
        projectRoot: args.projectRoot,
        ...(args.skillsDirs ? { skillsDirs: args.skillsDirs } : {}),
        ...(args.skillsDir ? { skillsDir: args.skillsDir } : {}),
      });
      const skill = skillLoader.loadAllSkills().find((s) => s.name === name);
      if (skill) {
        try {
          const content = fs.readFileSync(skill.path, 'utf-8');
          logger.info(`[enable_capability] Skill "${name}" lida de ${skill.path}`);
          return { success: true, type: 'skill', content, message: `Skill "${name}" carregada.` };
        } catch (error: any) {
          logger.error(`[enable_capability] Erro ao ler Skill ${skill.path}:`, error);
          return { success: false, type: 'skill', message: `Erro ao carregar skill: ${error?.message ?? String(error)}` };
        }
      }

      const mcpLoader = new McpLoader({ projectRoot: args.projectRoot, configFile: args.mcpConfigFile });
      const mcpConfig = mcpLoader.getMcpById(name);
      if (mcpConfig && mcpConfig.visible) {
        try {
          const tools = await discoverMcpTools(mcpConfig.config);
          logger.info(`[enable_capability] MCP "${mcpConfig.name}" descoberto com ${tools.length} ferramentas`);
          return {
            success: true,
            type: 'mcp',
            mcpName: mcpConfig.name,
            registered: mcpConfig.registered,
            tools,
            message: `MCP "${mcpConfig.name}" possui ${tools.length} ferramentas disponiveis.`,
          };
        } catch (error: any) {
          logger.error(`[enable_capability] Erro ao descobrir ferramentas do MCP ${mcpConfig.name}:`, error);
          return { success: false, type: 'mcp', message: `Erro ao descobrir ferramentas do MCP: ${error?.message ?? String(error)}` };
        }
      }

      return {
        success: false,
        type: 'skill',
        message: `Capability "${name}" nao encontrada. Use list_capabilities para ver opcoes.`,
      };
    }
  })();
}
