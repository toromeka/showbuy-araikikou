import Link from "next/link";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 30;

function closingDayLabel(day: number): string {
  if (day === 0) return "すべて";
  if (day === 31) return "月末";
  return `${day}日`;
}

export default async function BillingClosingsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page = "1" } = await searchParams;
  const currentPage = Math.max(1, parseInt(page, 10) || 1);

  const [closings, total] = await Promise.all([
    prisma.billing_closings.findMany({
      orderBy: { executed_at: "desc" },
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { billing_records: { select: { billed_amount: true } }, users: { select: { display_name: true } } },
    }),
    prisma.billing_closings.count(),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-800">請求更新（{total.toLocaleString()}件）</h1>
        <Link
          href="/billing-closings/new"
          className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          + 新規実行
        </Link>
      </div>

      <p className="mb-4 text-xs text-slate-400">
        請求更新は、未請求の売上伝票と入金・前回請求残をもとに得意先ごとの請求額を確定させる処理です。実行すると対象の売上伝票が「請求確定済み」になります。
      </p>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left text-slate-600">
            <tr>
              <th className="px-4 py-2">実行日時</th>
              <th className="px-4 py-2">締日</th>
              <th className="px-4 py-2">基準日</th>
              <th className="px-4 py-2 text-right">対象得意先数</th>
              <th className="px-4 py-2 text-right">請求額合計</th>
              <th className="px-4 py-2">実行者</th>
              <th className="px-4 py-2">状態</th>
            </tr>
          </thead>
          <tbody>
            {closings.map((c) => {
              const total = c.billing_records.reduce((sum, r) => sum + Number(r.billed_amount), 0);
              return (
                <tr key={c.id.toString()} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2 font-mono">
                    <Link href={`/billing-closings/${c.id}`} className="text-blue-600 hover:underline">
                      {c.executed_at.toISOString().slice(0, 16).replace("T", " ")}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{closingDayLabel(c.closing_day)}</td>
                  <td className="px-4 py-2">{c.as_of_date.toISOString().slice(0, 10)}</td>
                  <td className="px-4 py-2 text-right">{c.billing_records.length.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right">{Math.round(total).toLocaleString()}</td>
                  <td className="px-4 py-2">{c.users?.display_name || "-"}</td>
                  <td className="px-4 py-2">
                    {c.is_reversed ? (
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">取消済み</span>
                    ) : (
                      <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">有効</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {closings.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  請求更新の実行履歴がありません
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
              href={`/billing-closings?page=${p}`}
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
