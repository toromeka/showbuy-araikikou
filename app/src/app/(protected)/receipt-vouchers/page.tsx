import Link from "next/link";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

const PAGE_SIZE = 30;

export default async function ReceiptVouchersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; from?: string; to?: string; page?: string }>;
}) {
  const { q = "", from = "", to = "", page = "1" } = await searchParams;
  const currentPage = Math.max(1, parseInt(page, 10) || 1);

  const where: Prisma.receipt_vouchersWhereInput = {};
  if (q) {
    where.OR = [
      { voucher_no: { contains: q, mode: "insensitive" } },
      { customer_code: { contains: q, mode: "insensitive" } },
      { customers: { name1: { contains: q, mode: "insensitive" } } },
    ];
  }
  if (from || to) {
    where.voucher_date = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    };
  }

  const [vouchers, total] = await Promise.all([
    prisma.receipt_vouchers.findMany({
      where,
      orderBy: [{ voucher_date: "desc" }, { voucher_no: "desc" }],
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { customers: { select: { name1: true } } },
    }),
    prisma.receipt_vouchers.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-800">入金伝票（{total.toLocaleString()}件）</h1>
        <Link
          href="/receipt-vouchers/new"
          className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          + 新規登録
        </Link>
      </div>

      <form className="mb-4 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-xs text-slate-500">検索（伝票番号・得意先）</span>
          <input type="text" name="q" defaultValue={q} className="w-56 rounded border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-slate-500">伝票日付（From）</span>
          <input type="date" name="from" defaultValue={from} className="rounded border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-slate-500">伝票日付（To）</span>
          <input type="date" name="to" defaultValue={to} className="rounded border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <button type="submit" className="rounded border border-slate-300 bg-white px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
          検索
        </button>
      </form>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left text-slate-600">
            <tr>
              <th className="px-4 py-2">伝票番号</th>
              <th className="px-4 py-2">伝票日付</th>
              <th className="px-4 py-2">得意先</th>
              <th className="px-4 py-2 text-right">入金合計</th>
              <th className="px-4 py-2">領収書</th>
            </tr>
          </thead>
          <tbody>
            {vouchers.map((v) => (
              <tr key={v.id.toString()} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-2 font-mono">
                  <Link href={`/receipt-vouchers/${v.id}`} className="text-blue-600 hover:underline">
                    {v.voucher_no}
                  </Link>
                </td>
                <td className="px-4 py-2">{v.voucher_date.toISOString().slice(0, 10)}</td>
                <td className="px-4 py-2">
                  {v.customer_code} - {v.customers.name1}
                </td>
                <td className="px-4 py-2 text-right">{Number(v.subtotal_amount).toLocaleString()}</td>
                <td className="px-4 py-2">
                  {v.print_receipt ? (
                    <span className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700">印刷対象</span>
                  ) : (
                    <span className="text-xs text-slate-300">-</span>
                  )}
                </td>
              </tr>
            ))}
            {vouchers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  該当する入金伝票がありません
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
              href={`/receipt-vouchers?q=${encodeURIComponent(q)}&from=${from}&to=${to}&page=${p}`}
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
