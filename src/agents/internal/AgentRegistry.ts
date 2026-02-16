import type { TelemetryOptions } from '@ericnunes/frame-agent-sdk';
import { GraphEngine } from '@ericnunes/frame-agent-sdk';
import { logger } from '../../infrastructure/logging/logger';
import { discoverAgents, createAgentFromFlow } from './agentParser';
import type { IAgentMetadata, IAgentMetadataSummary, IAgentRegistrationResult } from '../interfaces/agentMetadata.interface';
import type { FrameProjectLayout } from '../../runtime/layout';

export class AgentRegistry {
  private readonly agents: Map<string, IAgentMetadata> = new Map();
  private readonly projectRoot: string;
  private readonly agentsDirs?: string[];
  private readonly mcpConfigFile?: string;
  private readonly layout?: FrameProjectLayout;

  constructor(args: { projectRoot: string; agentsDirs?: string[]; mcpConfigFile?: string; layout?: FrameProjectLayout }) {
    this.projectRoot = args.projectRoot;
    this.agentsDirs = args.agentsDirs;
    this.mcpConfigFile = args.mcpConfigFile;
    this.layout = args.layout;
  }

  public async load(): Promise<number> {
    const agents = discoverAgents({
      projectRoot: this.projectRoot,
      agentsDirs: this.agentsDirs,
      layout: this.layout,
    });
    for (const agent of agents) this.register(agent, { overwrite: true });
    logger.info(`[AgentRegistry] Carregados ${agents.length} agentes`);
    return agents.length;
  }

  public register(metadata: IAgentMetadata, options?: { overwrite?: boolean }): IAgentRegistrationResult {
    if (this.agents.has(metadata.name)) {
      if (!options?.overwrite) {
        const error = `Agent '${metadata.name}' ja registrado`;
        logger.warn(`[AgentRegistry] ${error}`);
        return { name: metadata.name, success: false, error };
      }
    }
    this.agents.set(metadata.name, metadata);
    return { name: metadata.name, success: true };
  }

  public get(name: string): IAgentMetadata | undefined {
    return this.agents.get(name);
  }

  public getMetadata(name: string): IAgentMetadata | undefined {
    return this.get(name);
  }

  public list(): IAgentMetadata[] {
    return Array.from(this.agents.values());
  }

  public listSummaries(): IAgentMetadataSummary[] {
    return this.list().map((metadata) => ({
      name: metadata.name,
      type: metadata.type,
      description: metadata.description,
      keywords: metadata.keywords,
      canBeSupervisor: metadata.canBeSupervisor,
    }));
  }

  public listByType(type: string): IAgentMetadata[] {
    return this.list().filter((a) => a.type === type);
  }

  public has(name: string): boolean {
    return this.agents.has(name);
  }

  public count(): number {
    return this.agents.size;
  }

  public clear(): void {
    this.agents.clear();
  }

  public async createEngine(name: string, telemetry?: { trace: any; telemetry: TelemetryOptions }): Promise<GraphEngine> {
    const metadata = this.get(name);
    if (!metadata) throw new Error(`Agent '${name}' nao encontrado`);

    logger.info(`[AgentRegistry] Criando engine para: ${name}`);
    return createAgentFromFlow(
      { projectRoot: this.projectRoot, mcpConfigFile: this.mcpConfigFile, registry: this, layout: this.layout },
      metadata,
      telemetry
    );
  }
}
