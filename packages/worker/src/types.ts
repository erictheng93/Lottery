export interface Env {
  DB: D1Database;
  CSRF_CACHE: KVNamespace;
  SOURCE_BASE_URL: string;
  PLAYKEY: string;
  PTYPE: string;
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
  preDrawTime: string; // contains <br>, e.g. "2026-03-05<br>17:51:47"
}

export interface AjaxOtherInfoResponse {
  playkey: string;
  isData: string;
  ptype: string;
  initlist: string; // JSON string — needs double parse
}
