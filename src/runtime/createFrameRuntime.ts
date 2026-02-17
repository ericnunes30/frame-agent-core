import * as fs from 'fs';
import { resolve } from 'path';
import type { IGraphState, Message } from '@ericnunes/frame-agent-sdk';
import { AgentRegistry } from '../agents';
import { initializeTools } from '../tools/registry/ToolInitializer';
import { logger } from '../infrastructure/logging/logger';
import { resolveSessionTelemetryContext } from '../infrastructure/telemetry/sessionContext';
import type { FrameRuntime, FrameRuntimeOptions, FrameRunResult, RuntimeTelemetryConfig } from './types';
import { resolveProjectLayout } from './layout';

type RunStoreEntry = {
  agentId: string;
  state: IGraphState;
};

export async function createFrameRuntime(options: FrameRuntimeOptions): Promise<FrameRuntime> {
  const projectRoot = resolve(options.projectRoot);
  if (!fs.existsSync(projectRoot)) {
    throw new Error(`projectRoot nao existe: ${projectRoot}`);
  }

  const layoutResolved = resolveProjectLayout(projectRoot, options.layout);

  const shouldChdir = options.chdirToProjectRoot !== false;
  if (shouldChdir) {
    try {
      if (process.cwd() !== projectRoot) process.chdir(projectRoot);
    } catch (error) {
      logger.warn('[createFrameRuntime] Falha ao chdir para projectRoot:', error);
    }
  }

  await initializeTools({
    projectRoot,
    profile: options.profile,
    allowAskUser: options.tools?.allowAskUser,
    excludedTools: options.tools?.excludedTools,
    mcp: {
      enabled: options.mcp?.enabled,
      configFile: options.mcp?.configFile ?? layoutResolved.mcpConfigFile,
      aliasMode: options.mcp?.aliasMode,
    },
    skills: {
      dir: layoutResolved.skillsDir,
    },
  });

  const agentsDirs =
    options.agents?.dirs ?? (options.agents?.dir ? [options.agents.dir] : [layoutResolved.agentsDir]);
  const mcpConfigFile = options.mcp?.configFile ?? layoutResolved.mcpConfigFile;

  const registry = new AgentRegistry({
    projectRoot,
    agentsDirs,
    mcpConfigFile,
    layout: layoutResolved,
  });

  await registry.load();

  const runs = new Map<string, RunStoreEntry>();
  const resolveTelemetry = (override?: RuntimeTelemetryConfig): RuntimeTelemetryConfig | undefined =>
    override ?? options.telemetry;

  async function run(args: {
    agentId: string;
    input: string;
    sessionId?: string;
    userId?: string;
    parentRunId?: string;
    initialState?: Partial<IGraphState>;
  }): Promise<FrameRunResult> {
    const engine = await registry.createEngine(args.agentId, resolveTelemetry());

    const baseMessages = args.initialState?.messages?.length
      ? (args.initialState.messages as any)
      : ([{ role: 'user', content: args.input }] as any);

    const initialMetadata = { ...(args.initialState?.metadata as any) } as Record<string, unknown>;
    const sessionContext = resolveSessionTelemetryContext({
      sessionId: args.sessionId ?? (initialMetadata.sessionId as string | undefined),
      userId: args.userId ?? (initialMetadata.userId as string | undefined),
    });

    const initial: IGraphState = {
      ...(args.initialState as any),
      messages: baseMessages,
      metadata: {
        ...initialMetadata,
        sessionId: sessionContext.sessionId,
        ...(sessionContext.userId ? { userId: sessionContext.userId } : {}),
        ...(args.parentRunId ? { parentRunId: args.parentRunId } : {}),
      },
    } as any;

    const result = await engine.execute(initial);
    const runId = (result.state.metadata as any)?.runId as string | undefined;
    if (runId) {
      runs.set(runId, { agentId: args.agentId, state: result.state });
    }

    return { ...result, runId: runId ?? '', agentId: args.agentId };
  }

  async function resume(args: { runId: string; input: string }): Promise<FrameRunResult> {
    const entry = runs.get(args.runId);
    if (!entry) throw new Error(`runId nao encontrado no runtime: ${args.runId}`);

    const engine = await registry.createEngine(entry.agentId, resolveTelemetry());
    const userInput: Message = { role: 'user', content: args.input } as any;
    const result = await engine.resume(entry.state, userInput);

    const runId = (result.state.metadata as any)?.runId as string | undefined;
    if (runId) runs.set(runId, { agentId: entry.agentId, state: result.state });

    return { ...result, runId: runId ?? args.runId, agentId: entry.agentId };
  }

  async function resumeFromState(args: { agentId: string; state: IGraphState; userInput?: Message }): Promise<FrameRunResult> {
    const engine = await registry.createEngine(args.agentId, resolveTelemetry());
    const result = await engine.resume(args.state, args.userInput);
    const runId = (result.state.metadata as any)?.runId as string | undefined;
    if (runId) runs.set(runId, { agentId: args.agentId, state: result.state });
    return { ...result, runId: runId ?? '', agentId: args.agentId };
  }

  return {
    listAgents: () => registry.listSummaries(),
    getAgentMetadata: (agentId: string) => registry.getMetadata(agentId),
    createEngine: async (agentId: string, telemetry?: RuntimeTelemetryConfig) =>
      registry.createEngine(agentId, resolveTelemetry(telemetry)),
    run,
    resume,
    resumeFromState,
  };
}
