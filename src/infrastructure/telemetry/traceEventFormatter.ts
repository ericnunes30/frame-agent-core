import type { TraceEvent } from '@ericnunes/frame-agent-sdk';

export type TraceFormatOptions = {
  verbose?: boolean;
};

const FLOW_LABELS: Record<string, string> = {
  'planner-flow': 'Agente-Planner',
  'implementer-flow': 'Agente-Executor',
};

function getAgentLabel(event: TraceEvent): string {
  const flowId = event.flow?.id;
  if (flowId && FLOW_LABELS[flowId]) return FLOW_LABELS[flowId];

  const agentLabel = event.agent?.label;
  if (agentLabel && agentLabel.trim().length > 0) return agentLabel;

  const agentId = event.agent?.id;
  if (agentId && agentId.trim().length > 0) return `[${agentId}]`;

  return 'Agente';
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return '{}';
  }
}

export function formatTraceEventForTerminal(event: TraceEvent, opts?: TraceFormatOptions): string[] {
  const verbose = Boolean(opts?.verbose);
  const label = getAgentLabel(event);

  if (event.type === 'tool_detected') {
    const thought = typeof event.data?.thoughtPreview === 'string' ? event.data.thoughtPreview : undefined;
    const toolName = event.tool?.name ?? 'unknown_tool';
    const params = event.tool?.params;

    if (toolName === 'final_answer') {
      return ['', `${label}:`, `   - Action: final_answer = ${safeJson(params)}`, ''];
    }

    if (toolName === 'ask_user') {
      const question = (params as any)?.question;
      if (typeof question === 'string' && question.trim().length > 0) {
        return ['', `${label}:`, `   Pergunta: ${question}`, ''];
      }
    }

    return [
      '',
      `${label}:`,
      `   Thought: ${thought && thought.trim().length > 0 ? thought : `Executando ferramenta ${toolName}`}`,
      `   - Action: ${toolName} = ${safeJson(params)}`,
      '',
    ];
  }

  if (event.type === 'tool_execution_failed') {
    const toolName = event.tool?.name ?? 'unknown_tool';
    const message = event.message ?? 'Unknown error';
    return ['', `${label}:`, `   Tool error: ${toolName}`, `   Message: ${message}`, ''];
  }

  if (verbose && (event.type === 'tool_execution_finished' || event.type === 'tool_execution_started')) {
    const toolName = event.tool?.name ?? 'unknown_tool';
    const duration = event.timing?.durationMs;
    const parts = [
      `[telemetry] ${label} ${event.type} tool=${toolName}`,
      duration != null ? `durationMs=${duration}` : undefined,
    ].filter(Boolean);
    return [parts.join(' ')];
  }

  if (verbose && (event.type === 'llm_request_started' || event.type === 'llm_request_finished' || event.type === 'llm_request_failed')) {
    const model = event.llm?.model ?? 'unknown';
    const duration = event.timing?.durationMs;
    const finishReason = event.llm?.finishReason;
    const usage = event.llm?.usage?.total;
    const parts = [
      `[telemetry] ${label} ${event.type} model=${model}`,
      duration != null ? `durationMs=${duration}` : undefined,
      usage != null ? `tokens=${usage}` : undefined,
      finishReason ? `finish=${finishReason}` : undefined,
    ].filter(Boolean);
    return [parts.join(' ')];
  }

  return [];
}
