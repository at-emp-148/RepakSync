import fs from "node:fs";
import path from "node:path";
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
};

export async function fetchArtworkSet(
  apiKey: string,
  gameName: string,
  gridPath: string,
  appId: number
): Promise<ArtworkResult> {
  const result: ArtworkResult = { downloaded: 0, attempted: 0 };
  try {
    const gameId = await findGameId(apiKey, gameName);
    if (!gameId) {
      log("warn", "SteamGridDB game not found", { gameName });
      return result;
    }

    const assets = [
      { type: "grid-portrait", url: await fetchGrid(apiKey, gameId, "600x900"), file: `${appId}_p` },
      { type: "grid-wide", url: await fetchGrid(apiKey, gameId, "920x430,460x215"), file: `${appId}` },
      { type: "hero", url: await fetchHero(apiKey, gameId), file: `${appId}_hero` },
      { type: "logo", url: await fetchLogo(apiKey, gameId), file: `${appId}_logo` },
      { type: "icon", url: await fetchIcon(apiKey, gameId), file: `${appId}_icon` }
    ];

    for (const asset of assets) {
      if (!asset.url) continue;
      result.attempted++;
      const ext = path.extname(new URL(asset.url).pathname) || ".png";
      const target = path.join(gridPath, `${asset.file}${ext}`);
      try {
        await downloadToFile(asset.url, target);
        result.downloaded++;
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
  return body.data[0].url;
}

async function downloadToFile(url: string, target: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed (${res.status})`);
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, buffer);
}
