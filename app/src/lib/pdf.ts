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
