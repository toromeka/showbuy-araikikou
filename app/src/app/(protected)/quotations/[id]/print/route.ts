import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  escapeHtml,
  fitText,
  htmlToPdfBuffer,
  jpDate,
  pdfPage,
  qtyStr,
  slipCompanyHtml,
  SLIP_BASE_STYLE,
  unitPriceStr,
  yen,
} from "@/lib/pdf";
import type { quotation_lines } from "@/generated/prisma/client";

// 見積書PDF。顧客向け帳票のため原価・粗利は表示しない。
// 白紙に罫線も含めてすべて印刷する。各部の位置は実際の見積書（見本）を実測した寸法（mm）で固定している。
// 明細は1枚19行の固定枠で、最後の明細の次の行に「※ 合 計 ※」を印刷する。
// 収まらない場合は複数枚に分け、合計は最終ページに記載する。
// 印鑑は手で押すため、右上に押印用の枠だけを印刷する。
// tax_calculated は「見積単価に消費税を含めたかどうか」を示すだけのフラグなので、下部の注記の文言だけを切り替える。
const ROWS_PER_PAGE = 19;
// 本文の文字の大きさ（見本の見積書の実測で約11pt）と、商品名欄の文字を置ける幅
const FONT_PX = 14.5;
const NAME_WIDTH_MM = 77;

type Row = { kind: "line"; line: quotation_lines } | { kind: "total" };

