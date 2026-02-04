import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import psList from "ps-list";
import { readVdf, writeVdf, VdfMap } from "steam-binary-vdf";
import { log } from "./logger.js";
import { GameCandidate } from "../shared/types.js";

const execFileAsync = promisify(execFile);

export async function getSteamPath(): Promise<string | null> {
  if (process.platform !== "win32") return null;
  try {
    const { stdout } = await execFileAsync("reg", [
      "query",
      "HKCU\\Software\\Valve\\Steam",
      "/v",
      "SteamPath"
    ]);
    log("debug", "HKCU SteamPath registry output", { stdout });
    const line = stdout
      .split("\n")
      .find((l) => l.toLowerCase().includes("steampath") && l.toLowerCase().includes("reg_sz"));
    const value = extractRegistryValue(line);
    const normalized = normalizeSteamPath(value);
    if (normalized) return normalized;
  } catch {
    // fall through
  }
  try {
    const { stdout } = await execFileAsync("reg", [
      "query",
      "HKLM\\Software\\Valve\\Steam",
      "/v",
      "InstallPath"
    ]);
    log("debug", "HKLM InstallPath registry output", { stdout });
    const line = stdout
      .split("\n")
      .find((l) => l.toLowerCase().includes("installpath") && l.toLowerCase().includes("reg_sz"));
    const value = extractRegistryValue(line);
    const normalized = normalizeSteamPath(value);
    if (normalized) return normalized;
  } catch {
    // fall through
  }
  const defaults = [
    "C:\\Program Files (x86)\\Steam",
    "C:\\Program Files\\Steam"
  ];
  for (const candidate of defaults) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function extractRegistryValue(line?: string): string | null {
  if (!line) return null;
  const match = line.match(/REG_SZ\\s+(.+)$/i);
  if (!match) return null;
  return match[1].trim();
}

function normalizeSteamPath(value: string | null): string | null {
  if (!value) return null;
  const cleaned = value.replace(/\//g, "\\").replace(/^\"|\"$/g, "");
  if (cleaned.includes(":")) return cleaned;
  const lowered = cleaned.toLowerCase();
  if (lowered === "(x86)\\steam" || lowered.endsWith("\\steam")) {
    return "C:\\Program Files (x86)\\Steam";
  }
  return null;
}

export async function isSteamRunning(): Promise<boolean> {
  const processes = await psList();
  return processes.some((p) => p.name.toLowerCase() === "steam.exe");
}

export async function closeSteam(): Promise<void> {
  if (process.platform !== "win32") return;
  await execFileAsync("taskkill", ["/IM", "steam.exe", "/F"]);
}

export async function launchSteam(steamPath: string): Promise<void> {
  const exe = path.join(steamPath, "steam.exe");
  if (fs.existsSync(exe)) {
    execFile(exe, { windowsHide: true });
  }
}

export function getUserdataPath(steamPath: string): string {
  return path.join(steamPath, "userdata");
}

export function findPrimarySteamUserId(steamPath: string, userdataPath: string): string | null {
  if (!fs.existsSync(userdataPath)) return null;

  const loginUsersPath = path.join(steamPath, "config", "loginusers.vdf");
  log("info", "Resolving Steam user", { userdataPath, loginUsersPath });
  const mostRecent = readMostRecentUserId(loginUsersPath);
  if (mostRecent && fs.existsSync(path.join(userdataPath, mostRecent))) {
    log("info", "Using MostRecent Steam user", { userId: mostRecent });
    return mostRecent;
  }

  const entries = fs.readdirSync(userdataPath, { withFileTypes: true });
  const userDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  let best: { id: string; mtime: number } | null = null;
  for (const id of userDirs) {
    const shortcuts = path.join(userdataPath, id, "config", "shortcuts.vdf");
    if (!fs.existsSync(shortcuts)) continue;
    const stat = fs.statSync(shortcuts);
    if (!best || stat.mtimeMs > best.mtime) best = { id, mtime: stat.mtimeMs };
  }
  if (!best && userDirs.length > 0) {
    log("warn", "Falling back to first Steam user directory", { userId: userDirs[0] });
  }
  return best?.id ?? (userDirs[0] ?? null);
}

export function parseMostRecentUserId(raw: string): string | null {
  const lines = raw.split(/\r?\n/);
  let currentId: string | null = null;
  for (const line of lines) {
    const idMatch = line.match(/^\s*\"(\\d{5,})\"\s*$/);
    if (idMatch) {
      currentId = idMatch[1];
      continue;
    }
    if (currentId && line.includes("\"MostRecent\"") && line.includes("\"1\"")) {
      return currentId;
    }
  }
  return null;
}

function readMostRecentUserId(loginUsersPath: string): string | null {
  if (!fs.existsSync(loginUsersPath)) return null;
  const raw = fs.readFileSync(loginUsersPath, "utf-8");
  const id = parseMostRecentUserId(raw);
  if (!id) {
    log("warn", "No MostRecent user found in loginusers.vdf", { loginUsersPath });
  }
  return id;
}

export type ShortcutsRoot = VdfMap & {
  shortcuts: Record<string, Record<string, unknown>>;
};

export function readShortcuts(filePath: string): ShortcutsRoot {
  if (!fs.existsSync(filePath)) return { shortcuts: {} };
  const data = fs.readFileSync(filePath);
  const parsed = readVdf(data) as ShortcutsRoot;
  if (!parsed.shortcuts) return { shortcuts: {} };
  return parsed;
}

export function writeShortcuts(filePath: string, root: ShortcutsRoot): void {
  const bin = writeVdf(root as VdfMap);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, bin);
}

export function computeAppId(name: string, exePath: string): number {
  const input = `${exePath}${name}`.toLowerCase();
  const crc = crc32(input);
  return (crc | 0x80000000) >>> 0;
}

function crc32(input: string): number {
  let crc = 0xffffffff;
  for (let i = 0; i < input.length; i++) {
    const byte = input.charCodeAt(i);
    crc ^= byte;
    for (let j = 0; j < 8; j++) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function addGamesToShortcuts(
  root: ShortcutsRoot,
  games: GameCandidate[]
): { added: number; addedIds: number[]; addedGames: GameCandidate[] } {
  const existing = new Set<string>();
  for (const key of Object.keys(root.shortcuts || {})) {
    const entry = root.shortcuts[key];
    const appname = String(entry.appname ?? "");
    const exe = String(entry.exe ?? "");
    existing.add(`${appname}::${exe}`.toLowerCase());
  }

  const addedIds: number[] = [];
  const addedGames: GameCandidate[] = [];
  let added = 0;
  let nextIndex = Object.keys(root.shortcuts || {}).length;
  if (!root.shortcuts) root.shortcuts = {};

  for (const game of games) {
    const key = `${game.name}::${game.exePath}`.toLowerCase();
    if (existing.has(key)) continue;
    const appid = computeAppId(game.name, game.exePath);
    root.shortcuts[String(nextIndex)] = {
      appname: game.name,
      exe: `\"${game.exePath}\"`,
      StartDir: `\"${game.startDir}\"`,
      icon: "",
      ShortcutPath: "",
      LaunchOptions: "",
      IsHidden: 0,
      AllowDesktopConfig: 1,
      AllowOverlay: 1,
      OpenVR: 0,
      Devkit: 0,
      DevkitGameID: "",
      DevkitOverrideAppID: 0,
      LastPlayTime: 0,
      tags: { 0: game.source }
    };
    addedIds.push(appid);
    addedGames.push(game);
    added++;
    nextIndex++;
  }

  return { added, addedIds, addedGames };
}
