import { prisma } from "@/lib/prisma";
import type { PrintedPdf } from "@/lib/pdf";
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
// 納品書用の帳票用紙（プリンターのカセット3）のミシン目の位置: A4用紙の上端から148.5mm（ちょうど半分）。
// 2026-09 に実際の用紙に印刷して、納品書と納品書（控）の区切りがミシン目に合うことを確認済み。
// レイアウトを変えるときも、上半分（納品書）・下半分（納品書（控））の区切りはこの位置に合わせること。
const PERFORATION_MM = 148.5;
// 本文の文字の大きさ（見本の伝票の実測で約11pt）と、商品名欄の文字を置ける幅
// 2026-10 に、見本より2ポイント大きくした（14.5px → 17.2px）
const FONT_PX = 17.2;
// 小さめの文字（見出しのラベル・備考・挨拶文など）
const SMALL_PX = 14.7;

// 明細の列の幅（mm）。左から 項・商品名／規格・数量・単位・単価・金額・備考（合計190mm）
const COLS = { no: 7, name: 80, qty: 15, unit: 10, price: 25, amount: 24, note: 29 };
// 各欄の中で文字を置ける幅（左右の余白1.5mmずつを引いたもの）
const inner = (mm: number) => mm - 3;
const NAME_WIDTH_MM = inner(COLS.name);

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
      // 商品名と規格、備考1と備考2は、それぞれ行の上の段・下の段に固定して印刷する（実際の伝票と同じ。
      // 規格や備考2が空でも、商品名・備考1は必ず上の段に出す）
      rows.push(`
        <tr>
          <td class="c">${l.line_no}</td>
          <td class="two">
            <div>${fitText(l.product_name, NAME_WIDTH_MM, FONT_PX)}</div>
            <div>${fitText(l.spec, NAME_WIDTH_MM, FONT_PX)}</div>
          </td>
          <td class="r">${fitText(qtyStr(l.quantity), inner(COLS.qty), FONT_PX)}</td>
          <td class="c">${fitText(l.unit, inner(COLS.unit), FONT_PX)}</td>
          <td class="r">${l.sale_price != null ? fitText(unitPriceStr(l.sale_price), inner(COLS.price), FONT_PX) : ""}</td>
          <td class="r">${l.sale_amount != null ? fitText(yen(l.sale_amount), inner(COLS.amount), FONT_PX) : ""}</td>
          <td class="two note">
            <div>${fitText(l.note, inner(COLS.note), SMALL_PX)}</div>
            <div>${fitText(l.note2, inner(COLS.note), SMALL_PX)}</div>
          </td>
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
      <div class="dn-addr">${fitText(custAddr, 105, FONT_PX)}</div>
      <div class="dn-cust"><span>${fitText(cust.name1, 92, FONT_PX)}</span><span>御中</span></div>
      <div class="dn-company sc-company">${slipCompanyHtml(company)}</div>
      <div class="dn-greeting">毎度ありがとうございます、下記の通り納品致します。</div>
      <div class="dn-body">
      <table class="dn-table">
        <colgroup>${[COLS.no, COLS.name, COLS.qty, COLS.unit, COLS.price, COLS.amount, COLS.note].map((w) => `<col style="width:${w}mm">`).join("")}</colgroup>
        <thead><tr><th>項</th><th>商　品　名 / 規　格</th><th>数量</th><th>単位</th><th>単　価</th><th>金　額</th><th>備　考</th></tr></thead>
        <tbody>${rows.join("")}</tbody>
      </table>
      <table class="dn-summary">
        <colgroup>${[COLS.no + COLS.name, COLS.qty + COLS.unit, COLS.price, COLS.amount, COLS.note].map((w) => `<col style="width:${w}mm">`).join("")}</colgroup>
        <tr>
          <td><div class="lbl">[摘要]</div><div class="remarks">${fitText(voucher.remarks, inner(COLS.no + COLS.name), SMALL_PX)}</div></td>
          ${
            isLastPage
              ? `<td><div class="lbl">[小計]</div><div class="val">${fitText(yen(voucher.sales_amount), inner(COLS.qty + COLS.unit), FONT_PX)}</div></td>
          <td><div class="lbl">[消費税]</div><div class="val">${showTax ? fitText(yen(tax), inner(COLS.price), FONT_PX) : ""}</div></td>
          <td class="total"><div class="lbl">[合計]</div><div class="val">${fitText(yen(total), inner(COLS.amount), FONT_PX)}</div></td>`
              : `<td colspan="3" class="cont">次の用紙に続く</td>`
          }
          <td></td>
        </tr>
      </table>
      </div>
    </div>`;
}

