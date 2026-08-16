import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { dateStr, escapeHtml, htmlToPdfBuffer, pdfPage, yen } from "@/lib/pdf";
import type { sales_voucher_lines, sales_vouchers, customers, staff, company_settings } from "@/generated/prisma/client";

// 納品書PDF。A4 1枚の上半分に「納品書」、下半分に「納品書（控）」を同じ内容で印刷する
// 定型スタイル（実物の複写伝票を模したレイアウト）。
// レイアウトは、以前Flutterで試作されていた invoice_pdf_generator.dart（正式な自社の
// 納品書フォーマットに合わせて作られたもの）を参照して、日付・得意先・伝票番号のミニボックス、
// 「項」列＋商品名／規格を1セルにまとめた列構成、破線罫線、[摘要][小計][消費税][合計]を
// 横並びにした集計バーなど、実物に近い体裁を踏襲している。
// ただし明細が7品番を超える場合の複数枚出力（このアプリでの追加要件）は元のFlutter版には
// 実装されていなかったため、そこは新規に設計している。
const LINES_PER_SLIP = 7;

function chunk<T>(arr: T[], size: number): T[][] {
  if (arr.length === 0) return [[]];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

type VoucherWithRelations = sales_vouchers & {
  sales_voucher_lines: sales_voucher_lines[];
  customers: customers;
  staff: staff | null;
};

function slipHtml(opts: {
  copyLabel: string;
  voucher: VoucherWithRelations;
  company: company_settings | null;
  lines: sales_voucher_lines[];
  pageIndex: number;
  totalPages: number;
  isLastPage: boolean;
}): string {
  const { copyLabel, voucher, company, lines, pageIndex, totalPages, isLastPage } = opts;

  const rows: string[] = [];
  for (let i = 0; i < LINES_PER_SLIP; i++) {
    const l = lines[i];
    if (l) {
      const remarks = [l.note, l.note2].filter((s) => s && s.trim()).join(" ");
      rows.push(`
        <tr>
          <td class="text-center">${l.line_no}</td>
          <td class="dn-product-cell">
            <div>${escapeHtml(l.product_name)}</div>
            ${l.spec ? `<div class="dn-spec">${escapeHtml(l.spec)}</div>` : ""}
          </td>
          <td class="text-right">${l.quantity.toString()}</td>
          <td class="text-center">${escapeHtml(l.unit)}</td>
          <td class="text-right">${l.sale_price != null ? yen(l.sale_price) : ""}</td>
          <td class="text-right">${l.sale_amount != null ? yen(l.sale_amount) : ""}</td>
          <td class="muted">${escapeHtml(remarks)}</td>
        </tr>`);
    } else {
      rows.push(`<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`);
    }
  }

  const total = Number(voucher.sales_amount) + Number(voucher.tax_amount);
  const pageSuffix = totalPages > 1 ? `<span class="dn-page-suffix">（${pageIndex + 1}/${totalPages}枚目）</span>` : "";
  const custAddr = [voucher.customers.address1, voucher.customers.address2].filter(Boolean).join(" ");
  const companyAddr = [company?.address1, company?.address2].filter(Boolean).join(" ");

  return `
    <div class="dn-slip">
      <div class="dn-top-row">
        <div class="dn-top-spacer"></div>
        <div class="dn-title">納&emsp;品&emsp;書${copyLabel}${pageSuffix}</div>
        <table class="dn-minibox">
          <thead><tr><th>日付</th><th>得意先</th><th>伝票番号</th></tr></thead>
          <tbody><tr><td>${dateStr(voucher.voucher_date)}</td><td>${escapeHtml(voucher.customer_code)}</td><td>${escapeHtml(voucher.voucher_no)}</td></tr></tbody>
        </table>
      </div>
      <div class="dn-header-row">
        <div class="dn-customer-block">
          ${voucher.customers.postal_code ? `<div class="dn-small">〒${escapeHtml(voucher.customers.postal_code)}</div>` : ""}
          ${custAddr ? `<div class="dn-small">${escapeHtml(custAddr)}</div>` : ""}
          <div class="dn-customer-name-row">
            <span class="dn-customer-name">${escapeHtml(voucher.customers.name1)}</span>
            <span class="dn-honorific">御中</span>
          </div>
        </div>
        <div class="dn-company-block">
          <div class="dn-company-name">${escapeHtml(company?.company_name)}</div>
          ${company?.postal_code || companyAddr ? `<div>〒${escapeHtml(company?.postal_code)}　${escapeHtml(companyAddr)}</div>` : ""}
          ${company?.phone || company?.fax ? `<div>TEL ${escapeHtml(company?.phone)}　FAX ${escapeHtml(company?.fax)}</div>` : ""}
        </div>
      </div>
      <div class="dn-greeting">毎度ありがとうございます、下記の通り納品致します。</div>
      <table class="dn-table">
        <thead>
          <tr><th>項</th><th>商品名／規格</th><th>数量</th><th>単位</th><th class="text-right">単価</th><th class="text-right">金額</th><th>備考</th></tr>
        </thead>
        <tbody>${rows.join("")}</tbody>
      </table>
      <div class="dn-summary-bar">
        <div class="dn-summary-remarks">${voucher.remarks ? `[摘要] ${escapeHtml(voucher.remarks)}` : "[摘要]"}</div>
        ${
          isLastPage
            ? `
        <div class="dn-summary-cell">
          <div class="dn-summary-label">[小計]</div>
          <div class="dn-summary-value">${yen(voucher.sales_amount)}</div>
        </div>
        <div class="dn-summary-cell">
          <div class="dn-summary-label">[消費税${voucher.tax_rate.toString()}%]</div>
          <div class="dn-summary-value">${yen(voucher.tax_amount)}</div>
        </div>
        <div class="dn-summary-cell dn-summary-total">
          <div class="dn-summary-label">[合計]</div>
          <div class="dn-summary-value">${yen(total)}</div>
        </div>`
            : `
        <div class="dn-summary-cell dn-summary-continued">次ページに続く（小計・合計は最終ページに記載）</div>`
        }
      </div>
    </div>`;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;
  if (!/^\d+$/.test(id)) return new NextResponse("Not Found", { status: 404 });

  const voucher = await prisma.sales_vouchers.findUnique({
    where: { id: BigInt(id) },
    include: {
      sales_voucher_lines: { orderBy: { line_no: "asc" } },
      customers: true,
      staff: true,
    },
  });
  if (!voucher) return new NextResponse("Not Found", { status: 404 });

  const company = await prisma.company_settings.findUnique({ where: { id: 1 } });

  const pages = chunk(voucher.sales_voucher_lines, LINES_PER_SLIP);
  const totalPages = pages.length;

  const bodyHtml = pages
    .map((lines, idx) => {
      const isLastPage = idx === totalPages - 1;
      return `
      <div class="dn-page">
        ${slipHtml({ copyLabel: "", voucher, company, lines, pageIndex: idx, totalPages, isLastPage })}
        ${slipHtml({ copyLabel: "（控）", voucher, company, lines, pageIndex: idx, totalPages, isLastPage })}
      </div>`;
    })
    .join("");

  const extraStyle = `
    .dn-page { width: 100%; height: 277mm; page-break-after: always; }
    .dn-page:last-child { page-break-after: auto; }
    .dn-slip { height: 136mm; padding: 3mm 0 0; box-sizing: border-box; overflow: hidden; }
    .dn-slip + .dn-slip { border-top: 1px dashed #94a3b8; margin-top: 5mm; padding-top: 6mm; position: relative; }
    .dn-top-row { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 2.5mm; }
    .dn-top-spacer { width: 40mm; }
    .dn-title { flex: 1; text-align: center; font-size: 17px; font-weight: 700; letter-spacing: 0.05em; text-decoration: underline; text-underline-offset: 4px; }
    .dn-page-suffix { display: block; font-size: 8.5px; font-weight: 400; letter-spacing: 0; text-decoration: none; color: #64748b; }
    .dn-minibox { width: 40mm; border-collapse: collapse; font-size: 8px; }
    .dn-minibox th, .dn-minibox td { border: 0.5px solid #64748b; padding: 1mm; text-align: center; }
    .dn-minibox th { background: #e2e8f0; font-weight: 700; }
    .dn-header-row { display: flex; justify-content: space-between; align-items: flex-end; gap: 8mm; margin-bottom: 2mm; }
    .dn-customer-block { flex: 1; }
    .dn-small { font-size: 9px; color: #334155; }
    .dn-customer-name-row { display: flex; align-items: baseline; gap: 4mm; border-bottom: 1.2px solid #1e293b; padding-bottom: 1.5px; margin-top: 1.5mm; min-width: 62mm; }
    .dn-customer-name { font-size: 14px; font-weight: 700; }
    .dn-honorific { font-size: 10.5px; margin-left: auto; }
    .dn-company-block { text-align: right; font-size: 9px; line-height: 1.5; }
    .dn-company-name { font-size: 12.5px; font-weight: 700; letter-spacing: 0.15em; margin-bottom: 1px; }
    .dn-greeting { font-size: 9.5px; margin-bottom: 1.5mm; }
    .dn-table { width: 100%; border-collapse: collapse; font-size: 9.5px; table-layout: fixed; }
    .dn-table th, .dn-table td { border: 0.5px dashed #94a3b8; padding: 1.4mm 1.8mm; height: 4.4mm; box-sizing: border-box; overflow: hidden; }
    .dn-table th { background: #e2e8f0; font-weight: 700; }
    .dn-table tbody tr:nth-child(even) { background: #f8fafc; }
    .dn-table th:nth-child(1), .dn-table td:nth-child(1) { width: 6%; }
    .dn-table th:nth-child(2), .dn-table td:nth-child(2) { width: 34%; }
    .dn-table th:nth-child(3), .dn-table td:nth-child(3) { width: 10%; }
    .dn-table th:nth-child(4), .dn-table td:nth-child(4) { width: 8%; }
    .dn-table th:nth-child(5), .dn-table td:nth-child(5) { width: 14%; }
    .dn-table th:nth-child(6), .dn-table td:nth-child(6) { width: 14%; }
    .dn-table th:nth-child(7), .dn-table td:nth-child(7) { width: 14%; }
    .dn-spec { font-size: 8px; color: #64748b; }
    .dn-summary-bar { display: flex; border: 0.5px dashed #94a3b8; border-top: none; }
    .dn-summary-remarks { flex: 4; padding: 1.6mm 2mm; font-size: 8px; }
    .dn-summary-cell { flex: 2; border-left: 0.5px dashed #94a3b8; padding: 1.2mm 2mm; text-align: right; }
    .dn-summary-continued { flex: 6; text-align: center; font-size: 8.5px; color: #64748b; }
    .dn-summary-label { font-size: 7.5px; color: #475569; }
    .dn-summary-value { font-size: 10px; }
    .dn-summary-total { background: #e2e8f0; }
    .dn-summary-total .dn-summary-value { font-weight: 700; }
  `;

  const html = pdfPage({ title: `納品書_${voucher.voucher_no}`, bodyHtml, extraStyle });
  const pdf = await htmlToPdfBuffer(html, { top: "10mm", right: "12mm", bottom: "10mm", left: "12mm" });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="delivery-note-${voucher.voucher_no}.pdf"`,
    },
  });
}
