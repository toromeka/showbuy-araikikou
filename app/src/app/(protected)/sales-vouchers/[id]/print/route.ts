import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  escapeHtml,
  fitText,
  htmlToPdfBuffer,
  pdfPage,
  qtyStr,
  slashDate,
  slipCompanyHtml,
  SLIP_BASE_STYLE,
  unitPriceStr,
  yen,
} from "@/lib/pdf";
import type { sales_voucher_lines, sales_vouchers, customers, company_settings } from "@/generated/prisma/client";

// 納品書PDF。A4 1枚の上半分に「納品書」、下半分に「納品書（控）」を同じ内容で印刷する。
// 「納品書（控）」はお客様に受領印をもらって持ち帰る受領書を兼ねる。
// 用紙は上下の間にミシン目が入った色付きの用紙で、罫線も含めてすべてこちらで印刷する。
// そのため、各部の位置は実際の伝票（見本）を実測した寸法（mm）で固定し、
// 上下の区切りがA4のちょうど半分（148.5mm）のミシン目に来るようにしている。
// 明細が7品番を超える場合は複数枚に分けて出力し、小計・合計は最終ページに記載する。
const LINES_PER_SLIP = 7;
// 本文の文字の大きさ（見本の伝票の実測で約11pt）と、商品名欄の文字を置ける幅
const FONT_PX = 14.5;
const NAME_WIDTH_MM = 63;

