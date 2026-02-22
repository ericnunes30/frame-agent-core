import type { AgentType } from '../enums/agentType.enum';
import type { ToolPolicy } from '../../tools/registry/toolFilter';
export type { ToolPolicy } from '../../tools/registry/toolFilter';

export interface IAgentMetadata {
  name: string;
  type: AgentType | 'main-agent' | 'sub-agent';
  allowDualRole?: boolean;
  canBeSupervisor: boolean;
  description: string;
  keywords: string[];
  tools: string[];
  toolPolicy?: ToolPolicy;
  subAgents?: string[] | 'all';
  availableFor?: 'all' | string[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPromptPath?: string;
  systemPrompt: string;
  backstory?: string;
  additionalInstructions?: string;
  path: string;
  category?: string;
  compressionEnabled?: boolean;
  customErrorHandling?: boolean;
  flowMode?: string;
  useProjectRules?: boolean;
}

export interface IAgentMetadataSummary {
  name: string;
  type: IAgentMetadata['type'];
  description: string;
  keywords: string[];
  canBeSupervisor: boolean;
}

export interface IAgentRegistrationResult {
  name: string;
  success: boolean;
  error?: string;
}
