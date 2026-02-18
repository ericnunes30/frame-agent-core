import { randomUUID } from 'crypto';

export type SessionTelemetryContext = {
  sessionId: string;
  userId?: string;
};

function readString(value: string | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function resolveSessionTelemetryContext(input?: {
  sessionId?: string;
  userId?: string;
}): SessionTelemetryContext {
  const sessionId =
    readString(input?.sessionId) ??
    readString(process.env.FRAME_SESSION_ID) ??
    readString(process.env.LANGFUSE_SESSION_ID) ??
    randomUUID();

  const userId =
    readString(input?.userId) ??
    readString(process.env.FRAME_USER_ID) ??
    readString(process.env.LANGFUSE_USER_ID);

  return userId ? { sessionId, userId } : { sessionId };
}