export async function deliveryNotePdf(id: string): Promise<PrintedPdf | null> {
  if (!/^\d+$/.test(id)) return null;

  const voucher = await prisma.sales_vouchers.findUnique({
    where: { id: BigInt(id) },
    include: {
      sales_voucher_lines: { orderBy: { line_no: "asc" } },
      customers: { include: { customers: true } },
    },
  });
  if (!voucher) return null;

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
  // 2026-10: 自社名などを上へ詰め、空いた分だけ明細の行を高くした（8.5mm → 10.2mm）。
  // 明細の枠と、日付・得意先・伝票番号の枠の左右両端の縦の罫線は、旧伝票と同じく引かない。
  const extraStyle = `
    ${SLIP_BASE_STYLE}
    .dn-page { position: relative; width: 210mm; height: 297mm; overflow: hidden; page-break-after: always; }
    .dn-page:last-child { page-break-after: auto; }
    .dn-half { position: relative; width: 210mm; height: ${PERFORATION_MM}mm; overflow: hidden; font-size: ${FONT_PX}px; }
    .dn-half > * { position: absolute; }
    .dn-title { left: 70mm; top: 7.5mm; width: 70mm; text-align: center; font-size: 30px; font-weight: 700; line-height: 1.2; border-bottom: 0.4mm solid #000; white-space: nowrap; }
    .dn-pageno { left: 70mm; top: 19.5mm; width: 70mm; text-align: center; font-size: 13px; }
    .dn-minibox { left: 145.5mm; top: 8mm; width: 57mm; border-collapse: collapse; table-layout: fixed; }
    .dn-minibox th, .dn-minibox td { border: 0.3mm solid #000; text-align: center; padding: 0; white-space: nowrap; }
    .dn-minibox th { height: 5mm; font-size: ${SMALL_PX}px; background: #e5e7eb; }
    .dn-minibox td { height: 7mm; font-size: ${FONT_PX}px; }
    .dn-minibox tr > :first-child { border-left: none; }
    .dn-minibox tr > :last-child { border-right: none; }
    .dn-minibox th:nth-child(1) { width: 25mm; } .dn-minibox th:nth-child(2) { width: 14.5mm; } .dn-minibox th:nth-child(3) { width: 17.5mm; }
    .dn-zip { left: 22mm; top: 20.5mm; }
    .dn-addr { left: 22mm; top: 27.5mm; min-width: 70mm; border-bottom: 0.3mm solid #000; padding-right: 2mm; white-space: nowrap; }
    .dn-cust { left: 22mm; top: 36mm; min-width: 70mm; display: flex; justify-content: space-between; align-items: baseline; gap: 4mm; border-bottom: 0.3mm solid #000; white-space: nowrap; }
    .dn-company { right: 7.5mm; top: 22.5mm; }
    .dn-company.sc-company { font-size: 16.2px; line-height: 1.25; }
    .dn-company .sc-form { font-size: ${SMALL_PX}px; }
    .dn-company .sc-body { font-size: 21.7px; }
    .dn-greeting { left: 13.5mm; top: 45mm; font-size: ${SMALL_PX}px; }
    .dn-body { left: 12mm; top: 50.5mm; width: 190mm; }
    .dn-table, .dn-summary { width: 190mm; border-collapse: collapse; table-layout: fixed; }
    .dn-table { border-top: 0.4mm solid #000; border-bottom: 0.4mm solid #000; }
    .dn-table th, .dn-table td { border: 0.3mm solid #000; height: 10.2mm; padding: 0 1.5mm; overflow: hidden; white-space: nowrap; line-height: 1.05; }
    .dn-table th { height: 8mm; background: #e5e7eb; text-align: center; }
    .dn-table tbody tr:nth-child(even) td { background: #f1f3f5; }
    .dn-table td.two { padding-top: 0; padding-bottom: 0; vertical-align: top; }
    .dn-table td.two > div { height: 5.1mm; line-height: 5.1mm; overflow: hidden; }
    .dn-table td.note { font-size: ${SMALL_PX}px; }
    .dn-summary { border-bottom: 0.4mm solid #000; }
    .dn-summary td { border: 0.3mm solid #000; border-top: none; height: 10mm; padding: 0.4mm 1.5mm; vertical-align: top; overflow: hidden; }
    .dn-table tr > :first-child, .dn-summary td:first-child { border-left: none; }
    .dn-table tr > :last-child, .dn-summary td:last-child { border-right: none; }
    .dn-summary .lbl { font-size: ${SMALL_PX}px; line-height: 1.05; }
    .dn-summary .val { text-align: right; line-height: 1.2; }
    .dn-summary .remarks { font-size: ${SMALL_PX}px; line-height: 1.15; white-space: nowrap; }
    .dn-summary .total { background: #e5e7eb; }
    .dn-summary .total .val { font-weight: 700; }
    .dn-summary .cont { text-align: center; vertical-align: middle; font-size: ${SMALL_PX}px; }
    .c { text-align: center; }
    .r { text-align: right; }
  `;

  const html = pdfPage({ title: `納品書_${voucher.voucher_no}`, bodyHtml, extraStyle });
  const pdf = await htmlToPdfBuffer(html, { top: "0", right: "0", bottom: "0", left: "0" });

  return { pdf, filename: `delivery-note-${voucher.voucher_no}.pdf` };
}
