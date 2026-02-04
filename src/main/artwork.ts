import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { log } from "./logger.js";

const API_BASE = "https://www.steamgriddb.com/api/v2";

type SteamGridSearchResult = { id: number; name: string };

type SteamGridResponse<T> = {
  success: boolean;
  data: T;
};

type ArtworkResult = {
  downloaded: number;
  attempted: number;
  files: Partial<Record<"grid" | "gridWide" | "hero" | "logo" | "icon", string>>;
  skipped?: boolean;
};

export async function fetchArtworkSet(
  apiKey: string,
  gameName: string,
  gridPath: string,
  appId: number
): Promise<ArtworkResult> {
  const result: ArtworkResult = { downloaded: 0, attempted: 0, files: {} };
  const missing = await getMissingArtwork(gridPath, appId);
  if (missing.size === 0) {
    result.skipped = true;
    return result;
  }
  try {
    const gameId = await findGameId(apiKey, gameName);
    if (!gameId) {
      log("warn", "SteamGridDB game not found", { gameName });
      return result;
    }

    const assets = [
      missing.has("grid")
        ? { key: "grid", type: "grid-portrait", url: await fetchGrid(apiKey, gameId, "600x900"), file: `${appId}_p` }
        : null,
      missing.has("gridWide")
        ? { key: "gridWide", type: "grid-wide", url: await fetchGrid(apiKey, gameId, "460x215,920x430"), file: `${appId}` }
        : null,
      missing.has("hero")
        ? { key: "hero", type: "hero", url: await fetchHero(apiKey, gameId), file: `${appId}_hero` }
        : null,
      missing.has("logo")
        ? { key: "logo", type: "logo", url: await fetchLogo(apiKey, gameId), file: `${appId}_logo` }
        : null,
      missing.has("icon")
        ? { key: "icon", type: "icon", url: await fetchIcon(apiKey, gameId), file: `${appId}_icon` }
        : null
    ] as const;

    for (const asset of assets) {
      if (!asset || !asset.url) continue;
      result.attempted++;
      const ext = path.extname(new URL(asset.url).pathname) || ".png";
      const target = path.join(gridPath, `${asset.file}${ext}`);
      try {
        const written = await downloadToFile(asset.url, target, asset.key);
        result.downloaded++;
        result.files[asset.key] = written;
        log("info", "Artwork downloaded", { gameName, type: asset.type, target });
      } catch (error) {
        log("warn", "Artwork download failed", { gameName, type: asset.type, error: String(error) });
      }
    }

    return result;
  } catch (error) {
    log("error", "Artwork set failed", { gameName, error: String(error) });
    return result;
  }
}

async function findGameId(apiKey: string, gameName: string): Promise<number | null> {
  const url = `${API_BASE}/search/autocomplete/${encodeURIComponent(gameName)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!res.ok) {
    log("warn", "SteamGridDB search failed", { gameName, status: res.status });
    return null;
  }
  const body = (await res.json()) as SteamGridResponse<SteamGridSearchResult[]>;
  if (!body.success || body.data.length === 0) return null;
  return body.data[0].id;
}

async function fetchGrid(apiKey: string, gameId: number, dimensions: string): Promise<string | null> {
  const url = `${API_BASE}/grids/game/${gameId}?dimensions=${encodeURIComponent(
    dimensions
  )}&types=static`;
  return fetchFirstUrl(apiKey, url);
}

async function fetchHero(apiKey: string, gameId: number): Promise<string | null> {
  const url = `${API_BASE}/heroes/game/${gameId}?types=static`;
  return fetchFirstUrl(apiKey, url);
}

async function fetchLogo(apiKey: string, gameId: number): Promise<string | null> {
  const url = `${API_BASE}/logos/game/${gameId}?types=static`;
  return fetchFirstUrl(apiKey, url);
}

async function fetchIcon(apiKey: string, gameId: number): Promise<string | null> {
  const url = `${API_BASE}/icons/game/${gameId}?types=static`;
  return fetchFirstUrl(apiKey, url);
}

async function fetchFirstUrl(apiKey: string, url: string): Promise<string | null> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!res.ok) return null;
  const body = (await res.json()) as SteamGridResponse<{ url: string }[]>;
  if (!body.success || body.data.length === 0) return null;
  const png = body.data.find((item) => item.url.toLowerCase().endsWith(".png"));
  const jpg = body.data.find(
    (item) =>
      item.url.toLowerCase().endsWith(".jpg") || item.url.toLowerCase().endsWith(".jpeg")
  );
  return (png ?? jpg ?? body.data[0]).url;
}

async function downloadToFile(
  url: string,
  target: string,
  kind: "grid" | "gridWide" | "hero" | "logo" | "icon"
): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed (${res.status})`);
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const pngTarget = target.replace(/\.[^.]+$/, ".png");
  const pipeline = sharp(buffer);
  const resized = resizeByKind(pipeline, kind);
  const output = await resized.png().toBuffer();
  fs.writeFileSync(pngTarget, output);
  return pngTarget;
}

