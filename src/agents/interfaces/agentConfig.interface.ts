/**
 * Interface para configuracao de modelo especifica de um agente.
 *
 * Portado do frame-code-cli para o frame-agent-core.
 */
export interface AgentModelConfig {
  provider?: string;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
  maxContextTokens?: number;
  topP?: number;
  capabilities?: {
    supportsVision?: boolean;
  };
}

export interface AgentConfigFile {
  defaults?: Partial<AgentModelConfig>;
  agents?: Record<string, AgentModelConfig>;
}

export interface ResolvedAgentConfig {
  provider?: string;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
  maxContextTokens?: number;
  topP?: number;
  capabilities?: {
    supportsVision?: boolean;
  };
  fromConfigFile: boolean;
}

