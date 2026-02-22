import { ToolBase, type IToolParams } from '@ericnunes/frame-agent-sdk';

interface TimeNowParams extends IToolParams {
  /**
   * Optional IANA timezone (best-effort). If omitted, uses host local timezone.
   * Examples: "America/Sao_Paulo", "UTC"
   */
  timeZone?: string;
}

class TimeNowSchema {
  static schemaProperties = {
    timeZone: { type: 'string', required: false, description: 'Optional IANA timezone (default: host local timezone)' },
  } as const;
}

type TimeNowResult = {
  nowIsoUtc: string;
  nowLocal: string;
  todayLocal: string;
  weekdayLocal: string;
  timeZone?: string;
  timezoneOffsetMinutes: number;
  epochMs: number;
};

function safeLocalDateTime(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
}

function safeLocalDate(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function safeLocalWeekday(now: Date): string {
  const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return weekdays[now.getDay()] ?? 'Unknown';
}

export function createTimeNowTool() {
  return new (class extends ToolBase<TimeNowParams, TimeNowResult> {
    public readonly name = 'time_now';
    public readonly description =
      'Returns current time context from the host (UTC + local). Use this before interpreting "today", "tomorrow", "now".';
    public readonly parameterSchema = TimeNowSchema;

    public async execute(params: TimeNowParams): Promise<TimeNowResult> {
      const now = new Date();
      const epochMs = now.getTime();
      const timezoneOffsetMinutes = -now.getTimezoneOffset();

      // Best-effort support for requested timezone (kept as metadata; formatting stays stable and ASCII).
      const timeZone = typeof params.timeZone === 'string' && params.timeZone.trim().length ? params.timeZone.trim() : undefined;

      return {
        nowIsoUtc: now.toISOString(),
        nowLocal: safeLocalDateTime(now),
        todayLocal: safeLocalDate(now),
        weekdayLocal: safeLocalWeekday(now),
        ...(timeZone ? { timeZone } : {}),
        timezoneOffsetMinutes,
        epochMs,
      };
    }
  })();
}

