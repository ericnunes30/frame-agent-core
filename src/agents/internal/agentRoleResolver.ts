import type { IAgentMetadata } from '../interfaces/agentMetadata.interface';

export function canActAsMainAgent(metadata: IAgentMetadata): boolean {
  return metadata.type === 'main-agent' || metadata.allowDualRole === true;
}

export function canActAsSubAgent(metadata: IAgentMetadata): boolean {
  return metadata.type === 'sub-agent' || metadata.allowDualRole === true;
}
