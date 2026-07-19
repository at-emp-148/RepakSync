import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import { Achievement } from "../shared/types.js";

const ACHIEVEMENTS_FILE = "achievements.json";

export function loadAchievements(): Achievement[] {
  const filePath = path.join(app.getPath("userData"), ACHIEVEMENTS_FILE);
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as Achievement[];
  } catch {
    return [];
  }
}

export function saveAchievements(achievements: Achievement[]): void {
  const filePath = path.join(app.getPath("userData"), ACHIEVEMENTS_FILE);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(achievements, null, 2));
}
