import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { companyInfoHtml, escapeHtml, htmlToPdfBuffer, pdfPage, todayStr, yen } from "@/lib/pdf";

// 見積書PDF。顧客向け帳票のため原価・粗利は表示しない（詳細画面の明細テーブルと同じ列構成）。
// tax_calculated は「見積単価に消費税を含めて計算したかどうか」を示すだけのフラグで、
// quotationsテーブルには税率が保存されていないため、税額を別途計算せず詳細画面と同じ注記文を付す。
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
      staff: true,
    },
  });
  if (!quotation) return new NextResponse("Not Found", { status: 404 });

  const company = await prisma.company_settings.findUnique({ where: { id: 1 } });

  const linesHtml = quotation.quotation_lines
    .map((l) => {
      if (l.level > 0) {
        return `<tr><td colspan="6" style="font-weight:700; padding-left:${8 + l.level * 14}px;">${escapeHtml(l.product_name)}</td></tr>`;
      }
      return `
      <tr>
        <td>${escapeHtml(l.product_name)}</td>
        <td class="muted">${escapeHtml(l.spec)}</td>
        <td class="text-right">${l.quantity != null ? l.quantity.toString() : ""}</td>
        <td class="text-center">${escapeHtml(l.unit)}</td>
        <td class="text-right">${l.quote_price != null ? yen(l.quote_price) : ""}</td>
        <td class="text-right">${l.quote_amount != null ? yen(l.quote_amount) : ""}</td>
      </tr>`;
    })
    .join("");

  const projectLine = [quotation.project_name1, quotation.project_name2].filter(Boolean).join(" ");

  const bodyHtml = `
    <h1 class="doc-title">御見積書</h1>
    <table class="header-table" style="margin-bottom:18px;">
      <tr>
        <td style="width:58%;">
          <div style="font-size:15px; font-weight:700; border-bottom:2px solid #1e293b; padding-bottom:6px; display:inline-block; min-width:220px;">
            ${escapeHtml(quotation.customers.name1)} 御中
          </div>
          ${projectLine ? `<div style="margin-top:10px;">件名: ${escapeHtml(projectLine)}</div>` : ""}
        </td>
        <td style="width:42%;">
          ${companyInfoHtml(company, quotation.staff?.name)}
        </td>
      </tr>
    </table>
    <table class="header-table" style="margin-bottom:14px;">
      <tr>
        <td style="width:58%;" class="muted">下記の通りお見積り申し上げます。</td>
        <td style="width:42%; text-align:right;">
          <div>発行日: ${todayStr()}</div>
          <div>見積番号: ${escapeHtml(quotation.voucher_no)}</div>
          <div>見積日: ${quotation.quotation_date.toISOString().slice(0, 10)}</div>
          ${quotation.valid_until_text ? `<div>有効期限: ${escapeHtml(quotation.valid_until_text)}</div>` : ""}
        </td>
      </tr>
    </table>
    <table class="summary-table" style="margin-bottom:14px;">
      <tr>
        <th style="width:16%;">納期</th><td style="width:34%;">${escapeHtml(quotation.delivery_terms) || "-"}</td>
        <th style="width:16%;">受渡場所</th><td style="width:34%;">${escapeHtml(quotation.delivery_place) || "-"}</td>
      </tr>
      <tr>
        <th>荷造運賃</th><td>${escapeHtml(quotation.freight_terms) || "-"}</td>
        <th>支払条件</th><td>${escapeHtml(quotation.payment_terms) || "-"}</td>
      </tr>
    </table>
    <table class="lines-table">
      <thead>
        <tr>
          <th>品名</th><th>規格</th><th>数量</th><th>単位</th><th class="text-right">単価</th><th class="text-right">金額</th>
        </tr>
      </thead>
      <tbody>${linesHtml}</tbody>
    </table>
    <table class="totals-table" style="width:280px; margin-left:auto; margin-top:16px;">
      <tr><td style="font-weight:700;">御見積金額合計</td><td class="text-right" style="font-weight:700;">${yen(quotation.quote_amount)}</td></tr>
    </table>
    <p class="muted" style="margin-top:6px; text-align:right;">
      ${quotation.tax_calculated ? "※ 上記金額は消費税を含めて計算しています。" : "※ 上記金額は消費税を含めずに計算しています。"}
    </p>
    ${quotation.remarks ? `<p class="muted" style="margin-top:10px;">備考: ${escapeHtml(quotation.remarks)}</p>` : ""}
  `;

  const html = pdfPage({ title: `見積書_${quotation.voucher_no}`, bodyHtml });
  const pdf = await htmlToPdfBuffer(html);

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="quotation-${quotation.voucher_no}.pdf"`,
    },
  });
}
