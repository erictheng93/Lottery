const BASE = import.meta.env.VITE_API_BASE_URL ?? '';

export interface GameInfo {
  id: string;
  name: string;
  numCount: number;
}

export interface DigitDetail {
  digit: number;
  frequency: number;
  current_gap: number;
  max_gap: number;
  last_seen_period: string | null;
}

export interface PositionStats {
  position: number;
  details: DigitDetail[];
}

export interface StatsResponse {
  positions: PositionStats[];
  total_periods: number;
  latest_period: string | null;
  last_update: string;
}

export interface Draw {
  period_id: string;
  draw_time: string;
  numbers: number[];
  digits: number[];
}

export interface DrawsResponse {
  draws: Draw[];
  total: number;
  has_more: boolean;
}

export async function fetchGames(): Promise<GameInfo[]> {
  const res = await fetch(`${BASE}/api/games`);
  if (!res.ok) throw new Error(`games: ${res.status}`);
  return res.json();
}

export async function fetchStats(game: string, range: number): Promise<StatsResponse> {
  const res = await fetch(`${BASE}/api/stats?game=${game}&range=${range}`);
  if (!res.ok) throw new Error(`stats: ${res.status}`);
  return res.json();
}

export async function fetchDraws(
  game: string,
  limit: number,
  offset: number,
  date?: string
): Promise<DrawsResponse> {
  let url = `${BASE}/api/draws?game=${game}&limit=${limit}&offset=${offset}`;
  if (date) url += `&date=${date}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`draws: ${res.status}`);
  return res.json();
}
