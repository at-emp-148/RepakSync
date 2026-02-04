import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import { Settings } from "../shared/types.js";

const DEFAULT_SETTINGS: Settings = {
  scanFolders: ["C:\\Games", "D:\\Installed"],
  includeKnownStores: true
};

const SETTINGS_FILE = "settings.json";

export function loadSettings(): Settings {
  const filePath = path.join(app.getPath("userData"), SETTINGS_FILE);
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as Settings;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  const filePath = path.join(app.getPath("userData"), SETTINGS_FILE);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(settings, null, 2));
}
