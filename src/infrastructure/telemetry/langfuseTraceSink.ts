import Langfuse, {
  type LangfuseGenerationClient,
  type LangfuseOptions,
  type LangfuseSpanClient,
  type LangfuseTraceClient,
} from 'langfuse';

import type { TraceEvent, TraceSink } from '@ericnunes/frame-agent-sdk';

export type LangfuseTraceSinkOptions = Pick<
  LangfuseOptions,
  | 'baseUrl'
  | 'additionalHeaders'
  | 'flushAt'
  | 'flushInterval'
  | 'fetchRetryCount'
  | 'fetchRetryDelay'
  | 'requestTimeout'
  | 'release'
  | 'sampleRate'
  | 'environment'
> & {
  publicKey: string;
  secretKey: string;
  enabled?: boolean;
  /**
   * Se true, chama `flush()` automaticamente ao receber `run_finished`.
   * Padrão: false.
   */
  flushOnRunFinished?: boolean;
};

function asDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : undefined;
}

function safeString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function safeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

type LangfuseMapValue = string | number | boolean | string[] | null;

function toLangfuseMapValue(value: unknown): LangfuseMapValue | undefined {
  if (value === null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    const strings = value
      .filter((v) => typeof v === 'string')
      .map((v) => v.trim())
      .filter(Boolean);
    return strings.length ? strings : undefined;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

function safeJson(value: unknown): unknown | undefined {
  if (value === undefined || value === null) return undefined;
  try {
    JSON.stringify(value);
    return value;
  } catch {
    return undefined;
  }
}

function safeStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const strings = value
      .filter((v) => typeof v === 'string')
      .map((v) => v.trim())
      .filter(Boolean);
    return strings.length ? strings : undefined;
  }

  if (typeof value === 'string') {
    const strings = value
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
    return strings.length ? strings : undefined;
  }

  return undefined;
}

function buildTraceName(event: TraceEvent): string {
  const flowId = event.flow?.id;
  const agentLabel = event.agent?.label ?? event.agent?.id;
  if (flowId) return `flow:${flowId}`;
  if (agentLabel) return `agent:${agentLabel}`;
  return 'run';
}

function buildSpanName(event: TraceEvent): string {
  if (event.node?.id) return `node:${event.node.id}`;
  if (event.tool?.name) return `tool:${event.tool.name}`;
  if (event.step?.name) return `step:${event.step.name}`;
  if (event.llm?.model) return `llm:${event.llm.model}`;
  return event.type;
}

type ParentClient = LangfuseTraceClient | LangfuseSpanClient;

function buildTraceMetadata(event: TraceEvent): Record<string, unknown> {
  return {
    orchestrator: event.orchestrator,
    ...(event.parentRunId ? { parentRunId: event.parentRunId } : {}),
    ...(event.agent ? { agent: event.agent } : {}),
    ...(event.flow ? { flow: event.flow } : {}),
  };
}

function extractTraceUpdateFields(event: TraceEvent): {
  input?: unknown;
  output?: unknown;
  tags?: string[];
  sessionId?: string;
  userId?: string;
} {
  const data = event.data as Record<string, unknown> | undefined;

  const tags = safeStringArray(data?.tags ?? data?.traceTags ?? data?.langfuseTags);
  const input = safeJson(data?.input ?? data?.traceInput);
  const output = safeJson(data?.output ?? data?.traceOutput);
  const sessionId = safeString(data?.sessionId ?? data?.session_id);
  const userId = safeString(data?.userId ?? data?.user_id);

  return {
    ...(input !== undefined ? { input } : {}),
    ...(output !== undefined ? { output } : {}),
    ...(tags ? { tags } : {}),
    ...(sessionId ? { sessionId } : {}),
    ...(userId ? { userId } : {}),
  };
}

