const LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4,
} as const;

type LogLevel = keyof typeof LEVELS;

function parseLevel(raw: string | undefined): LogLevel {
  const normalized = raw?.toLowerCase().trim();
  if (normalized && normalized in LEVELS) return normalized as LogLevel;
  return "info";
}

const currentLevel = parseLevel(process.env.LOG_LEVEL);
const threshold = LEVELS[currentLevel];

function timestamp(): string {
  return new Date().toISOString();
}

function log(level: LogLevel, tag: string, message: string, meta?: unknown): void {
  if (LEVELS[level] > threshold) return;

  const prefix = `${timestamp()} [${level.toUpperCase()}] [${tag}]`;
  const out = level === "error" || level === "warn" ? console.error : console.log;

  if (meta !== undefined) {
    out(`${prefix} ${message}`, meta);
  } else {
    out(`${prefix} ${message}`);
  }
}

export const logger = {
  error: (tag: string, message: string, meta?: unknown) => log("error", tag, message, meta),
  warn: (tag: string, message: string, meta?: unknown) => log("warn", tag, message, meta),
  info: (tag: string, message: string, meta?: unknown) => log("info", tag, message, meta),
  debug: (tag: string, message: string, meta?: unknown) => log("debug", tag, message, meta),
  trace: (tag: string, message: string, meta?: unknown) => log("trace", tag, message, meta),
  level: currentLevel,
};
