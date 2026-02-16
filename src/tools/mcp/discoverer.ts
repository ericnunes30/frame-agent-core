import * as fs from 'fs';
import * as path from 'path';
import { resolve } from 'path';
import { MCPBase } from '@ericnunes/frame-agent-sdk';
import type { McpConfigWithMetadata } from './mcpMetadata';
import type { McpJsonConfig, McpJsonEntry } from './mcpConfig.interface';
import { logger } from '../../infrastructure/logging/logger';
import type { FrameProjectLayout } from '../../runtime/layout';

export interface IMcpToolInfo {
  name: string;
  description: string;
}

export async function discoverMcpTools(config: McpConfigWithMetadata): Promise<IMcpToolInfo[]> {
  const mcp = new MCPBase(config);

  try {
    logger.debug(`[McpDiscover] Conectando ao MCP ${config.id} (${config.name})...`);
    await mcp.connect();

    logger.debug(`[McpDiscover] Descobrindo ferramentas do MCP ${config.id}...`);
    const tools = await mcp.createTools();

    const result = tools.map((t) => ({ name: t.name, description: t.description }));
    logger.info(`[McpDiscover] MCP "${config.name}" descoberto com ${result.length} ferramentas`);
    return result;
  } catch (error: any) {
    logger.error(`[McpDiscover] Erro ao descobrir ferramentas do MCP ${config.id}:`, error);
    throw new Error(`Falha ao descobrir ferramentas do MCP "${config.name}": ${error?.message ?? String(error)}`);
  }
}

export function loadUserCodeMcpConfigs(args: {
  projectRoot: string;
  configFile?: string;
  layout?: FrameProjectLayout;
}): McpConfigWithMetadata[] {
  const root = resolve(args.projectRoot);
  const configFile = args.configFile ?? args.layout?.mcpConfigFile ?? path.join('.code', 'mcp.json');
  const mcpJsonPath = path.isAbsolute(configFile) ? configFile : path.join(root, configFile);

  if (!fs.existsSync(mcpJsonPath)) return [];

  try {
    const content = fs.readFileSync(mcpJsonPath, 'utf-8');
    const config: McpJsonConfig = JSON.parse(content);

    return (config.mcps || []).map((entry: McpJsonEntry): McpConfigWithMetadata => {
      const configEntry: McpConfigWithMetadata = { ...entry, mcp: entry.mcp || {} } as any;

      if (entry.command) configEntry.command = expandEnvInString(entry.command);
      if (entry.args) configEntry.args = entry.args.map((arg) => expandEnvInString(arg));

      return configEntry;
    });
  } catch (error) {
    logger.error('[McpDiscoverer] Erro ao carregar mcp.json:', error);
    return [];
  }
}

function expandEnvInString(value: string): string {
  return value.replace(/\$\{([^:}]+)(?::-([^}]*))?\}/g, (_, varName, defaultValue) => {
    if (varName in process.env) return process.env[varName] || '';
    return defaultValue !== undefined ? defaultValue : '';
  });
}
