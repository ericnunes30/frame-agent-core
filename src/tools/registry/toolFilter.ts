import type { ITool } from '@ericnunes/frame-agent-sdk';
import type { RuntimeProfile } from '../../runtime/types';

export interface ToolFilterConfig {
  mode: 'autonomous' | 'interactive';
  mcpToolsEnabled: boolean;
  excludedTools: string[];
  allowAskUser: boolean;
}

export function getToolFilterConfig(args: {
  profile: RuntimeProfile;
  mcpToolsEnabled?: boolean;
  excludedTools?: string[];
  allowAskUser?: boolean;
}): ToolFilterConfig {
  const mode = args.profile === 'ci_headless' ? 'autonomous' : 'interactive';
  const allowAskUser = typeof args.allowAskUser === 'boolean' ? args.allowAskUser : mode !== 'autonomous';
  return {
    mode,
    mcpToolsEnabled: args.mcpToolsEnabled ?? true,
    excludedTools: args.excludedTools ?? [],
    allowAskUser,
  };
}

export function shouldIncludeTool(tool: ITool, config: ToolFilterConfig): boolean {
  if (config.excludedTools.includes(tool.name)) return false;

  if (!config.allowAskUser && (tool.name === 'ask_user' || tool.name === 'askUser')) return false;

  // In frame-agent-core, MCP tools geralmente sao aliased (nome "curto").
  // Mantemos o filtro por prefixo por compatibilidade, mas o controle principal e por config.mcpToolsEnabled.
  if (!config.mcpToolsEnabled && tool.name.startsWith('mcp_')) return false;

  // approval e deliberadamente removido do pacote default.
  if (tool.name === 'approval') return false;

  return true;
}

export function filterTools(tools: ITool[], config: ToolFilterConfig): ITool[] {
  return tools.filter((tool) => shouldIncludeTool(tool, config));
}

export type ToolPolicy = {
  allow?: string[];
  deny?: string[];
};

export function filterToolsByPolicy(tools: ITool[], policy?: ToolPolicy, config?: ToolFilterConfig): ITool[] {
  const base = config ? filterTools(tools, config) : tools;
  const allow = policy?.allow?.filter(Boolean);
  const deny = policy?.deny?.filter(Boolean);

  if (allow && allow.length > 0) {
    const allowSet = new Set(allow);
    return base.filter((tool) => allowSet.has(tool.name));
  }

  if (deny && deny.length > 0) {
    const denySet = new Set(deny);
    return base.filter((tool) => !denySet.has(tool.name));
  }

  return base;
}

