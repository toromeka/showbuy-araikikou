import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { DeleteButton } from "./DeleteButton";

export default async function QuotationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const quotation = await prisma.quotations.findUnique({
    where: { id: BigInt(id) },
    include: {
      quotation_lines: { orderBy: { line_no: "asc" } },
      customers: true,
      staff: true,
    },
  });

  if (!quotation) notFound();

  return (
    <div className="max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-800">
          見積書 {quotation.voucher_no}
          {quotation.is_hierarchical && (
            <span className="ml-2 rounded bg-purple-100 px-2 py-0.5 text-xs font-normal text-purple-700">
              階層タイプ
            </span>
          )}
        </h1>
        <div className="flex gap-2">
          <Link
            href={`/quotations/${id}/edit`}
            className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            編集
          </Link>
          <DeleteButton id={id} />
          <a
            href={`/quotations/${id}/print`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            見積書PDF
          </a>
          <Link
            href="/quotations"
            className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            一覧に戻る
          </Link>
        </div>
      </div>

      <section className="mb-6 rounded-lg border border-slate-200 bg-white p-6">
        <dl className="grid grid-cols-2 gap-y-3 text-sm sm:grid-cols-4">
          <dt className="text-slate-500">見積日</dt>
          <dd className="text-slate-800">{quotation.quotation_date.toISOString().slice(0, 10)}</dd>
          <dt className="text-slate-500">得意先</dt>
          <dd className="text-slate-800">
            {quotation.customer_code} - {quotation.customers.name1}
          </dd>
          <dt className="text-slate-500">担当者</dt>
          <dd className="text-slate-800">
            {quotation.staff ? `${quotation.staff.code} - ${quotation.staff.name}` : "-"}
          </dd>
          <dt className="text-slate-500">相手先担当</dt>
          <dd className="text-slate-800">{quotation.counterpart_staff || "-"}</dd>
          <dt className="text-slate-500">案件名</dt>
          <dd className="col-span-3 text-slate-800">
            {quotation.project_name1 || "-"}
            {quotation.project_name2 ? ` / ${quotation.project_name2}` : ""}
          </dd>
          <dt className="text-slate-500">納期</dt>
          <dd className="text-slate-800">{quotation.delivery_terms || "-"}</dd>
          <dt className="text-slate-500">受渡場所</dt>
          <dd className="text-slate-800">{quotation.delivery_place || "-"}</dd>
          <dt className="text-slate-500">荷造運賃</dt>
          <dd className="text-slate-800">{quotation.freight_terms || "-"}</dd>
          <dt className="text-slate-500">支払条件</dt>
          <dd className="text-slate-800">{quotation.payment_terms || "-"}</dd>
          <dt className="text-slate-500">有効期限</dt>
          <dd className="text-slate-800">{quotation.valid_until_text || "-"}</dd>
          <dt className="text-slate-500">参照番号 / 補助番号</dt>
          <dd className="text-slate-800">
            {quotation.reference_no || "-"} / {quotation.sub_no || "-"}
          </dd>
          <dt className="text-slate-500">備考</dt>
          <dd className="col-span-3 text-slate-800">{quotation.remarks || "-"}</dd>
        </dl>
      </section>

      <section className="mb-6 rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-3 text-sm font-bold text-slate-600">明細</h2>
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-xs text-slate-500">
            <tr>
              <th className="pb-2">品名</th>
              <th className="pb-2">規格</th>
              <th className="pb-2 text-right">数量</th>
              <th className="pb-2">単位</th>
              <th className="pb-2 text-right">見積単価</th>
              <th className="pb-2 text-right">見積金額</th>
            </tr>
          </thead>
          <tbody>
            {quotation.quotation_lines.map((l) => (
              <tr key={l.id} className="border-b border-slate-50">
                {l.level > 0 ? (
                  <td
                    colSpan={6}
                    className="py-2 font-semibold text-slate-700"
                    style={{ paddingLeft: l.level * 16 }}
                  >
                    {l.product_name}
                  </td>
                ) : (
                  <>
                    <td className="py-2">{l.product_name}</td>
                    <td className="py-2 text-slate-500">{l.spec}</td>
                    <td className="py-2 text-right">{l.quantity?.toString()}</td>
                    <td className="py-2 text-slate-500">{l.unit}</td>
                    <td className="py-2 text-right">
                      {l.quote_price != null ? Number(l.quote_price).toLocaleString() : ""}
                    </td>
                    <td className="py-2 text-right">
                      {l.quote_amount != null ? Number(l.quote_amount).toLocaleString() : ""}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <dl className="grid grid-cols-2 gap-y-2 text-sm sm:grid-cols-4">
          <dt className="text-slate-500">見積金額</dt>
          <dd className="text-slate-800">{Number(quotation.quote_amount).toLocaleString()}</dd>
          <dt className="text-slate-500">原価金額</dt>
          <dd className="text-slate-800">{Number(quotation.cost_amount).toLocaleString()}</dd>
          <dt className="font-semibold text-slate-600">粗利額</dt>
          <dd className="font-semibold text-slate-900">{Number(quotation.gross_profit).toLocaleString()}</dd>
        </dl>
        <p className="mt-2 text-xs text-slate-400">
          {quotation.tax_calculated ? "消費税を含めて計算されています。" : "消費税を含めずに計算されています。"}
        </p>
      </section>
    </div>
  );
}
