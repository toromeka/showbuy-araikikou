// 作業ごとの背景色。今どの作業をしているかが一目でわかるよう、画面全体の背景をこの色にする
// （入力欄や表の白い枠の外側に色が付く）。作業ミス（売上と仕入の取り違えなど）を減らすため。
// 画面のURLの先頭で判断し、一覧・入力・詳細・編集は同じ作業として同じ色にする。
// ここに無い画面は、既定の薄い灰色のまま。
export const WORK_COLORS: { prefix: string; label: string; color: string }[] = [
  { prefix: "/sales-vouchers", label: "売上伝票", color: "#e0f2fe" }, // 薄い水色
  { prefix: "/billing-closings", label: "請求更新（請求書の作成）", color: "#dcfce7" }, // 薄緑
  { prefix: "/products", label: "商品マスタ", color: "#fef9c3" }, // 薄い黄色
  { prefix: "/purchase-vouchers", label: "仕入伝票", color: "#fce7f3" }, // 薄いピンク
  { prefix: "/receipt-vouchers", label: "入金伝票", color: "#efe4d4" }, // 薄い茶色
  { prefix: "/payment-vouchers", label: "支払伝票", color: "#ede9fe" }, // 薄い紫
  { prefix: "/payment-closings", label: "仕入支払更新", color: "#ffedd5" }, // 薄いオレンジ
];

export const DEFAULT_BACKGROUND = "#f8fafc"; // 薄い灰色（slate-50）

export function workColorFor(pathname: string): string | null {
  const hit = WORK_COLORS.find((w) => pathname === w.prefix || pathname.startsWith(`${w.prefix}/`));
  return hit ? hit.color : null;
}
