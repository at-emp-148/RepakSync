import fs from "node:fs";
import path from "node:path";

type LogLevel = "info" | "warn" | "error" | "debug";

export function getLogPath(): string {
  const base = resolveUserDataPath();
  const dir = path.join(base, "logs");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "steam-syncer.log");
}

export function log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  const time = new Date().toISOString();
  const entry = {
    time,
    level,
    message,
    ...(meta ? { meta } : {})
  };
  const line = JSON.stringify(entry);
  try {
    fs.appendFileSync(getLogPath(), line + "\n");
  } catch {
    // ignore file logging errors
  }
  const consoleFn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  consoleFn(`[${time}] ${level.toUpperCase()} ${message}`, meta ?? "");
}

function resolveUserDataPath(): string {
  try {
    // Electron is not available in node test runs.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const electron = require("electron");
    const app = electron?.app;
    if (app && typeof app.isReady === "function" && app.isReady()) {
      return app.getPath("userData");
    }
  } catch {
    // fall back
  }
  return process.cwd();
}
