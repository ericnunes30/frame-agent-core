export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

type Logger = {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 50,
};

function parseLevel(raw: string | undefined): LogLevel {
  const v = (raw ?? '').toLowerCase().trim();
  if (v === 'debug' || v === 'info' || v === 'warn' || v === 'error' || v === 'silent') return v;
  return 'info';
}

const CURRENT_LEVEL: LogLevel = parseLevel(process.env.FRAME_LOG_LEVEL);

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[CURRENT_LEVEL] && CURRENT_LEVEL !== 'silent';
}

function prefix(level: LogLevel): string {
  // Keep it predictable for grep.
  return `[frame-agent-core][${level}]`;
}

export const logger: Logger = {
  debug: (...args) => {
    if (!shouldLog('debug')) return;
    console.debug(prefix('debug'), ...args);
  },
  info: (...args) => {
    if (!shouldLog('info')) return;
    console.info(prefix('info'), ...args);
  },
  warn: (...args) => {
    if (!shouldLog('warn')) return;
    console.warn(prefix('warn'), ...args);
  },
  error: (...args) => {
    if (!shouldLog('error')) return;
    console.error(prefix('error'), ...args);
  },
};

