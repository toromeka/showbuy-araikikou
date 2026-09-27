import { chromium } from "playwright";

// 伝票PDF出力（請求書・納品書・見積書）の共通ヘルパー。
// HTMLをChromium（Playwright）でPDF化する方式を採用している。
// 理由: サーバー環境にNoto Sans/Serif CJKフォントが導入済みで日本語のレイアウト・改ページが
// ブラウザの印刷エンジンにそのまま任せられるため、@react-pdf/renderer等でのフォント埋め込みより
// 実装・保守が簡単。他の帳票（一覧CSV等）と違いバイナリを都度生成するため、ブラウザは
// リクエストの都度起動・終了する（常駐させない）。
export async function htmlToPdfBuffer(
  html: string,
  margin: { top: string; right: string; bottom: string; left: string } = {
    top: "14mm",
    right: "12mm",
    bottom: "14mm",
    left: "12mm",
  },
): Promise<Buffer> {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin,
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

export function escapeHtml(s: unknown): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function yen(n: { toString(): string } | number | string | null | undefined): string {
  return Math.round(Number(n ?? 0)).toLocaleString("ja-JP");
}

export function dateStr(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

// 2026/09/25 の形（納品書）
export function slashDate(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 10).replace(/-/g, "/") : "";
}

// 2026年 9月 25日 の形（見積書）
export function jpDate(d: Date | null | undefined): string {
  if (!d) return "";
  const [y, m, day] = d.toISOString().slice(0, 10).split("-").map(Number);
  return `${y}年 ${m}月 ${day}日`;
}

// 数量は小数点以下の不要な0を付けない（1.000 → 1、2.500 → 2.5）
export function qtyStr(n: { toString(): string } | number | null | undefined): string {
  if (n === null || n === undefined) return "";
  return Number(n).toLocaleString("ja-JP", { maximumFractionDigits: 3 });
}

// 単価は小数点以下2桁まで表示する（4,870.00）
export function unitPriceStr(n: { toString(): string } | number | null | undefined): string {
  if (n === null || n === undefined) return "";
  return Number(n).toLocaleString("ja-JP", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// 納品書・見積書に使うフォント。見本の伝票（MSゴシック）と字形・文字幅が互換の等幅フォント「IPAゴシック」
// （Dockerfileで fonts-ipafont-gothic を導入）を、数字・英字も含めてすべての文字に使う。
// 等幅なので全角=1文字幅、半角=0.5文字幅となり、文字数から印刷幅を正確に見積もれる（fitText）。
export const SLIP_FONT = `"IPAGothic", "IPAゴシック", monospace`;

const PX_PER_MM = 96 / 25.4;

function isHalfWidth(ch: string): boolean {
  const c = ch.codePointAt(0) ?? 0;
  return c <= 0x7e || (c >= 0xff61 && c <= 0xff9f);
}

// 文字列の幅（全角1文字=1）
export function emWidth(s: string): number {
  let w = 0;
  for (const ch of s) w += isHalfWidth(ch) ? 0.5 : 1;
  return w;
}

// 欄の幅（mm）に収まらない長い文字は、その欄だけ文字を小さくして印刷する（最小は基準の6割）
export function fitText(s: string | null | undefined, widthMm: number, basePx: number): string {
  const text = s ?? "";
  const w = emWidth(text);
  const maxPx = (widthMm * PX_PER_MM) / Math.max(w, 1);
  if (w === 0 || maxPx >= basePx) return escapeHtml(text);
  const px = Math.max(basePx * 0.6, Math.floor(maxPx * 10) / 10);
  return `<span style="font-size:${px}px">${escapeHtml(text)}</span>`;
}

// 「TEL(076)…」は詰めて、「TEL 076-…」のように数字で始まる場合は空白を入れる
const telSep = (v: string) => (/^[0-9０-９]/.test(v) ? " " : "");

const LEGAL_FORMS = ["有限会社", "株式会社", "合同会社", "合資会社", "合名会社"];

// 納品書・見積書の右側に印刷する自社の表記（見本の伝票に合わせて、「有限会社」を小さく、
// 社名を大きく字間を空けて印刷し、その下に〒・住所、TEL、FAXを右寄せで並べる）。
// 表記は自社情報の画面で登録した文字をそのまま使う（例: TEL「(076)257-0811(代)」）。
export function slipCompanyHtml(company: CompanySettings | null): string {
  if (!company) return "";
  const name = company.company_name.trim();
  const form = LEGAL_FORMS.find((f) => name.startsWith(f));
  const body = form ? name.slice(form.length).trim() : name;
  const addr = [company.address1, company.address2].filter(Boolean).join(" ");
  return `
    <div class="sc-name">${form ? `<span class="sc-form">${escapeHtml(form)}</span>` : ""}<span class="sc-body">${escapeHtml(body)}</span></div>
    ${company.postal_code || addr ? `<div class="sc-addr">${company.postal_code ? `〒${escapeHtml(company.postal_code)} ` : ""}${escapeHtml(addr)}</div>` : ""}
    ${company.phone ? `<div>TEL${telSep(company.phone)}${escapeHtml(company.phone)}</div>` : ""}
    ${company.fax ? `<div>FAX${telSep(company.fax)}${escapeHtml(company.fax)}</div>` : ""}`;
}

// 納品書・見積書の共通スタイル（フォントと自社の表記）
export const SLIP_BASE_STYLE = `
  @page { size: A4; margin: 0; }
  html, body { font-family: ${SLIP_FONT}; color: #000; }
  th { font-weight: 400; }
  .sc-company { text-align: right; font-size: 13.5px; line-height: 1.3; }
  .sc-name { white-space: nowrap; margin-bottom: 1mm; }
  .sc-form { font-size: 12px; letter-spacing: 0.4em; margin-right: 1mm; }
  .sc-body { font-size: 19px; font-weight: 700; letter-spacing: 0.9em; margin-right: -0.9em; }
  .sc-addr { letter-spacing: 0.1em; white-space: nowrap; }
`;

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

type CompanySettings = {
  company_name: string;
  postal_code: string | null;
  address1: string | null;
  address2: string | null;
  phone: string | null;
  fax: string | null;
  invoice_registration_no: string | null;
};

export function companyInfoHtml(company: CompanySettings | null, staffName?: string | null): string {
  if (!company) return "";
  const addr = [company.address1, company.address2].filter(Boolean).join(" ");
  return `
    <div style="text-align:right; font-size:11px; line-height:1.7;">
      <div style="font-size:14px; font-weight:700; margin-bottom:2px;">${escapeHtml(company.company_name)}</div>
      ${company.postal_code ? `<div>〒${escapeHtml(company.postal_code)}</div>` : ""}
      ${addr ? `<div>${escapeHtml(addr)}</div>` : ""}
      ${
        company.phone || company.fax
          ? `<div>${company.phone ? `TEL ${escapeHtml(company.phone)}` : ""}${company.phone && company.fax ? "　" : ""}${company.fax ? `FAX ${escapeHtml(company.fax)}` : ""}</div>`
          : ""
      }
      ${company.invoice_registration_no ? `<div>登録番号: ${escapeHtml(company.invoice_registration_no)}</div>` : ""}
      ${staffName ? `<div>担当: ${escapeHtml(staffName)}</div>` : ""}
    </div>`;
}

type OwnBank = {
  name: string;
  branch_name: string | null;
  account_type: string | null;
  account_number: string | null;
  account_holder: string | null;
};

export function bankInfoHtml(bank: OwnBank | null): string {
  if (!bank) return "";
  return `
    <div style="margin-top:14px; font-size:11px;">
      <div style="font-weight:700; margin-bottom:2px;">お振込先</div>
      <div>${escapeHtml(bank.name)}${bank.branch_name ? ` ${escapeHtml(bank.branch_name)}支店` : ""} ${escapeHtml(bank.account_type || "")} ${escapeHtml(bank.account_number || "")}</div>
      ${bank.account_holder ? `<div>口座名義: ${escapeHtml(bank.account_holder)}</div>` : ""}
    </div>`;
}

export function pdfPage(opts: { title: string; bodyHtml: string; extraStyle?: string }): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(opts.title)}</title>
<style>
  * { box-sizing: border-box; }
  html, body {
    font-family: "Noto Sans CJK JP", "Noto Sans JP", "Hiragino Sans", sans-serif;
    color: #1e293b;
    font-size: 11px;
    margin: 0;
    padding: 0;
  }
  h1.doc-title {
    text-align: center;
    font-size: 22px;
    font-weight: 700;
    letter-spacing: 0.4em;
    margin: 0 0 22px;
  }
  table { border-collapse: collapse; width: 100%; }
  .lines-table th, .lines-table td {
    border: 1px solid #cbd5e1;
    padding: 5px 7px;
  }
  .lines-table th { background: #f1f5f9; font-weight: 700; font-size: 10.5px; }
  .lines-table td { vertical-align: top; }
  .text-right { text-align: right; }
  .text-center { text-align: center; }
  .muted { color: #64748b; }
  .totals-table td { border: 1px solid #cbd5e1; padding: 6px 10px; }
  .summary-table th, .summary-table td { border: 1px solid #cbd5e1; padding: 6px 8px; }
  .summary-table th { background: #f1f5f9; font-weight: 700; }
  .header-table td { vertical-align: top; padding: 0; border: none; }
  ${opts.extraStyle ?? ""}
</style>
</head>
<body>
${opts.bodyHtml}
</body>
</html>`;
}
