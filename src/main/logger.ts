import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

type LogLevel = "info" | "warn" | "error" | "debug";

export function getLogPath(): string {
  const base = app.isReady() ? app.getPath("userData") : process.cwd();
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
