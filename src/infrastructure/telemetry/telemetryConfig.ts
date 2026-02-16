import type { TelemetryOptions, TraceSink } from '@ericnunes/frame-agent-sdk';
import { MultiplexTraceSink } from '@ericnunes/frame-agent-sdk';
import { ConsoleTraceSink } from './traceSinkConsole';

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
}): { trace: TraceSink; telemetry: TelemetryOptions; verbose: boolean } {
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
  const trace = new MultiplexTraceSink([consoleSink]);

  return { trace, telemetry, verbose };
}
