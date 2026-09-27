import { prisma } from "@/lib/prisma";

// 伝票の明細に入力された商品コードが商品マスタに存在するかを確認し、無いものについて
// 「N行目の商品コード「X」が商品マスタにありません。」のメッセージを返す（すべて存在すればnull）。
// DBの外部キー制約で弾かれると利用者には分かりにくいエラーになるため、保存前に確認する。
export async function checkProductCodes(
  lines: { product_code?: string | null }[],
): Promise<string | null> {
  const codes = [...new Set(lines.map((l) => l.product_code?.trim()).filter((c): c is string => !!c))];
  if (codes.length === 0) return null;
  const found = new Set(
    (await prisma.products.findMany({ where: { code: { in: codes } }, select: { code: true } })).map((p) => p.code),
  );
  for (const [i, l] of lines.entries()) {
    const code = l.product_code?.trim();
    if (code && !found.has(code)) return `${i + 1}行目の商品コード「${code}」が商品マスタにありません。`;
  }
  return null;
}
