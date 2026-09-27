// 印刷の表示用の定数（画面のクライアント側からも使うため、サーバー専用の処理とは分けておく）

export const DOC_TYPES = {
  delivery_note: "納品書",
  quotation: "見積書",
  invoice: "請求書",
} as const;
export type DocType = keyof typeof DOC_TYPES;

export const CASSETTE_OPTIONS = [
  { value: 1, label: "カセット1（A4普通紙）" },
  { value: 2, label: "カセット2（A4請求書用帳票用紙）" },
  { value: 3, label: "カセット3（A4納品書用帳票用紙）" },
  { value: 4, label: "カセット4（A5普通紙）" },
];

export const JOB_STATUS_LABELS: Record<string, string> = {
  pending: "印刷待ち",
  printing: "印刷中",
  done: "印刷済み",
  error: "エラー",
  canceled: "取り消し",
};
