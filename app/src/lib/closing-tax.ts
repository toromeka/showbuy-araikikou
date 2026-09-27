import { roundByMethod } from "@/lib/tax";

// 請求更新・仕入支払更新で、締めた期間の消費税額を得意先（仕入先）マスタの「計算方式」に従って出す。
//   計算方式 0（請求単位・既定）: 期間の売上（仕入）合計に税率を掛け、丸め方式で端数処理する
//   計算方式 1（明細単位）     : 各伝票に保存されている消費税額をそのまま合計する
// 旧システムの請求額（＝入金額）は請求単位で計算されており、明細ごとに端数処理した税額を合計すると
// 数円ずれることを実データで確認している。税率が異なる伝票（税率改定をまたぐ期間）は税率ごとに計算する。
export type TaxGroup = { rate: number; subtotal: number; voucherTax: number };

export function closingTaxAmount(
  groups: TaxGroup[],
  calcMethod: number | null | undefined,
  roundingMethod: number | null | undefined,
): number {
  if (calcMethod === 1) return groups.reduce((a, g) => a + g.voucherTax, 0);
  return groups.reduce((a, g) => a + roundByMethod(g.subtotal * (g.rate / 100), roundingMethod), 0);
}