function extractGenerationModelParameters(
  event: TraceEvent,
): Record<string, LangfuseMapValue> | undefined {
  const data = event.data as Record<string, unknown> | undefined;
  if (!data) return undefined;

  const raw: Record<string, unknown> = {};

  if (data.modelParameters && typeof data.modelParameters === 'object' && !Array.isArray(data.modelParameters)) {
    Object.assign(raw, data.modelParameters as Record<string, unknown>);
  }

  const temperature = safeNumber(data.temperature);
  const maxTokens = safeNumber(data.maxTokens ?? data.max_tokens);
  const topP = safeNumber(data.topP ?? data.top_p);
  const presencePenalty = safeNumber(data.presencePenalty ?? data.presence_penalty);
  const frequencyPenalty = safeNumber(data.frequencyPenalty ?? data.frequency_penalty);
  const seed = safeNumber(data.seed);

  if (temperature !== undefined) raw.temperature = temperature;
  if (maxTokens !== undefined) raw.max_tokens = maxTokens;
  if (topP !== undefined) raw.top_p = topP;
  if (presencePenalty !== undefined) raw.presence_penalty = presencePenalty;
  if (frequencyPenalty !== undefined) raw.frequency_penalty = frequencyPenalty;
  if (seed !== undefined) raw.seed = seed;

  const sanitized: Record<string, LangfuseMapValue> = {};
  for (const [key, value] of Object.entries(raw)) {
    const mapValue = toLangfuseMapValue(value);
    if (mapValue !== undefined) sanitized[key] = mapValue;
  }

  return Object.keys(sanitized).length ? sanitized : undefined;
}

/**
 * `TraceSink` para enviar os eventos do SDK ao Langfuse.
 *
 * Observação: esta integração vive no core (opinioso) para manter o SDK agnóstico de vendors.
 */
export class LangfuseTraceSink implements TraceSink {
  private readonly enabled: boolean;
  private readonly flushOnRunFinished: boolean;
  private readonly client?: Langfuse;

  private readonly traces = new Map<string, LangfuseTraceClient>();
  private readonly spans = new Map<string, LangfuseSpanClient>();
  private readonly generations = new Map<string, LangfuseGenerationClient>();
  private readonly activeSpanStackByRun = new Map<string, string[]>();
  private readonly traceInputSetByRun = new Set<string>();

  constructor(options: LangfuseTraceSinkOptions) {
    this.enabled = options.enabled ?? true;
    this.flushOnRunFinished = options.flushOnRunFinished ?? false;

    if (!this.enabled) return;

    if (!options.publicKey || !options.secretKey) {
      throw new Error('[LangfuseTraceSink] publicKey e secretKey são obrigatórios quando enabled=true.');
    }

    this.client = new Langfuse({
      publicKey: options.publicKey,
      secretKey: options.secretKey,
      persistence: 'memory',
      enabled: this.enabled,
      baseUrl: options.baseUrl,
      additionalHeaders: options.additionalHeaders,
      flushAt: options.flushAt,
      flushInterval: options.flushInterval,
      fetchRetryCount: options.fetchRetryCount,
      fetchRetryDelay: options.fetchRetryDelay,
      requestTimeout: options.requestTimeout,
      release: options.release,
      sampleRate: options.sampleRate,
      environment: options.environment,
    });
  }

  emit(event: TraceEvent): void {
    if (!this.enabled || !this.client) return;

    try {
      switch (event.type) {
        case 'run_started':
          this.onRunStarted(event);
          return;
        case 'run_finished':
          this.onRunFinished(event);
          return;

        case 'node_started':
        case 'step_started':
        case 'tool_execution_started':
          this.onSpanStarted(event);
          return;
        case 'node_finished':
        case 'step_finished':
        case 'tool_execution_finished':
          this.onSpanFinished(event);
          return;
        case 'node_error':
        case 'step_error':
        case 'tool_execution_failed':
          this.onSpanFailed(event);
          return;

        case 'llm_request_started':
          this.onGenerationStarted(event);
          return;
        case 'llm_request_finished':
          this.onGenerationFinished(event);
          return;
        case 'llm_request_failed':
          this.onGenerationFailed(event);
          return;

        // Eventos informativos que não mapeiam diretamente para observações do Langfuse.
        case 'tool_detected':
        default:
          return;
      }
    } catch {
      // Telemetria nunca deve derrubar o fluxo de execução.
      return;
    }
  }

  async flush(): Promise<void> {
    if (!this.enabled || !this.client) return;
    await this.client.flushAsync();
  }

  private getOrCreateTrace(event: TraceEvent): LangfuseTraceClient {
    const existing = this.traces.get(event.runId);
    if (existing) return existing;

    const updateFields = extractTraceUpdateFields(event);

    const trace = this.client!.trace({
      id: event.runId,
      name: buildTraceName(event),
      timestamp: asDate(event.ts) ?? new Date(),
      ...updateFields,
      metadata: {
        ...buildTraceMetadata(event),
      },
    });

    this.traces.set(event.runId, trace);
    if (updateFields.input !== undefined) this.traceInputSetByRun.add(event.runId);
    return trace;
  }