const ART_EXTS = [".png", ".jpg", ".jpeg"];
const WEBP_EXT = ".webp";

async function getMissingArtwork(
  gridPath: string,
  appId: number
): Promise<Set<"grid" | "gridWide" | "hero" | "logo" | "icon">> {
  const required = new Set<"grid" | "gridWide" | "hero" | "logo" | "icon">([
    "grid",
    "gridWide",
    "hero",
    "logo",
    "icon"
  ]);
  if (await hasImageWithSize(gridPath, `${appId}_p`, 600, 900)) required.delete("grid");
  if (await hasImageWithSize(gridPath, `${appId}`, 460, 215)) required.delete("gridWide");
  if (await hasImageWithSize(gridPath, `${appId}_hero`, 3840, 1240)) required.delete("hero");
  if (hasAnyFile(gridPath, `${appId}_logo`)) required.delete("logo");
  if (await hasImageWithSize(gridPath, `${appId}_icon`, 256, 256)) required.delete("icon");
  cleanupWebp(gridPath, `${appId}_p`);
  cleanupWebp(gridPath, `${appId}`);
  cleanupWebp(gridPath, `${appId}_hero`);
  cleanupWebp(gridPath, `${appId}_logo`);
  cleanupWebp(gridPath, `${appId}_icon`);
  return required;
}

function hasAnyFile(dir: string, base: string): boolean {
  return ART_EXTS.some((ext) => fs.existsSync(path.join(dir, `${base}${ext}`)));
}

async function hasImageWithSize(
  dir: string,
  base: string,
  width: number,
  height: number
): Promise<boolean> {
  for (const ext of ART_EXTS) {
    const filePath = path.join(dir, `${base}${ext}`);
    if (!fs.existsSync(filePath)) continue;
    try {
      const meta = await sharp(filePath).metadata();
      if (meta.width === width && meta.height === height) return true;
    } catch {
      // ignore corrupted image
    }
  }
  return false;
}

function cleanupWebp(dir: string, base: string): void {
  const webp = path.join(dir, `${base}${WEBP_EXT}`);
  if (fs.existsSync(webp) && !hasAnyFile(dir, base)) {
    try {
      fs.unlinkSync(webp);
    } catch {
      // ignore cleanup errors
    }
  }
}

function resizeByKind(
  pipeline: sharp.Sharp,
  kind: "grid" | "gridWide" | "hero" | "logo" | "icon"
): sharp.Sharp {
  switch (kind) {
    case "grid":
      return pipeline.resize(600, 900, { fit: "cover" });
    case "gridWide":
      return pipeline.resize(460, 215, { fit: "cover" });
    case "hero":
      return pipeline.resize(3840, 1240, { fit: "cover" });
    case "icon":
      return pipeline.resize(256, 256, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } });
    case "logo":
    default:
      return pipeline;
  }
}
