import {
  type AjaxOtherInfoResponse,
  type CsrfData,
  type GameConfig,
  type IngestPayload,
  type InitListItem,
} from '@lottery/core';

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
};

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function extractCookies(setCookie: string): string {
  return setCookie
    .split(',')
    .map((cookie) => cookie.split(';')[0].trim())
    .filter(Boolean)
    .join('; ');
}

export function buildIngestPayload(
  game: GameConfig,
  items: InitListItem[]
): IngestPayload {
  return {
    game_id: game.id,
    draws: items.map((item) => ({
      period_id: item.preDrawIssue.trim(),
      draw_time: item.preDrawTime.replace('<br>', 'T'),
      numbers: item.preDrawCode.map(Number),
      raw_data: item,
    })),
  };
}

export class SourceClient {
  private csrf: CsrfData | null = null;

  constructor(
    private readonly sourceBaseUrl: string,
    private readonly timeoutMs: number
  ) {}

  async fetchHistory(game: GameConfig, range: number): Promise<InitListItem[]> {
    const csrf = await this.getCsrf();
    try {
      return await this.postHistory(game, range, csrf);
    } catch (error) {
      if (error instanceof Error && error.message === 'CSRF_EXPIRED') {
        const refreshed = await this.refreshCsrf();
        return this.postHistory(game, range, refreshed);
      }
      throw error;
    }
  }

  private async getCsrf(): Promise<CsrfData> {
    if (this.csrf) return this.csrf;
    return this.refreshCsrf();
  }

  private async refreshCsrf(): Promise<CsrfData> {
    const res = await fetchWithTimeout(
      `${this.sourceBaseUrl}/nowopen/WN2WSJLHC`,
      { headers: BROWSER_HEADERS },
      this.timeoutMs
    );
    const html = await res.text();
    const tokenMatch = html.match(/id="_token"[^>]*value="([^"]+)"/);
    if (!tokenMatch) {
      throw new Error(`Failed to parse CSRF _token from source status=${res.status}`);
    }

    this.csrf = {
      token: tokenMatch[1],
      cookie: extractCookies(res.headers.get('set-cookie') ?? ''),
    };
    return this.csrf;
  }

  private async postHistory(
    game: GameConfig,
    range: number,
    csrf: CsrfData
  ): Promise<InitListItem[]> {
    const body = new URLSearchParams({
      playkey: game.playkey,
      page: 'nowopen',
      range: String(range),
      date: '',
      type: 'range',
      _token: csrf.token,
    });

    const res = await fetchWithTimeout(
      `${this.sourceBaseUrl}/ajax_other_info`,
      {
        method: 'POST',
        headers: {
          ...BROWSER_HEADERS,
          'Content-Type': 'application/x-www-form-urlencoded',
          Cookie: csrf.cookie,
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: body.toString(),
      },
      this.timeoutMs
    );

    if (res.status === 419 || res.status === 403) {
      this.csrf = null;
      throw new Error('CSRF_EXPIRED');
    }
    if (!res.ok) {
      throw new Error(`ajax_other_info returned ${res.status}`);
    }

    const raw = (await res.json()) as AjaxOtherInfoResponse;
    if (raw.isData !== '1') {
      return [];
    }

    return JSON.parse(raw.initlist) as InitListItem[];
  }
}
