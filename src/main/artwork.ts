import fs from "node:fs";
import path from "node:path";

const API_BASE = "https://www.steamgriddb.com/api/v2";

type SteamGridSearchResult = { id: number; name: string };

type SteamGridResponse<T> = {
  success: boolean;
  data: T;
};

export async function fetchArtwork(
  apiKey: string,
  gameName: string,
  gridPath: string,
  appId: number
): Promise<boolean> {
  try {
    const gameId = await findGameId(apiKey, gameName);
    if (!gameId) return false;

    const grid = await fetchFirstGrid(apiKey, gameId);
    if (!grid) return false;

    const fileName = `${appId}_p.png`;
    const target = path.join(gridPath, fileName);
    await downloadToFile(grid, target);
    return true;
  } catch {
    return false;
  }
}

async function findGameId(apiKey: string, gameName: string): Promise<number | null> {
  const url = `${API_BASE}/search/autocomplete/${encodeURIComponent(gameName)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!res.ok) return null;
  const body = (await res.json()) as SteamGridResponse<SteamGridSearchResult[]>;
  if (!body.success || body.data.length === 0) return null;
  return body.data[0].id;
}

async function fetchFirstGrid(apiKey: string, gameId: number): Promise<string | null> {
  const url = `${API_BASE}/grids/game/${gameId}?dimensions=600x900&types=static`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!res.ok) return null;
  const body = (await res.json()) as SteamGridResponse<{ url: string }[]>;
  if (!body.success || body.data.length === 0) return null;
  return body.data[0].url;
}

async function downloadToFile(url: string, target: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("download failed");
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, buffer);
}
