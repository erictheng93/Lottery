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
