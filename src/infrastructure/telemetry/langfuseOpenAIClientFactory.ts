import { observeOpenAI } from 'langfuse';
import type {
  RuntimeNativeLlmTelemetryConfig,
  RuntimeOpenAIClientFactory,
  RuntimeOpenAIClientFactoryArgs,
} from '../../runtime/types';

type FlushableNativeOpenAIClient = {
  flushAsync?: () => Promise<unknown>;
};

let nativeOpenAIFlushRef: (() => Promise<unknown>) | undefined;

function registerNativeOpenAIFlush(client: unknown): void {
  if (!client || typeof client !== 'object') return;
  const flushAsync = (client as FlushableNativeOpenAIClient).flushAsync;
  if (typeof flushAsync !== 'function') return;
  nativeOpenAIFlushRef = flushAsync.bind(client);
}

export async function flushLangfuseNativeOpenAIClient(): Promise<void> {
  if (!nativeOpenAIFlushRef) return;
  try {
    await nativeOpenAIFlushRef();
  } catch {
    // Best-effort: telemetria não deve interromper fluxo principal.
  }
}

export type LangfuseOpenAIClientFactoryOptions = {
  enabled?: boolean;
  defaultTags?: string[];
  defaultMetadata?: Record<string, unknown>;
  clientInitParams?: {
    publicKey?: string;
    secretKey?: string;
    baseUrl?: string;
    environment?: string;
    release?: string;
    mask?: (params: { data: unknown }) => unknown;
    [key: string]: unknown;
  };
};

function safeString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value == null) return defaultValue;
  if (value === '1') return true;
  if (value === '0') return false;
  return value.toLowerCase() === 'true';
}

function splitCsv(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const items = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? [...new Set(items)] : undefined;
}

function sanitizeMultimodalNullData(value: unknown, depth = 0): unknown {
  if (depth > 12) return value;
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item) => sanitizeMultimodalNullData(item, depth + 1));
  if (typeof value !== 'object') return value;

  const input = value as Record<string, unknown>;
  let changed = false;
  const output: Record<string, unknown> = {};

  for (const [key, raw] of Object.entries(input)) {
    if ((key === 'input_audio' || key === 'audio') && raw === null) {
      changed = true;
      continue;
    }

    const sanitized = sanitizeMultimodalNullData(raw, depth + 1);
    output[key] = sanitized;
    if (sanitized !== raw) changed = true;
  }

  return changed ? output : value;
}

function createSafeMask(userMask?: (params: { data: unknown }) => unknown): (params: { data: unknown }) => unknown {
  return ({ data }) => {
    const sanitized = sanitizeMultimodalNullData(data);
    if (!userMask) return sanitized;

    try {
      return userMask({ data: sanitized });
    } catch {
      return sanitized;
    }
  };
}

function buildClientInitParams(
  raw?: LangfuseOpenAIClientFactoryOptions['clientInitParams'],
): Record<string, unknown> {
  const params: Record<string, unknown> = {
    mask: createSafeMask(typeof raw?.mask === 'function' ? raw.mask : undefined),
  };
  if (!raw) return params;

  const publicKey = safeString(raw.publicKey);
  const secretKey = safeString(raw.secretKey);
  const baseUrl = safeString(raw.baseUrl);
  const environment = safeString(raw.environment);
  const release = safeString(raw.release);
  if (publicKey) params.publicKey = publicKey;
  if (secretKey) params.secretKey = secretKey;
  if (baseUrl) params.baseUrl = baseUrl;
  if (environment) params.environment = environment;
  if (release) params.release = release;
  return params;
}

export function createLangfuseNativeLlmTelemetryConfig(enabled: boolean): RuntimeNativeLlmTelemetryConfig | undefined {
  if (!enabled) return undefined;
  return {
    enabled: true,
    provider: 'langfuse',
    integration: 'openai',
  };
}

export function createLangfuseOpenAIClientFactory(
  opts?: LangfuseOpenAIClientFactoryOptions,
): RuntimeOpenAIClientFactory | undefined {
  const enabled = opts?.enabled ?? true;
  if (!enabled) return undefined;

  const defaultTags = opts?.defaultTags?.filter((item) => typeof item === 'string' && item.trim().length > 0);
  const defaultMetadata = opts?.defaultMetadata ?? {};
  const clientInitParams = buildClientInitParams(opts?.clientInitParams);

  return ({ createDefaultClient, traceContext, providerName, model }: RuntimeOpenAIClientFactoryArgs) => {
    const client = createDefaultClient();

    const metadata: Record<string, unknown> = {
      ...defaultMetadata,
      providerName,
      ...(model ? { model } : {}),
      ...(traceContext?.agent ? { agent: traceContext.agent } : {}),
      ...(traceContext?.flow ? { flow: traceContext.flow } : {}),
      ...(traceContext?.parentRunId ? { parentRunId: traceContext.parentRunId } : {}),
      ...(traceContext?.sessionId ? { sessionId: traceContext.sessionId } : {}),
      ...(traceContext?.userId ? { userId: traceContext.userId } : {}),
    };

    const traceName =
      traceContext?.flow?.id
        ? `flow:${traceContext.flow.id}`
        : traceContext?.agent?.label || traceContext?.agent?.id
          ? `agent:${traceContext?.agent?.label ?? traceContext?.agent?.id}`
          : undefined;

    const langfuseConfig: Record<string, unknown> = {
      ...(traceContext?.runId ? { traceId: traceContext.runId } : {}),
      ...(traceName ? { traceName } : {}),
      ...(traceContext?.sessionId ? { sessionId: traceContext.sessionId } : {}),
      ...(traceContext?.userId ? { userId: traceContext.userId } : {}),
      ...(defaultTags && defaultTags.length > 0 ? { tags: defaultTags } : {}),
      ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
      ...(clientInitParams ? { clientInitParams } : {}),
    };

    const observedClient = observeOpenAI(client as any, langfuseConfig as any);
    registerNativeOpenAIFlush(observedClient);
    return observedClient;
  };
}

export function createLangfuseOpenAIClientFactoryFromEnv(
  opts?: Omit<LangfuseOpenAIClientFactoryOptions, 'clientInitParams' | 'defaultTags'> & { defaultTags?: string[] },
): RuntimeOpenAIClientFactory | undefined {
  const enabled =
    opts?.enabled ??
    readBool(process.env.LANGFUSE_OPENAI_NATIVE_ENABLED ?? process.env.LANGFUSE_NATIVE_OPENAI_ENABLED, true);
  if (!enabled) return undefined;

  const publicKey = process.env.LANGFUSE_PUBLIC_KEY ?? process.env.LANGFUSE_PUBLICKEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY ?? process.env.LANGFUSE_SECRETKEY;
  if (!safeString(publicKey) || !safeString(secretKey)) return undefined;

  const baseUrl = process.env.LANGFUSE_BASEURL ?? process.env.LANGFUSE_BASE_URL ?? process.env.LANGFUSE_HOST;
  const environment = process.env.LANGFUSE_ENVIRONMENT;
  const release = process.env.LANGFUSE_RELEASE;
  const envTags = splitCsv(process.env.LANGFUSE_OPENAI_TAGS);

  return createLangfuseOpenAIClientFactory({
    enabled: true,
    defaultMetadata: opts?.defaultMetadata,
    defaultTags: opts?.defaultTags ?? envTags,
    clientInitParams: {
      publicKey,
      secretKey,
      baseUrl,
      environment,
      release,
    },
  });
}
