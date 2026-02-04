import fs from "node:fs";
import path from "node:path";
import { GameCandidate } from "../shared/types.js";

const EXE_IGNORE = [
  "unins",
  "uninstall",
  "dxsetup",
  "vc_redist",
  "dotnet",
  "setup",
  "launcher",
  "crashreporter",
  "easyanticheat"
];

export function scanFolders(folders: string[], maxDepth = 2): GameCandidate[] {
  const results: GameCandidate[] = [];
  for (const folder of folders) {
    if (!fs.existsSync(folder)) continue;
    const entries = safeReadDir(folder);
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const gameDir = path.join(folder, entry.name);
      const candidate = pickBestExe(gameDir, maxDepth);
      if (!candidate) continue;
      results.push({
        name: candidate.name,
        exePath: candidate.exePath,
        startDir: candidate.startDir,
        source: "custom"
      });
    }
  }
  return results;
}

export function getKnownStoreFolders(): string[] {
  if (process.platform !== "win32") return [];
  return [
    "C:\\Program Files\\Epic Games",
    "C:\\Program Files (x86)\\GOG Galaxy\\Games"
  ];
}

function pickBestExe(dir: string, maxDepth: number): { name: string; exePath: string; startDir: string } | null {
  const candidates: { exePath: string; size: number }[] = [];
  walk(dir, 0, maxDepth, (filePath) => {
    if (!filePath.toLowerCase().endsWith(".exe")) return;
    const base = path.basename(filePath).toLowerCase();
    if (EXE_IGNORE.some((x) => base.includes(x))) return;
    const stat = fs.statSync(filePath);
    candidates.push({ exePath: filePath, size: stat.size });
  });

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.size - a.size);
  const best = candidates[0];
  const name = path.basename(dir);
  return { name, exePath: best.exePath, startDir: path.dirname(best.exePath) };
}

function walk(dir: string, depth: number, maxDepth: number, onFile: (path: string) => void): void {
  if (depth > maxDepth) return;
  const entries = safeReadDir(dir);
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, depth + 1, maxDepth, onFile);
    } else if (entry.isFile()) {
      onFile(full);
    }
  }
}

function safeReadDir(dir: string): fs.Dirent[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}
