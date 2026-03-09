export interface GameConfig {
  id: string;
  playkey: string;
  ptype: string;
  name: string;
  numCount: number;
}

export const GAMES: GameConfig[] = [
  { id: 'wglhca', playkey: 'WNLHC',     ptype: 'LHC', name: 'WG視訊六合彩 A', numCount: 7 },
  { id: 'wglhcb', playkey: 'WN2LHC',     ptype: 'LHC', name: 'WG視訊六合彩 B', numCount: 7 },
  { id: 'wg539a', playkey: 'WNWSJLHC',   ptype: 'LHC', name: 'WG視訊539 A',    numCount: 5 },
  { id: 'wg539b', playkey: 'WN2WSJLHC',  ptype: 'LHC', name: 'WG視訊539 B',    numCount: 5 },
  { id: 'wg539c', playkey: 'WN3WSJLHC',  ptype: 'LHC', name: 'WG視訊539 C',    numCount: 5 },
];

export const DEFAULT_GAME_ID = 'wg539b';

export function findGame(gameId: string): GameConfig | undefined {
  return GAMES.find((g) => g.id === gameId);
}

export interface Env {
  DB: D1Database;
  CSRF_CACHE: KVNamespace;
  SOURCE_BASE_URL: string;
}

export interface AjaxInfoResponse {
  lotname: string;
  nowPeriod: string;
  openlotNumber: string[];
  donePeriod: number;
  restPeriod: number;
  nextOpenlot: string;
  nextTime: number;
}

export interface CsrfData {
  token: string;
  cookie: string;
}

export interface InitListItem {
  preDrawCode: string[];
  preDrawIssue: string;
  preDrawTime: string;
}

export interface AjaxOtherInfoResponse {
  playkey: string;
  isData: string;
  ptype: string;
  initlist: string;
}
