// 作業ごとの背景色の確認。売上伝票・請求更新・商品マスタ・仕入伝票・入金伝票などの画面で、
// 一覧・入力の画面が決まった背景色になり、それ以外の画面は既定の色のままであること。
// 事前に `npm run dev` でアプリを起動しておいてください。
//   node scripts/smoke_work_colors.mjs

import { chromium } from "playwright";

const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const EXPECTED = [
  ["/sales-vouchers", "#e0f2fe"],
  ["/sales-vouchers/new", "#e0f2fe"],
  ["/billing-closings", "#dcfce7"],
  ["/products", "#fef9c3"],
  ["/purchase-vouchers/new", "#fce7f3"],
  ["/receipt-vouchers/new", "#efe4d4"],
  ["/payment-vouchers/new", "#ede9fe"],
  ["/payment-closings", "#ffedd5"],
  ["/customers", "#f8fafc"],
  ["/", "#f8fafc"],
];
const results = [];
function log(step, ok, extra = "") {
  results.push({ step, ok, extra });
  console.log((ok ? "OK  " : "FAIL") + " - " + step + (extra ? " :: " + extra : ""));
}

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
});
const page = await browser.newPage();
try {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[name="loginId"]', "admin");
  await page.fill('input[name="password"]', "changeme123");
  await page.click('button:has-text("ログイン")');
  await page.waitForURL(`${BASE_URL}/`, { timeout: 8000 });
  for (const [path, color] of EXPECTED) {
    await page.goto(`${BASE_URL}${path}`);
    const actual = await page.locator("[data-work-color]").first().getAttribute("data-work-color");
    log(`${path} background ${color}`, actual === color, actual ?? "");
  }
} catch (e) {
  log("exception", false, String(e));
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
