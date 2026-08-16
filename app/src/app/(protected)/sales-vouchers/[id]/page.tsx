import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { DeleteButton } from "./DeleteButton";

export default async function SalesVoucherDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const voucher = await prisma.sales_vouchers.findUnique({
    where: { id: BigInt(id) },
    include: {
      sales_voucher_lines: { orderBy: { line_no: "asc" } },
      customers: true,
      staff: true,
    },
  });

  if (!voucher) notFound();

  return (
    <div className="max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-800">
          売上伝票 {voucher.voucher_no}
          {voucher.is_cash_sale && (
            <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs font-normal text-amber-700">
              現金売上
            </span>
          )}
          {voucher.is_billed && (
            <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-500">
              請求確定済み
            </span>
          )}
        </h1>
        <div className="flex gap-2">
          {!voucher.is_billed && (
            <>
              <Link
                href={`/sales-vouchers/${id}/edit`}
                className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                編集
              </Link>
              <DeleteButton id={id} />
            </>
          )}
          <a
            href={`/sales-vouchers/${id}/print`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            納品書PDF
          </a>
          <Link
            href="/sales-vouchers"
            className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            一覧に戻る
          </Link>
        </div>
      </div>

      <section className="mb-6 rounded-lg border border-slate-200 bg-white p-6">
        <dl className="grid grid-cols-2 gap-y-3 text-sm sm:grid-cols-4">
          <dt className="text-slate-500">伝票日付</dt>
          <dd className="text-slate-800">{voucher.voucher_date.toISOString().slice(0, 10)}</dd>
          <dt className="text-slate-500">得意先</dt>
          <dd className="text-slate-800">
            {voucher.customer_code} - {voucher.customers.name1}
          </dd>
          <dt className="text-slate-500">担当者</dt>
          <dd className="text-slate-800">{voucher.staff ? `${voucher.staff.code} - ${voucher.staff.name}` : "-"}</dd>
          <dt className="text-slate-500">消費税率</dt>
          <dd className="text-slate-800">{voucher.tax_rate.toString()}%</dd>
          <dt className="text-slate-500">摘要</dt>
          <dd className="col-span-3 text-slate-800">{voucher.remarks || "-"}</dd>
        </dl>
      </section>

      <section className="mb-6 rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-3 text-sm font-bold text-slate-600">明細</h2>
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-xs text-slate-500">
            <tr>
              <th className="pb-2">商品名</th>
              <th className="pb-2">規格</th>
              <th className="pb-2 text-right">数量</th>
              <th className="pb-2">単位</th>
              <th className="pb-2 text-right">売上単価</th>
              <th className="pb-2 text-right">売上金額</th>
              <th className="pb-2">備考</th>
            </tr>
          </thead>
          <tbody>
            {voucher.sales_voucher_lines.map((l) => (
              <tr key={l.id} className="border-b border-slate-50">
                <td className="py-2">{l.product_name}</td>
                <td className="py-2 text-slate-500">{l.spec}</td>
                <td className="py-2 text-right">{l.quantity.toString()}</td>
                <td className="py-2 text-slate-500">{l.unit}</td>
                <td className="py-2 text-right">{l.sale_price ? Number(l.sale_price).toLocaleString() : ""}</td>
                <td className="py-2 text-right">{l.sale_amount ? Number(l.sale_amount).toLocaleString() : ""}</td>
                <td className="py-2 text-slate-500">{l.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <dl className="grid grid-cols-2 gap-y-2 text-sm sm:grid-cols-4">
          <dt className="text-slate-500">売上金額</dt>
          <dd className="text-slate-800">{Number(voucher.sales_amount).toLocaleString()}</dd>
          <dt className="text-slate-500">粗利額</dt>
          <dd className="text-slate-800">{Number(voucher.gross_profit).toLocaleString()}</dd>
          <dt className="text-slate-500">消費税額</dt>
          <dd className="text-slate-800">{Number(voucher.tax_amount).toLocaleString()}</dd>
          <dt className="font-semibold text-slate-600">合計</dt>
          <dd className="font-semibold text-slate-900">
            {(Number(voucher.sales_amount) + Number(voucher.tax_amount)).toLocaleString()}
          </dd>
        </dl>
      </section>
    </div>
  );
}
