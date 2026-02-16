/**
 * Interface para configuracao do runtime.
 *
 * Esta interface e derivada do frame-code-cli, mas aqui pertence ao core.
 */
export interface IConfig {
  provider: string;
  apiKey: string;
  baseURL?: string;
  vision?: {
    supportsVision?: boolean;
    provider?: string;
    apiKey?: string;
    baseURL?: string;
    model?: string;
  };
  defaults?: {
    model?: string;
    maxTokens?: number; // Output tokens por call
    maxContextTokens?: number; // Tokens de contexto/memoria
    temperature?: number;
    topP?: number;
  };
  skills?: {
    enabled?: boolean;
    directory?: string;
    maxTokens?: number;
    relevanceThreshold?: number;
  };
  compression?: {
    enabled?: boolean;
    threshold?: number;
    maxCount?: number;
    maxTokens?: number;
    model?: string;
    logging?: boolean;
    persist?: boolean;
  };
  tools?: {
    mcpEnabled?: boolean;
    agentMode?: 'autonomous' | 'interactive';
  };
}

