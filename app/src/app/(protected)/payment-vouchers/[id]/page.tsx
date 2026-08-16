import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { DeleteButton } from "./DeleteButton";

export default async function PaymentVoucherDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const voucher = await prisma.payment_vouchers.findUnique({
    where: { id: BigInt(id) },
    include: {
      payment_voucher_lines: { orderBy: { line_no: "asc" }, include: { banks: true } },
      suppliers: true,
    },
  });

  if (!voucher) notFound();

  return (
    <div className="max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-800">支払伝票 {voucher.voucher_no}</h1>
        <div className="flex gap-2">
          <Link
            href={`/payment-vouchers/${id}/edit`}
            className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            編集
          </Link>
          <DeleteButton id={id} />
          <Link
            href="/payment-vouchers"
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
          <dt className="text-slate-500">仕入先</dt>
          <dd className="text-slate-800">
            {voucher.supplier_code} - {voucher.suppliers.name1}
          </dd>
          <dt className="text-slate-500">対象期間</dt>
          <dd className="text-slate-800">
            {voucher.period_from ? voucher.period_from.toISOString().slice(0, 10) : "-"}
            {" 〜 "}
            {voucher.period_to ? voucher.period_to.toISOString().slice(0, 10) : "-"}
          </dd>
          <dt className="text-slate-500">請求金額（参考）</dt>
          <dd className="text-slate-800">
            {voucher.billed_amount != null ? Number(voucher.billed_amount).toLocaleString() : "-"}
          </dd>
          <dt className="text-slate-500">仕入金額（参考）</dt>
          <dd className="text-slate-800">
            {voucher.purchase_amount != null ? Number(voucher.purchase_amount).toLocaleString() : "-"}
          </dd>
          <dt className="text-slate-500">消費税額（参考）</dt>
          <dd className="text-slate-800">
            {voucher.tax_amount != null ? Number(voucher.tax_amount).toLocaleString() : "-"}
          </dd>
        </dl>
      </section>

      <section className="mb-6 rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-3 text-sm font-bold text-slate-600">支払明細</h2>
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-xs text-slate-500">
            <tr>
              <th className="pb-2">区分</th>
              <th className="pb-2 text-right">金額</th>
              <th className="pb-2">支払元銀行</th>
              <th className="pb-2">手形決済日</th>
              <th className="pb-2">備考</th>
            </tr>
          </thead>
          <tbody>
            {voucher.payment_voucher_lines.map((l) => (
              <tr key={l.id} className="border-b border-slate-50">
                <td className="py-2">{l.category}</td>
                <td className="py-2 text-right">{Number(l.amount).toLocaleString()}</td>
                <td className="py-2 text-slate-500">{l.banks ? `${l.banks.code} - ${l.banks.name}` : ""}</td>
                <td className="py-2 text-slate-500">
                  {l.bill_due_date ? l.bill_due_date.toISOString().slice(0, 10) : ""}
                </td>
                <td className="py-2 text-slate-500">{l.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <dl className="grid grid-cols-2 gap-y-2 text-sm sm:grid-cols-4">
          <dt className="font-semibold text-slate-600">支払合計</dt>
          <dd className="font-semibold text-slate-900">{Number(voucher.subtotal_amount).toLocaleString()}</dd>
        </dl>
      </section>
    </div>
  );
}