function chunk<T>(arr: T[], size: number): T[][] {
  if (arr.length === 0) return [[]];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

type VoucherWithRelations = sales_vouchers & {
  sales_voucher_lines: sales_voucher_lines[];
  customers: customers;
};

function slipHtml(opts: {
  title: string;
  voucher: VoucherWithRelations;
  company: company_settings | null;
  lines: sales_voucher_lines[];
  pageIndex: number;
  totalPages: number;
  isLastPage: boolean;
  showTax: boolean;
}): string {
  const { title, voucher, company, lines, pageIndex, totalPages, isLastPage, showTax } = opts;

  const rows: string[] = [];
  for (let i = 0; i < LINES_PER_SLIP; i++) {
    const l = lines[i];
    if (l) {
      const remarks = [l.note, l.note2].filter((s) => s && s.trim()).join(" ");
      rows.push(`
        <tr>
          <td class="c">${l.line_no}</td>
          <td class="name">
            <div>${fitText(l.product_name, NAME_WIDTH_MM, FONT_PX)}</div>
            ${l.spec ? `<div>${fitText(l.spec, NAME_WIDTH_MM, FONT_PX)}</div>` : ""}
          </td>
          <td class="r">${qtyStr(l.quantity)}</td>
          <td class="c">${escapeHtml(l.unit)}</td>
          <td class="r">${l.sale_price != null ? unitPriceStr(l.sale_price) : ""}</td>
          <td class="r">${l.sale_amount != null ? yen(l.sale_amount) : ""}</td>
          <td class="note">${escapeHtml(remarks)}</td>
        </tr>`);
    } else {
      rows.push(`<tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`);
    }
  }

  // 請求書単位で消費税を計算する得意先は、納品書には消費税を記載せず、合計＝小計とする
  // （消費税は請求書でまとめて計算するため。見本の伝票と同じ扱い）。
  const tax = showTax ? Number(voucher.tax_amount) : 0;
  const total = Number(voucher.sales_amount) + tax;
  const pageLabel = totalPages > 1 ? `<div class="dn-pageno">${pageIndex + 1}／${totalPages}枚目</div>` : "";
  const cust = voucher.customers;
  const custAddr = [cust.address1, cust.address2].filter(Boolean).join(" ");

  return `
    <div class="dn-half">
      <div class="dn-title">${title}</div>
      ${pageLabel}
      <table class="dn-minibox">
        <tr><th>日　付</th><th>得意先</th><th>伝票番号</th></tr>
        <tr><td>${slashDate(voucher.voucher_date)}</td><td>${escapeHtml(voucher.customer_code)}</td><td>${escapeHtml(voucher.voucher_no)}</td></tr>
      </table>
      <div class="dn-zip">${cust.postal_code ? `〒${escapeHtml(cust.postal_code)}` : ""}</div>
      <div class="dn-addr">${fitText(custAddr, 110, FONT_PX)}</div>
      <div class="dn-cust"><span>${fitText(cust.name1, 95, FONT_PX)}</span><span>御中</span></div>
      <div class="dn-company sc-company">${slipCompanyHtml(company)}</div>
      <div class="dn-greeting">毎度ありがとうございます、下記の通り納品致します。</div>
      <div class="dn-body">
      <table class="dn-table">
        <colgroup><col style="width:8mm"><col style="width:66mm"><col style="width:23mm"><col style="width:11mm"><col style="width:29.5mm"><col style="width:29.5mm"><col style="width:23mm"></colgroup>
        <thead><tr><th>項</th><th>商　品　名 / 規　格</th><th>数　量</th><th>単位</th><th>単　価</th><th>金　額</th><th>備　考</th></tr></thead>
        <tbody>${rows.join("")}</tbody>
      </table>
      <table class="dn-summary">
        <colgroup><col style="width:78.5mm"><col style="width:29.5mm"><col style="width:29.5mm"><col style="width:29.5mm"><col style="width:23mm"></colgroup>
        <tr>
          <td><div class="lbl">[摘要]</div><div class="remarks">${fitText(voucher.remarks, 75, 12)}</div></td>
          ${
            isLastPage
              ? `<td><div class="lbl">[小計]</div><div class="val">${yen(voucher.sales_amount)}</div></td>
          <td><div class="lbl">[消費税]</div><div class="val">${showTax ? yen(tax) : ""}</div></td>
          <td class="total"><div class="lbl">[合計]</div><div class="val">${yen(total)}</div></td>`
              : `<td colspan="3" class="cont">次の用紙に続く</td>`
          }
          <td></td>
        </tr>
      </table>
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
      customers: { include: { customers: true } },
    },
  });
  if (!voucher) return new NextResponse("Not Found", { status: 404 });

  const company = await prisma.company_settings.findUnique({ where: { id: 1 } });
  // 消費税の計算方法は請求先（親の得意先）の設定に従う。1=明細単位のときだけ納品書に消費税を記載する。
  const billingCustomer = voucher.customers.customers ?? voucher.customers;
  const showTax = billingCustomer.calc_method === 1;

  const pages = chunk(voucher.sales_voucher_lines, LINES_PER_SLIP);
  const totalPages = pages.length;

  const bodyHtml = pages
    .map((lines, idx) => {
      const common = { voucher, company, lines, pageIndex: idx, totalPages, isLastPage: idx === totalPages - 1, showTax };
      return `
      <div class="dn-page">
        ${slipHtml({ ...common, title: "納　　品　　書" })}
        ${slipHtml({ ...common, title: "納　品　書（控）" })}
      </div>`;
    })
    .join("");

  // 位置はすべてA4用紙の左上からのmmで指定する（余白0で出力）。
  // 明細表と集計の段は、罫線が重ならないよう1つの枠の中に続けて並べる。
  const extraStyle = `
    ${SLIP_BASE_STYLE}
    .dn-page { position: relative; width: 210mm; height: 297mm; overflow: hidden; page-break-after: always; }
    .dn-page:last-child { page-break-after: auto; }
    .dn-half { position: relative; width: 210mm; height: 148.5mm; overflow: hidden; font-size: ${FONT_PX}px; }
    .dn-half > * { position: absolute; }
    .dn-title { left: 73mm; top: 9mm; width: 64mm; text-align: center; font-size: 27px; font-weight: 700; line-height: 1.2; border-bottom: 0.4mm solid #000; white-space: nowrap; }
    .dn-pageno { left: 73mm; top: 20.5mm; width: 64mm; text-align: center; font-size: 11px; }
    .dn-minibox { left: 147.5mm; top: 9.5mm; width: 55mm; border-collapse: collapse; table-layout: fixed; }
    .dn-minibox th, .dn-minibox td { border: 0.3mm solid #000; text-align: center; padding: 0; white-space: nowrap; }
    .dn-minibox th { height: 4.5mm; font-size: 12px; background: #e5e7eb; }
    .dn-minibox td { height: 6.5mm; font-size: ${FONT_PX}px; }
    .dn-minibox th:nth-child(1) { width: 25mm; } .dn-minibox th:nth-child(2) { width: 15.2mm; } .dn-minibox th:nth-child(3) { width: 14.8mm; }
    .dn-zip { left: 24.5mm; top: 25mm; }
    .dn-addr { left: 24.5mm; top: 33mm; min-width: 66mm; border-bottom: 0.3mm solid #000; padding-right: 2mm; white-space: nowrap; }
    .dn-cust { left: 24.5mm; top: 43mm; min-width: 66mm; display: flex; justify-content: space-between; align-items: baseline; gap: 4mm; border-bottom: 0.3mm solid #000; white-space: nowrap; }
    .dn-company { right: 7.5mm; top: 40mm; }
    .dn-greeting { left: 13.5mm; top: 59.5mm; font-size: 12px; }
    .dn-body { left: 12mm; top: 64.5mm; width: 190mm; }
    .dn-table, .dn-summary { width: 190mm; border-collapse: collapse; table-layout: fixed; }
    .dn-table { border: 0.4mm solid #000; }
    .dn-table th, .dn-table td { border: 0.3mm solid #000; height: 8.5mm; padding: 0 1.5mm; overflow: hidden; white-space: nowrap; line-height: 1.05; }
    .dn-table th { height: 8mm; background: #e5e7eb; text-align: center; }
    .dn-table tbody tr:nth-child(even) td { background: #f1f3f5; }
    .dn-table td.note { font-size: 11px; white-space: normal; line-height: 1.15; }
    .dn-summary { border: 0.4mm solid #000; border-top: none; }
    .dn-summary td { border: 0.3mm solid #000; border-top: none; height: 8.5mm; padding: 0.3mm 1.5mm; vertical-align: top; overflow: hidden; }
    .dn-summary .lbl { font-size: 12px; line-height: 1.05; }
    .dn-summary .val { text-align: right; line-height: 1.15; }
    .dn-summary .remarks { font-size: 12px; line-height: 1.15; white-space: nowrap; }
    .dn-summary .total { background: #e5e7eb; }
    .dn-summary .total .val { font-weight: 700; }
    .dn-summary .cont { text-align: center; vertical-align: middle; font-size: 12px; }
    .c { text-align: center; }
    .r { text-align: right; }
  `;

  const html = pdfPage({ title: `納品書_${voucher.voucher_no}`, bodyHtml, extraStyle });
  const pdf = await htmlToPdfBuffer(html, { top: "0", right: "0", bottom: "0", left: "0" });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="delivery-note-${voucher.voucher_no}.pdf"`,
    },
  });
}
