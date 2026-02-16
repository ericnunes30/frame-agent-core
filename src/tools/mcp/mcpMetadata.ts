import type { MCPBaseConfig } from '@ericnunes/frame-agent-sdk';

export interface McpConfigMetadata {
  enable?: boolean; // default: true
  excludeFromList?: boolean; // default: false
}

export type McpConfigWithMetadata = MCPBaseConfig & {
  mcp?: McpConfigMetadata;
};