  private getParentClient(event: TraceEvent): ParentClient {
    const trace = this.getOrCreateTrace(event);

    // parentSpanId explícito (se existir)
    if (event.parentSpanId) {
      const parent = this.spans.get(event.parentSpanId);
      if (parent) return parent;
    }

    // caso padrão: topo do stack do runId
    const stack = this.activeSpanStackByRun.get(event.runId);
    const top = stack?.length ? stack[stack.length - 1] : undefined;
    if (top) {
      const parent = this.spans.get(top);
      if (parent) return parent;
    }

    return trace;
  }

  private onRunStarted(event: TraceEvent): void {
    const trace = this.getOrCreateTrace(event);
    const updateFields = extractTraceUpdateFields(event);
    trace.update({
      name: buildTraceName(event),
      timestamp: asDate(event.ts) ?? new Date(),
      ...updateFields,
      metadata: {
        ...buildTraceMetadata(event),
        ...(event.data ? { data: event.data } : {}),
      },
    });
    if (updateFields.input !== undefined) this.traceInputSetByRun.add(event.runId);
  }

  private onRunFinished(event: TraceEvent): void {
    const trace = this.getOrCreateTrace(event);
    const updateFields = extractTraceUpdateFields(event);

    trace.update({
      ...updateFields,
      metadata: {
        ...buildTraceMetadata(event),
        ...(event.data ? { data: event.data } : {}),
        ...(event.timing ? { timing: event.timing } : {}),
        status: (event.data as Record<string, unknown> | undefined)?.status,
      },
    });

    this.activeSpanStackByRun.delete(event.runId);
    this.traces.delete(event.runId);
    this.traceInputSetByRun.delete(event.runId);

    if (this.flushOnRunFinished) {
      void this.flush();
    }
  }

  private onSpanStarted(event: TraceEvent): void {
    const spanId = safeString(event.spanId) ?? safeString(event.tool?.toolCallId);
    if (!spanId) return;

    const parentClient = this.getParentClient(event);
    const span = parentClient.span({
      id: spanId,
      name: buildSpanName(event),
      startTime: asDate(event.ts) ?? new Date(),
      input:
        event.tool?.params !== undefined
          ? event.tool.params
          : event.node?.id
            ? { nodeId: event.node.id }
            : event.step
              ? event.step
              : undefined,
      metadata: {
        sdkEventType: event.type,
        level: event.level,
        ...(event.tool?.name ? { toolName: event.tool.name } : {}),
      },
    } as any);

    this.spans.set(spanId, span);

    if (event.type === 'node_started' || event.type === 'step_started') {
      const stack = this.activeSpanStackByRun.get(event.runId) ?? [];
      stack.push(spanId);
      this.activeSpanStackByRun.set(event.runId, stack);
    }
  }

  private onSpanFinished(event: TraceEvent): void {
    const spanId = safeString(event.spanId) ?? safeString(event.tool?.toolCallId);
    if (!spanId) return;

    const span = this.spans.get(spanId);
    if (!span) return;

    span.end({
      endTime: asDate(event.ts) ?? new Date(),
      output: event.tool?.observationPreview ?? event.message,
      metadata: {
        ...(event.data ? { data: event.data } : {}),
        ...(event.timing ? { timing: event.timing } : {}),
      },
    } as any);

    this.spans.delete(spanId);

    if (event.type === 'node_finished' || event.type === 'step_finished') {
      this.removeFromStack(event.runId, spanId);
    }
  }

  private onSpanFailed(event: TraceEvent): void {
    const spanId = safeString(event.spanId) ?? safeString(event.tool?.toolCallId);
    if (!spanId) return;

    const span = this.spans.get(spanId);
    if (!span) return;

    span.end({
      endTime: asDate(event.ts) ?? new Date(),
      statusMessage: event.message ?? 'span_failed',
      level: 'ERROR',
      metadata: {
        ...(event.data ? { data: event.data } : {}),
        ...(event.timing ? { timing: event.timing } : {}),
      },
    } as any);

    this.spans.delete(spanId);

    if (event.type === 'node_error' || event.type === 'step_error') {
      this.removeFromStack(event.runId, spanId);
    }
  }

