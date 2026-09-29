import { auth } from "@/auth";
import { parseSearchParams, searchVouchers, toCsv } from "@/lib/voucher-search";

// 伝票検索の結果をCSVファイルで出力する（検索画面の「出力方法: CSVファイル」）
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  const sp: Record<string, string | string[]> = {};
  for (const key of new Set(url.searchParams.keys())) {
    const all = url.searchParams.getAll(key);
    sp[key] = all.length > 1 ? all : all[0];
  }
  const params = parseSearchParams(sp);
  const result = await searchVouchers(params);
  const csv = toCsv(result.rows, !!(params.product || params.spec));
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="voucher-search-${stamp}.csv"`,
    },
  });
}
