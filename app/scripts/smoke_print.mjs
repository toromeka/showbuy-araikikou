// 納品書・見積書の印刷内容と自社情報画面の動作確認。
// - 管理者は自社情報を変更でき、その内容が納品書・見積書に印刷される（確認後に元へ戻す）
// - 納品書は「納品書」「納品書（控）」の2つを1枚に印刷し、日付は 2026/09/25 の形
// - 見積書に御見積金額（¥327,500- の形）、「※ 合 計 ※」の行、消費税の注記が印刷される
// 売上伝票・見積書が1件以上登録されていること。事前に `npm run dev` でアプリを起動しておいてください。
//   node scripts/smoke_print.mjs

import { chromium } from "playwright";
import { PDFParse } from "pdf-parse";

const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const results = [];
function log(step, ok, extra = "") {
  results.push({ step, ok, extra });
  console.log((ok ? "OK  " : "FAIL") + " - " + step + (extra ? " :: " + extra : ""));
}

async function pdfText(page, path) {
  const res = await page.request.get(`${BASE_URL}${path}`);
  if (!res.ok()) return "";
  const parser = new PDFParse({ data: await res.body() });
  const { text } = await parser.getText();
  await parser.destroy();
  return text.replace(/\s+/g, "");
}

async function firstId(page, listPath, re) {
  await page.goto(`${BASE_URL}${listPath}`);
  const hrefs = await page.locator("tbody a").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  return hrefs.map((h) => h?.match(re)?.[1]).find(Boolean);
}

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
});
const page = await browser.newPage();

const FIELDS = ["company_name", "postal_code", "address1", "phone", "fax"];
let original = null;
try {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[name="loginId"]', "admin");
  await page.fill('input[name="password"]', "changeme123");
  await page.click('button:has-text("ログイン")');
  await page.waitForURL(`${BASE_URL}/`, { timeout: 8000 });
  log("admin sees company settings menu", (await page.locator("nav >> text=自社情報").count()) === 1);

  // 1. 自社情報を変更
  await page.goto(`${BASE_URL}/company-settings`);
  original = {};
  for (const f of FIELDS) original[f] = await page.inputValue(`input[name="${f}"]`);
  await page.fill('input[name="company_name"]', "有限会社印刷確認");
  await page.fill('input[name="address1"]', "金沢市印刷確認町1-1");
  await page.fill('input[name="phone"]', "(076)000-0000(代)");
  await page.click('button:has-text("保存")');
  await page.waitForSelector("text=保存しました", { timeout: 8000 });
  log("company settings saved", true);

  // 2. 納品書
  const salesId = await firstId(page, "/sales-vouchers", /\/sales-vouchers\/(\d+)$/);
  const dn = await pdfText(page, `/sales-vouchers/${salesId}/print`);
  log("delivery note has original and copy", dn.includes("納品書") && dn.includes("納品書（控）"));
  log("delivery note date is yyyy/mm/dd", /\d{4}\/\d{2}\/\d{2}/.test(dn));
  log("delivery note prints company settings", dn.includes("印刷確認") && dn.includes("金沢市印刷確認町1-1") && dn.includes("(076)000-0000(代)"));

  // 3. 見積書
  const quotationId = await firstId(page, "/quotations", /\/quotations\/(\d+)$/);
  const q = await pdfText(page, `/quotations/${quotationId}/print`);
  log("quotation has amount like ¥327,500-", /御見積金額¥[\d,]+-/.test(q));
  log("quotation has total row", q.includes("※合計※"));
  log("quotation has condition lines", ["受渡場所", "支払条件", "納期", "荷造運賃", "有効期限"].every((s) => q.includes(s)));
  log("quotation has tax note", q.includes("※上記価格には消費税は"));
  log("quotation date is yyyy年m月d日", /\d{4}年\d{1,2}月\d{1,2}日/.test(q));
  log("quotation prints company settings", q.includes("印刷確認") && q.includes("(076)000-0000(代)"));
} catch (e) {
  log("exception", false, String(e));
} finally {
  // 自社情報を元に戻す
  if (original) {
    await page.goto(`${BASE_URL}/company-settings`);
    for (const f of FIELDS) await page.fill(`input[name="${f}"]`, original[f]);
    await page.click('button:has-text("保存")');
    await page.waitForSelector("text=保存しました", { timeout: 8000 }).catch(() => {});
    log("company settings restored", (await page.inputValue('input[name="company_name"]')) === original.company_name);
  }
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
