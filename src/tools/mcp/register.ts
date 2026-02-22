import { MCPBase, toolRegistry } from '@ericnunes/frame-agent-sdk';
import { logger } from '../../infrastructure/logging/logger';
import { McpLoader } from './loader';

export type McpAliasMode = 'stripNamespace' | 'none';

const activeMcpConnections = new Set<MCPBase>();

export async function registerMcpTools(args: {
  projectRoot: string;
  configFile?: string;
  aliasMode?: McpAliasMode;
}): Promise<{ registeredMcps: number; skippedMcps: number; registeredTools: number }> {
  const loader = new McpLoader({ projectRoot: args.projectRoot, configFile: args.configFile });
  const configs = loader.loadRegisteredMcpConfigs();
  const aliasMode: McpAliasMode = args.aliasMode ?? 'stripNamespace';

  let registeredMcps = 0;
  let skippedMcps = 0;
  let registeredTools = 0;

  for (const metadata of configs) {
    const config = metadata.config as any;
    if (!metadata.registered) {
      skippedMcps += 1;
      continue;
    }

    try {
      const count = await registerSingleMcp(config, config.name || config.id, aliasMode);
      registeredMcps += 1;
      registeredTools += count;
    } catch (error) {
      logger.error(`[registerMcpTools] Erro ao registrar MCP "${metadata.name}":`, error);
    }
  }

  logger.info(`[registerMcpTools] MCPs registrados=${registeredMcps}, tools=${registeredTools}, pulados=${skippedMcps}`);
  return { registeredMcps, skippedMcps, registeredTools };
}

async function registerSingleMcp(config: any, name: string, aliasMode: McpAliasMode): Promise<number> {
  const mcp = new MCPBase(config);

  logger.info(`[registerMcpTools] Conectando ao MCP ${config.id} (${name})...`);
  await mcp.connect();
  activeMcpConnections.add(mcp);

  let tools: any[] = [];

  if (aliasMode === 'stripNamespace') {
    // 1) Descobrir nomes completos para montar alias map
    const fullTools = await mcp.createTools({ alias: {} });
    const aliasMap: Record<string, string> = {};

    fullTools.forEach((tool: any) => {
      const fullName = tool.name;
      const shortName = fullName.replace(`mcp:${config.namespace}/`, '');
      aliasMap[fullName] = shortName;
    });

    // 2) Recriar tools com aliases
    tools = await mcp.createTools({ alias: aliasMap });
  } else {
    tools = await mcp.createTools();
  }

  if (!tools.length) {
    logger.warn(`[registerMcpTools] Nenhuma ferramenta MCP encontrada para ${name}`);
    return 0;
  }

  let registered = 0;
  for (const tool of tools) {
    try {
      (tool as any)._mcpNamespace = config.namespace;
      (tool as any)._mcpId = config.id;
      toolRegistry.register(tool);
      registered += 1;
    } catch (error) {
      logger.warn(`[registerMcpTools] Falha ao registrar tool MCP (${name}): ${tool?.name}`, error);
    }
  }

  logger.info(`[registerMcpTools] ${registered} ferramentas MCP registradas (${name})`);
  return registered;
}

export async function shutdownMcpTools(): Promise<void> {
  if (activeMcpConnections.size === 0) return;

  const connections = Array.from(activeMcpConnections);
  activeMcpConnections.clear();

  await Promise.all(
    connections.map(async (mcp) => {
      try {
        await mcp.disconnect();
      } catch (error) {
        logger.warn('[shutdownMcpTools] Falha ao desconectar MCP:', error);
      }
    }),
  );
}
