/**
 * Interfaces para configuracao de MCP via `.agents/mcp.json` (legacy: `.code/mcp.json`).
 */
export interface McpJsonEntry {
  id: string;
  transport: 'stdio';
  command?: string;
  args?: string[];
  namespace?: string;
  name?: string;
  version?: string;
  capabilities?: Record<string, unknown>;
  mcp?: {
    enable?: boolean;
    excludeFromList?: boolean;
  };
  env?: Record<string, string>;
  container?: string;
}

export interface McpJsonConfig {
  mcps: McpJsonEntry[];
}
