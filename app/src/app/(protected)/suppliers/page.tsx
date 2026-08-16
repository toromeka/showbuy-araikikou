import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { toggleSupplierActive } from "@/lib/actions/suppliers";

const PAGE_SIZE = 30;

export default async function SuppliersPage({
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
          { name1: { contains: q, mode: "insensitive" as const } },
          { kana: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [suppliers, total] = await Promise.all([
    prisma.suppliers.findMany({
      where,
      orderBy: { code: "asc" },
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.suppliers.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-800">仕入先マスタ（{total.toLocaleString()}件）</h1>
        <div className="flex gap-2">
          <Link
            href="/suppliers/import"
            className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            CSV取り込み
          </Link>
          <Link
            href="/suppliers/new"
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
          placeholder="コード・名称・フリガナで検索"
          className="w-80 rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </form>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left text-slate-600">
            <tr>
              <th className="px-4 py-2">コード</th>
              <th className="px-4 py-2">仕入先名称</th>
              <th className="px-4 py-2">フリガナ</th>
              <th className="px-4 py-2">電話番号</th>
              <th className="px-4 py-2">状態</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((s) => (
              <tr key={s.code} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-2 font-mono">{s.code}</td>
                <td className="px-4 py-2">
                  <Link href={`/suppliers/${s.code}`} className="text-blue-600 hover:underline">
                    {s.name1}
                  </Link>
                </td>
                <td className="px-4 py-2 text-slate-500">{s.kana}</td>
                <td className="px-4 py-2 text-slate-500">{s.phone}</td>
                <td className="px-4 py-2">
                  {s.is_active ? (
                    <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">有効</span>
                  ) : (
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">無効</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  <form
                    action={async () => {
                      "use server";
                      await toggleSupplierActive(s.code, s.is_active);
                    }}
                  >
                    <button type="submit" className="text-xs text-slate-500 hover:text-red-600">
                      {s.is_active ? "無効化" : "有効化"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {suppliers.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  該当する仕入先がありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex gap-2 text-sm">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={`/suppliers?q=${encodeURIComponent(q)}&page=${p}`}
              className={`rounded px-3 py-1 ${
                p === currentPage ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-100"
              }`}
            >
              {p}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
