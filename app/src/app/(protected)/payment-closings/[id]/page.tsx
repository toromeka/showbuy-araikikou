import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ReverseButton } from "./ReverseButton";

function closingDayLabel(day: number): string {
  if (day === 0) return "すべて";
  if (day === 31) return "月末";
  return `${day}日`;
}

export default async function PaymentClosingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const closing = await prisma.payment_closings.findUnique({
    where: { id: BigInt(id) },
    include: {
      payment_records: { include: { suppliers: { select: { name1: true } } }, orderBy: { supplier_code: "asc" } },
      users: { select: { display_name: true } },
    },
  });

  if (!closing) notFound();

  const totals = closing.payment_records.reduce(
    (acc, r) => ({
      previous_balance: acc.previous_balance + Number(r.previous_balance),
      purchase_amount: acc.purchase_amount + Number(r.purchase_amount),
      tax_amount: acc.tax_amount + Number(r.tax_amount),
      payment_amount: acc.payment_amount + Number(r.payment_amount),
      payable_amount: acc.payable_amount + Number(r.payable_amount),
    }),
    { previous_balance: 0, purchase_amount: 0, tax_amount: 0, payment_amount: 0, payable_amount: 0 },
  );

  return (
    <div className="max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-800">
          仕入支払更新 {closing.executed_at.toISOString().slice(0, 16).replace("T", " ")}
          {closing.is_reversed && (
            <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-500">
              取消済み
            </span>
          )}
        </h1>
        <div className="flex gap-2">
          {!closing.is_reversed && <ReverseButton id={id} />}
          <Link
            href="/payment-closings"
            className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            一覧に戻る
          </Link>
        </div>
      </div>

      <section className="mb-6 rounded-lg border border-slate-200 bg-white p-6">
        <dl className="grid grid-cols-2 gap-y-3 text-sm sm:grid-cols-4">
          <dt className="text-slate-500">締日</dt>
          <dd className="text-slate-800">{closingDayLabel(closing.closing_day)}</dd>
          <dt className="text-slate-500">基準日</dt>
          <dd className="text-slate-800">{closing.as_of_date.toISOString().slice(0, 10)}</dd>
          <dt className="text-slate-500">実行者</dt>
          <dd className="text-slate-800">{closing.users?.display_name || "-"}</dd>
          <dt className="text-slate-500">対象仕入先数</dt>
          <dd className="text-slate-800">{closing.payment_records.length.toLocaleString()}</dd>
        </dl>
      </section>

      <section className="mb-6 rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-3 text-sm font-bold text-slate-600">仕入先別内訳</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="border-b border-slate-200 text-left text-xs text-slate-500">
              <tr>
                <th className="pb-2">仕入先</th>
                <th className="pb-2">対象期間</th>
                <th className="pb-2 text-right">前回残高</th>
                <th className="pb-2 text-right">仕入金額</th>
                <th className="pb-2 text-right">消費税額</th>
                <th className="pb-2 text-right">支払額</th>
                <th className="pb-2 text-right">今回支払額</th>
              </tr>
            </thead>
            <tbody>
              {closing.payment_records.map((r) => (
                <tr key={r.id.toString()} className="border-b border-slate-50">
                  <td className="py-2">
                    {r.supplier_code} - {r.suppliers.name1}
                  </td>
                  <td className="py-2 text-slate-500">
                    {r.period_from ? r.period_from.toISOString().slice(0, 10) : "〜"} 〜{" "}
                    {r.period_to.toISOString().slice(0, 10)}
                  </td>
                  <td className="py-2 text-right">{Number(r.previous_balance).toLocaleString()}</td>
                  <td className="py-2 text-right">{Number(r.purchase_amount).toLocaleString()}</td>
                  <td className="py-2 text-right">{Number(r.tax_amount).toLocaleString()}</td>
                  <td className="py-2 text-right">{Number(r.payment_amount).toLocaleString()}</td>
                  <td className="py-2 text-right font-semibold">{Number(r.payable_amount).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 font-semibold text-slate-800">
                <td className="pt-2" colSpan={2}>
                  合計
                </td>
                <td className="pt-2 text-right">{Math.round(totals.previous_balance).toLocaleString()}</td>
                <td className="pt-2 text-right">{Math.round(totals.purchase_amount).toLocaleString()}</td>
                <td className="pt-2 text-right">{Math.round(totals.tax_amount).toLocaleString()}</td>
                <td className="pt-2 text-right">{Math.round(totals.payment_amount).toLocaleString()}</td>
                <td className="pt-2 text-right">{Math.round(totals.payable_amount).toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}
