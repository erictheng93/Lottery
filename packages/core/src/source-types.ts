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
