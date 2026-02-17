import type { GraphEngine, GraphRunResult, Message, TelemetryOptions, IGraphState } from '@ericnunes/frame-agent-sdk';
import type { IAgentMetadata, IAgentMetadataSummary } from '../agents/interfaces/agentMetadata.interface';
import type { McpAliasMode } from '../tools/mcp/register';
import type { FrameProjectLayout } from './layout';

export type RuntimeProfile = 'safe_readonly' | 'developer_write' | 'developer_exec' | 'ci_headless';

export type FrameRuntimeOptions = {
  projectRoot: string;
  profile: RuntimeProfile;
  /**
   * Muitos tools do SDK resolvem caminhos relativos usando process.cwd().
   * Para o comportamento "CLI-like", habilite este modo.
   */
  chdirToProjectRoot?: boolean;

  agents?: {
    // Diretórios a serem varridos em ordem (ex.: built-ins primeiro, depois dir configurado).
    dirs?: string[];
    // Alias para um único diretório.
    dir?: string;
  };

  mcp?: {
    enabled?: boolean;
    configFile?: string; // default: ".agents/mcp.json" (legacy: ".code/mcp.json")
    aliasMode?: McpAliasMode; // default: "stripNamespace"
  };

  tools?: {
    allowAskUser?: boolean;
    excludedTools?: string[];
  };

  /**
   * Layout de projeto (convencoes de caminhos). Default: equivalente a ".agents/*" (auto-detect legacy ".code/*").
   */
  layout?: Partial<FrameProjectLayout>;

  telemetry?: {
    trace: any;
    telemetry: TelemetryOptions;
  };
};

export type FrameRunResult = GraphRunResult & {
  runId: string;
  agentId: string;
};

export interface FrameRuntime {
  listAgents(): IAgentMetadataSummary[];
  getAgentMetadata(agentId: string): IAgentMetadata | undefined;

  createEngine(agentId: string): Promise<GraphEngine>;

  run(args: {
    agentId: string;
    input: string;
    sessionId?: string;
    parentRunId?: string;
    initialState?: Partial<IGraphState>;
  }): Promise<FrameRunResult>;

  resume(args: {
    runId: string;
    input: string;
  }): Promise<FrameRunResult>;

  resumeFromState(args: {
    agentId: string;
    state: IGraphState;
    userInput?: Message;
  }): Promise<FrameRunResult>;
}
