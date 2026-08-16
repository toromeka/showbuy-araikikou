import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { toggleProductActive } from "@/lib/actions/products";

const PAGE_SIZE = 30;

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q = "", page = "1" } = await searchParams;
  const currentPage = Math.max(1, parseInt(page, 10) || 1);

  const where = q
    ? {
        OR: [
          { code: { contains: q, mode: "insensitive" as const } },
          { name: { contains: q, mode: "insensitive" as const } },
          { kana: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [products, total] = await Promise.all([
    prisma.products.findMany({
      where,
      orderBy: { code: "asc" },
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.products.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // ページ番号は現在位置の前後のみ表示（商品は14万件超のため全件表示しない）
  const pageWindow = Array.from({ length: 5 }, (_, i) => currentPage - 2 + i).filter(
    (p) => p >= 1 && p <= totalPages,
  );

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-800">商品マスタ（{total.toLocaleString()}件）</h1>
        <div className="flex gap-2">
          <Link
            href="/products/import"
            className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            CSV取り込み
          </Link>
          <Link
            href="/products/new"
            className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            + 新規登録
          </Link>
        </div>
      </div>

      <form className="mb-4">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="商品コード・商品名・フリガナで検索"
          className="w-80 rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </form>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left text-slate-600">
            <tr>
              <th className="px-4 py-2">商品コード</th>
              <th className="px-4 py-2">商品名</th>
              <th className="px-4 py-2">規格</th>
              <th className="px-4 py-2">単位</th>
              <th className="px-4 py-2 text-right">売上単価1</th>
              <th className="px-4 py-2">状態</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.code} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-2 font-mono">{p.code}</td>
                <td className="px-4 py-2">
                  <Link href={`/products/${p.code}`} className="text-blue-600 hover:underline">
                    {p.name}
                  </Link>
                </td>
                <td className="px-4 py-2 text-slate-500">{p.spec}</td>
                <td className="px-4 py-2 text-slate-500">{p.unit_code}</td>
                <td className="px-4 py-2 text-right text-slate-700">
                  {p.sale_price_1 ? Number(p.sale_price_1).toLocaleString() : ""}
                </td>
                <td className="px-4 py-2">
                  {p.is_active ? (
                    <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">有効</span>
                  ) : (
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">無効</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  <form
                    action={async () => {
                      "use server";
                      await toggleProductActive(p.code, p.is_active);
                    }}
                  >
                    <button type="submit" className="text-xs text-slate-500 hover:text-red-600">
                      {p.is_active ? "無効化" : "有効化"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  該当する商品がありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center gap-2 text-sm">
          {currentPage > 1 && (
            <Link
              href={`/products?q=${encodeURIComponent(q)}&page=${currentPage - 1}`}
              className="rounded bg-white px-3 py-1 text-slate-600 hover:bg-slate-100"
            >
              前へ
            </Link>
          )}
          {pageWindow.map((p) => (
            <Link
              key={p}
              href={`/products?q=${encodeURIComponent(q)}&page=${p}`}
              className={`rounded px-3 py-1 ${
                p === currentPage ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-100"
              }`}
            >
              {p}
            </Link>
          ))}
          {currentPage < totalPages && (
            <Link
              href={`/products?q=${encodeURIComponent(q)}&page=${currentPage + 1}`}
              className="rounded bg-white px-3 py-1 text-slate-600 hover:bg-slate-100"
            >
              次へ
            </Link>
          )}
          <span className="ml-2 text-slate-400">
            {currentPage} / {totalPages} ページ
          </span>
        </div>
      )}
    </div>
  );
}