function chunk<T>(arr: T[], size: number): T[][] {
  if (arr.length === 0) return [[]];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;
  if (!/^\d+$/.test(id)) return new NextResponse("Not Found", { status: 404 });

  const quotation = await prisma.quotations.findUnique({
    where: { id: BigInt(id) },
    include: {
      quotation_lines: { orderBy: { line_no: "asc" } },
      customers: true,
    },
  });
  if (!quotation) return new NextResponse("Not Found", { status: 404 });

  const company = await prisma.company_settings.findUnique({ where: { id: 1 } });

  const rows: Row[] = [...quotation.quotation_lines.map((line) => ({ kind: "line" as const, line })), { kind: "total" }];
  const pages = chunk(rows, ROWS_PER_PAGE);
  const totalPages = pages.length;

  const rowHtml = (row: Row | undefined, no: number): string => {
    if (!row) return `<tr><td></td><td></td><td></td><td></td><td></td><td></td></tr>`;
    if (row.kind === "total") {
      return `<tr><td class="c">${no}</td><td class="total-label">※　合　　計　※</td><td></td><td></td><td></td><td class="r">${yen(quotation.quote_amount)}</td></tr>`;
    }
    const l = row.line;
    // 階層見積の見出し行は、商品名欄に見出しだけを印刷する（金額の集計には含まれない）
    if (l.level > 0) {
      return `<tr><td class="c">${no}</td><td class="name heading" style="padding-left:${1.5 + (l.level - 1) * 3}mm">${fitText(l.product_name, NAME_WIDTH_MM - (l.level - 1) * 3, FONT_PX)}</td><td></td><td></td><td></td><td></td></tr>`;
    }
    return `
      <tr>
        <td class="c">${no}</td>
        <td class="name"><div>${fitText(l.product_name, NAME_WIDTH_MM, FONT_PX)}</div>${l.spec ? `<div>${fitText(l.spec, NAME_WIDTH_MM, FONT_PX)}</div>` : ""}</td>
        <td class="r">${qtyStr(l.quantity)}</td>
        <td class="c">${escapeHtml(l.unit)}</td>
        <td class="r">${l.quote_price != null ? unitPriceStr(l.quote_price) : ""}</td>
        <td class="r">${l.quote_amount != null ? yen(l.quote_amount) : ""}</td>
      </tr>`;
  };

  const condition = (label: string, value: string | null) =>
    `<div class="cond">${label}：${fitText(value, 70, FONT_PX)}</div>`;

  const bodyHtml = pages
    .map((pageRows, pageIndex) => {
      const rowsHtml = Array.from({ length: ROWS_PER_PAGE }, (_, i) =>
        rowHtml(pageRows[i], pageIndex * ROWS_PER_PAGE + i + 1),
      ).join("");
      return `
    <div class="q-page">
      <div class="q-title">御　見　積　書</div>
      <div class="q-no">No. ${escapeHtml(quotation.voucher_no)}${totalPages > 1 ? `<span class="q-pageno">（${pageIndex + 1}／${totalPages}枚目）</span>` : ""}</div>
      <div class="q-date">${jpDate(quotation.quotation_date)}</div>
      <div class="q-cust"><span>${fitText(quotation.customers.name1, 68, 19)}</span><span>御中</span></div>
      ${quotation.counterpart_staff ? `<div class="q-contact">${fitText(quotation.counterpart_staff, 60, 18)}　様</div>` : ""}
      <div class="q-amount"><span>御見積金額</span><span>¥${yen(quotation.quote_amount)}-</span></div>
      <div class="q-company sc-company">${slipCompanyHtml(company)}</div>
      <table class="q-seals"><tr><td></td><td></td><td></td></tr></table>
      <div class="q-project">
        <div>${fitText(quotation.project_name1, 125, FONT_PX)}</div>
        <div>${fitText(quotation.project_name2, 125, FONT_PX)}</div>
      </div>
      <div class="q-cond-left">
        ${condition("受渡場所", quotation.delivery_place)}
        ${condition("支払条件", quotation.payment_terms)}
      </div>
      <div class="q-cond-right">
        ${condition("納　　期", quotation.delivery_terms)}
        ${condition("荷造運賃", quotation.freight_terms)}
        ${condition("有効期限", quotation.valid_until_text)}
      </div>
      <table class="q-table">
        <colgroup><col style="width:8.5mm"><col style="width:80mm"><col style="width:24mm"><col style="width:12mm"><col style="width:30mm"><col style="width:31.5mm"></colgroup>
        <thead><tr><th>No</th><th>商　品　名 / 規　格</th><th>数　量</th><th>単位</th><th>単　価</th><th>金　額</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <div class="q-remarks"><span class="q-remarks-label">備　考</span><span class="q-remarks-text">${escapeHtml(quotation.remarks)}</span></div>
      <div class="q-tax-note">※　上記価格には消費税は${quotation.tax_calculated ? "含まれております" : "含まれておりません"}</div>
    </div>`;
    })
    .join("");

  // 位置はすべてA4用紙の左上からのmmで指定する（余白0で出力）
  const extraStyle = `
    ${SLIP_BASE_STYLE}
    .q-page { position: relative; width: 210mm; height: 297mm; overflow: hidden; page-break-after: always; font-size: ${FONT_PX}px; }
    .q-page:last-child { page-break-after: auto; }
    .q-page > * { position: absolute; }
    .q-title { left: 70mm; top: 15mm; width: 67mm; text-align: center; font-size: 28px; font-weight: 700; line-height: 1.2; border-bottom: 0.4mm solid #000; white-space: nowrap; }
    .q-no { right: 10mm; top: 16.5mm; min-width: 24mm; text-align: right; border-bottom: 0.3mm solid #000; white-space: nowrap; }
    .q-pageno { font-size: 11px; margin-left: 1mm; }
    .q-date { right: 10mm; top: 23mm; min-width: 36mm; text-align: right; border-bottom: 0.3mm solid #000; white-space: nowrap; }
    .q-cust { left: 15.5mm; top: 37.5mm; min-width: 82mm; display: flex; justify-content: space-between; align-items: baseline; gap: 4mm; font-size: 19px; border-bottom: 0.3mm solid #000; white-space: nowrap; }
    .q-contact { left: 15.5mm; top: 44.5mm; width: 78mm; text-align: right; font-size: 18px; white-space: nowrap; }
    .q-amount { left: 15.5mm; top: 53.5mm; min-width: 70mm; display: flex; justify-content: space-between; align-items: baseline; gap: 6mm; font-size: 19px; font-weight: 700; border-bottom: 0.3mm solid #000; white-space: nowrap; }
    .q-company { right: 10mm; top: 40mm; }
    .q-seals { left: 148mm; top: 61.5mm; width: 51.5mm; border-collapse: collapse; table-layout: fixed; }
    .q-seals td { border: 0.3mm solid #000; height: 15mm; }
    .q-project { left: 17mm; top: 68mm; width: 128mm; line-height: 1.25; }
    .q-project div { white-space: nowrap; min-height: 1.25em; }
    .q-cond-left { left: 15.5mm; top: 79mm; width: 91.5mm; }
    .q-cond-right { left: 109.5mm; top: 79mm; width: 91.5mm; }
    .cond { height: 6.6mm; padding-top: 1mm; border-bottom: 0.3mm solid #000; white-space: nowrap; overflow: hidden; }
    .q-table { left: 15mm; top: 99.5mm; width: 186mm; border-collapse: collapse; table-layout: fixed; border: 0.4mm solid #000; }
    .q-table th, .q-table td { border: 0.3mm solid #000; height: 8.3mm; padding: 0 1.5mm; overflow: hidden; white-space: nowrap; line-height: 1.05; }
    .q-table th { height: 8.5mm; text-align: center; background: #e5e7eb; }
    .q-table td.heading { font-weight: 700; }
    .q-table td.total-label { padding-left: 10mm; }
    .q-remarks { left: 17mm; top: 267.5mm; width: 184mm; display: flex; gap: 2mm; line-height: 1.3; }
    .q-remarks-label { font-weight: 700; white-space: nowrap; }
    .q-remarks-text { white-space: pre-wrap; max-height: 2.6em; overflow: hidden; }
    .q-tax-note { left: 15mm; top: 280mm; width: 186mm; border-top: 0.3mm solid #000; padding: 1.5mm 0 0 8mm; }
    .c { text-align: center; }
    .r { text-align: right; }
  `;

  const html = pdfPage({ title: `見積書_${quotation.voucher_no}`, bodyHtml, extraStyle });
  const pdf = await htmlToPdfBuffer(html, { top: "0", right: "0", bottom: "0", left: "0" });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="quotation-${quotation.voucher_no}.pdf"`,
    },
  });
}
