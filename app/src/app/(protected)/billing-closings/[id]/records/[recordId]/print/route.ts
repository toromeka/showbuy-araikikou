import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { bankInfoHtml, companyInfoHtml, dateStr, escapeHtml, htmlToPdfBuffer, pdfPage, todayStr, yen } from "@/lib/pdf";

// 請求更新の実績（billing_records）から「請求書」PDFを生成する。
// 明細は、この請求グループ（得意先＋請求先をまとめた子会社群）に属し、かつこの実績の対象期間
// （period_from〜period_to）に入る売上伝票を再集計して表示する。これは請求更新の取り消し処理
// （reverseBillingClosing）が対象伝票を再特定するのに使っているのと同じ絞り込み条件で、
// 中間テーブルを持たずに「この請求に何が含まれていたか」を後から正確に再現できる。
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; recordId: string }> },
) {
  const session = await auth();
  if (!session?.user) return new NextResponse("Unauthorized", { status: 401 });

  const { id, recordId } = await params;
  if (!/^\d+$/.test(id) || !/^\d+$/.test(recordId)) return new NextResponse("Not Found", { status: 404 });

  const record = await prisma.billing_records.findUnique({
    where: { id: BigInt(recordId) },
    include: { customers: true, billing_closings: true },
  });
  if (!record || record.closing_id.toString() !== id) return new NextResponse("Not Found", { status: 404 });

  const [root, company, ownBank] = await Promise.all([
    prisma.customers.findUnique({
      where: { code: record.customer_code },
      include: { other_customers: { select: { code: true } } },
    }),
    prisma.company_settings.findUnique({ where: { id: 1 } }),
    prisma.banks.findFirst({ where: { is_own_company: true } }),
  ]);
  const groupCodes = root ? [root.code, ...root.other_customers.map((c) => c.code)] : [record.customer_code];

  const vouchers = await prisma.sales_vouchers.findMany({
    where: {
      customer_code: { in: groupCodes },
      voucher_date: {
        lte: record.period_to,
        ...(record.period_from ? { gte: record.period_from } : {}),
      },
    },
    orderBy: { voucher_date: "asc" },
  });

  const linesHtml = vouchers
    .map(
      (v) => `
      <tr>
        <td>${dateStr(v.voucher_date)}</td>
        <td>${escapeHtml(v.voucher_no)}</td>
        <td>${escapeHtml(v.remarks)}</td>
        <td class="text-right">${yen(v.sales_amount)}</td>
        <td class="text-right">${yen(v.tax_amount)}</td>
        <td class="text-right">${yen(Number(v.sales_amount) + Number(v.tax_amount))}</td>
      </tr>`,
    )
    .join("");

  const periodLabel = `${record.period_from ? dateStr(record.period_from) : "〜"} 〜 ${dateStr(record.period_to)}`;

  const bodyHtml = `
    <h1 class="doc-title">請求書</h1>
    <table class="header-table" style="margin-bottom:18px;">
      <tr>
        <td style="width:58%;">
          <div style="font-size:15px; font-weight:700; border-bottom:2px solid #1e293b; padding-bottom:6px; display:inline-block; min-width:220px;">
            ${escapeHtml(record.customers.name1)} 御中
          </div>
        </td>
        <td style="width:42%;">
          ${companyInfoHtml(company)}
        </td>
      </tr>
    </table>
    <table class="header-table" style="margin-bottom:14px;">
      <tr>
        <td style="width:58%;" class="muted">下記の通りご請求申し上げます。</td>
        <td style="width:42%; text-align:right;">
          <div>発行日: ${todayStr()}</div>
          <div>対象期間: ${periodLabel}</div>
        </td>
      </tr>
    </table>
    <table class="summary-table" style="margin-bottom:16px;">
      <tr>
        <th>前回請求残</th>
        <th>今回売上金額</th>
        <th>消費税額</th>
        <th>今回入金額</th>
        <th>今回御請求額</th>
      </tr>
      <tr>
        <td class="text-right">${yen(record.previous_balance)}</td>
        <td class="text-right">${yen(record.sales_amount)}</td>
        <td class="text-right">${yen(record.tax_amount)}</td>
        <td class="text-right">${yen(record.receipt_amount)}</td>
        <td class="text-right" style="font-weight:700;">${yen(record.billed_amount)}</td>
      </tr>
    </table>
    <h2 style="font-size:12px; font-weight:700; margin:0 0 6px;">今回売上明細</h2>
    <table class="lines-table">
      <thead>
        <tr>
          <th>伝票日付</th><th>伝票番号</th><th>摘要</th><th class="text-right">売上金額</th><th class="text-right">消費税額</th><th class="text-right">金額</th>
        </tr>
      </thead>
      <tbody>
        ${linesHtml || `<tr><td colspan="6" class="muted text-center">対象期間内の売上はありません</td></tr>`}
      </tbody>
    </table>
    ${bankInfoHtml(ownBank)}
  `;

  const html = pdfPage({ title: `請求書_${record.customer_code}_${dateStr(record.period_to)}`, bodyHtml });
  const pdf = await htmlToPdfBuffer(html);

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="invoice-${record.customer_code}-${dateStr(record.period_to)}.pdf"`,
    },
  });
}