  private onGenerationStarted(event: TraceEvent): void {
    const genId = safeString(event.spanId);
    if (!genId) return;

    const data = event.data as Record<string, unknown> | undefined;

    // If prompts are enabled and we don't have an explicit trace input, use the prompt as trace.input
    // to improve the trace overview in Langfuse UI.
    if (!this.traceInputSetByRun.has(event.runId)) {
      const traceInput = safeJson(data?.prompt);
      if (traceInput !== undefined) {
        const trace = this.getOrCreateTrace(event);
        trace.update({ input: traceInput });
        this.traceInputSetByRun.add(event.runId);
      }
    }

    const parentClient = this.getParentClient(event);
    const generation = parentClient.generation({
      id: genId,
      name: buildSpanName(event),
      startTime: asDate(event.ts) ?? new Date(),
      model: event.llm?.model,
      input: safeJson(data?.prompt),
      modelParameters: extractGenerationModelParameters(event),
      metadata: {
        sdkEventType: event.type,
        provider: event.llm?.provider,
        stream: event.llm?.stream,
        ...(event.data ? { data: event.data } : {}),
      },
    } as any);

    this.generations.set(genId, generation);
  }

  private onGenerationFinished(event: TraceEvent): void {
    const genId = safeString(event.spanId);
    if (!genId) return;
    const generation = this.generations.get(genId);
    if (!generation) return;

    const usage = event.llm?.usage;
    const data = event.data as Record<string, unknown> | undefined;
    const output = safeJson(data?.output ?? data?.outputPreview);

    generation.end({
      endTime: asDate(event.ts) ?? new Date(),
      ...(output !== undefined ? { output } : {}),
      usage:
        usage && (usage.prompt || usage.completion || usage.total)
          ? {
              promptTokens: safeNumber(usage.prompt) ?? null,
              completionTokens: safeNumber(usage.completion) ?? null,
              totalTokens: safeNumber(usage.total) ?? null,
            }
          : undefined,
      metadata: {
        sdkEventType: event.type,
        finishReason: event.llm?.finishReason,
        ...(event.data ? { data: event.data } : {}),
        ...(event.timing ? { timing: event.timing } : {}),
      },
    } as any);

    // If output is available (e.g., includePrompts=true), update trace.output for better browsing in Langfuse UI.
    if (output !== undefined) {
      const trace = this.traces.get(event.runId) ?? this.getOrCreateTrace(event);
      trace.update({ output });
    }

    this.generations.delete(genId);
  }

  private onGenerationFailed(event: TraceEvent): void {
    const genId = safeString(event.spanId);
    if (!genId) return;
    const generation = this.generations.get(genId);
    if (!generation) return;

    generation.end({
      endTime: asDate(event.ts) ?? new Date(),
      statusMessage: event.message ?? 'llm_request_failed',
      level: 'ERROR',
      metadata: {
        ...(event.data ? { data: event.data } : {}),
        ...(event.timing ? { timing: event.timing } : {}),
      },
    } as any);

    this.generations.delete(genId);
  }

  private removeFromStack(runId: string, spanId: string): void {
    const stack = this.activeSpanStackByRun.get(runId);
    if (!stack?.length) return;
    const idx = stack.lastIndexOf(spanId);
    if (idx === -1) return;
    stack.splice(idx, 1);
    if (stack.length === 0) this.activeSpanStackByRun.delete(runId);
    else this.activeSpanStackByRun.set(runId, stack);
  }
}

export function createLangfuseTraceSinkFromEnv(
  opts?: Omit<Partial<LangfuseTraceSinkOptions>, 'publicKey' | 'secretKey'>,
): LangfuseTraceSink | undefined {
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY ?? process.env.LANGFUSE_PUBLICKEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY ?? process.env.LANGFUSE_SECRETKEY;
  if (!publicKey || !secretKey) return undefined;

  const baseUrl = process.env.LANGFUSE_BASEURL ?? process.env.LANGFUSE_BASE_URL;
  return new LangfuseTraceSink({
    publicKey,
    secretKey,
    ...(baseUrl ? { baseUrl } : {}),
    ...(opts ?? {}),
  } as LangfuseTraceSinkOptions);
}
