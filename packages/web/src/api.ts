const BASE = import.meta.env.VITE_API_BASE_URL ?? '';

export interface DigitDetail {
  digit: number;
  frequency: number;
  current_gap: number;
  max_gap: number;
}

export interface StatsResponse {
  summary: {
    most_omitted_digit: number;
    most_omitted_gap: number;
    total_periods: number;
  };
  details: DigitDetail[];
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

export async function fetchStats(range: number): Promise<StatsResponse> {
  const res = await fetch(`${BASE}/api/stats?range=${range}`);
  if (!res.ok) throw new Error(`stats: ${res.status}`);
  return res.json();
}

export async function fetchDraws(
  limit: number,
  offset: number,
  date?: string
): Promise<DrawsResponse> {
  let url = `${BASE}/api/draws?limit=${limit}&offset=${offset}`;
  if (date) url += `&date=${date}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`draws: ${res.status}`);
  return res.json();
}
