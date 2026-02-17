import type {
  TelemetryOptions,
  TraceSink,
} from '@ericnunes/frame-agent-sdk';
import { MultiplexTraceSink } from '@ericnunes/frame-agent-sdk';
import { ConsoleTraceSink } from './traceSinkConsole';
import { createLangfuseTraceSinkFromEnv } from './langfuseTraceSink';
import {
  createLangfuseNativeLlmTelemetryConfig,
  createLangfuseOpenAIClientFactoryFromEnv,
} from './langfuseOpenAIClientFactory';
import type { RuntimeOpenAIClientFactory, RuntimeNativeLlmTelemetryConfig } from '../../runtime/types';

type TelemetryLevel = 'info' | 'debug';

function readBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value == null) return defaultValue;
  if (value === '1') return true;
  if (value === '0') return false;
  return value.toLowerCase() === 'true';
}

function readLevel(raw: string | undefined, fallback: TelemetryLevel): TelemetryLevel {
  const v = (raw ?? '').toLowerCase();
  return v === 'debug' || v === 'info' ? v : fallback;
}

export function createDefaultTelemetry(opts?: {
  enabled?: boolean;
  verbose?: boolean;
  level?: TelemetryLevel;
  includePrompts?: boolean;
  maxPayloadChars?: number;
  maxEvents?: number;
  langfuse?: {
    enabled?: boolean;
    flushOnRunFinished?: boolean;
    nativeOpenAIEnabled?: boolean;
  };
}): {
  trace: TraceSink;
  telemetry: TelemetryOptions;
  verbose: boolean;
  openAIClientFactory?: RuntimeOpenAIClientFactory;
  nativeLlmTelemetry?: RuntimeNativeLlmTelemetryConfig;
} {
  const enabled = opts?.enabled ?? readBool(process.env.TELEMETRY_ENABLED, true);
  const verbose = opts?.verbose ?? readBool(process.env.TELEMETRY_VERBOSE, readBool(process.env.DEBUG, false));
  const level = opts?.level ?? readLevel(process.env.TELEMETRY_LEVEL, verbose ? 'debug' : 'info');

  const telemetry: TelemetryOptions = {
    enabled,
    level,
    persistToState: false,
    includePrompts: opts?.includePrompts ?? false,
    maxPayloadChars: opts?.maxPayloadChars ?? 4000,
    maxEvents: opts?.maxEvents ?? 200,
  };

  const consoleSink = new ConsoleTraceSink({ verbose });

  const sinks: TraceSink[] = [consoleSink];
  const langfuseEnabled = opts?.langfuse?.enabled ?? readBool(process.env.LANGFUSE_ENABLED, true);
  if (enabled && langfuseEnabled) {
    const langfuseSink = createLangfuseTraceSinkFromEnv({
      enabled: true,
      flushOnRunFinished: opts?.langfuse?.flushOnRunFinished ?? true,
    });
    if (langfuseSink) sinks.push(langfuseSink);
  }

  const nativeOpenAIEnabled =
    opts?.langfuse?.nativeOpenAIEnabled ??
    readBool(process.env.LANGFUSE_OPENAI_NATIVE_ENABLED ?? process.env.LANGFUSE_NATIVE_OPENAI_ENABLED, true);
  const openAIClientFactory =
    enabled && nativeOpenAIEnabled
      ? createLangfuseOpenAIClientFactoryFromEnv({ enabled: true })
      : undefined;
  const nativeLlmTelemetry = createLangfuseNativeLlmTelemetryConfig(Boolean(openAIClientFactory));

  const trace = new MultiplexTraceSink(sinks);

  return {
    trace,
    telemetry,
    verbose,
    ...(openAIClientFactory ? { openAIClientFactory } : {}),
    ...(nativeLlmTelemetry ? { nativeLlmTelemetry } : {}),
  };
}
