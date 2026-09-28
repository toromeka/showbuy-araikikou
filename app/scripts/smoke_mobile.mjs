// スマホ（iPhoneの画面幅 390px）での表示の確認。
// - 主な画面が横にはみ出さない（表は表の中で横にスクロールする）
// - 画面上部の「メニュー」で各画面へのリンクが開き、選ぶと移動してメニューが閉じる
// - 入力欄の文字が16px以上（iPhoneのSafariで入力欄を触ったときに画面が拡大されない）
// - 得意先・商品の入力欄の「検索」ボタンで検索ダイアログが開く（スマホにはF8キーが無いため）
// 売上伝票が1件以上登録されていること。事前に `npm run dev` でアプリを起動しておいてください。
//   node scripts/smoke_mobile.mjs

import { chromium } from "playwright";

const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const PAGES = [
  "/",
  "/sales-vouchers",
  "/sales-vouchers/new",
  "/purchase-vouchers",
  "/purchase-vouchers/new",
  "/receipt-vouchers/new",
  "/payment-vouchers/new",
  "/quotations/new",
  "/customers",
  "/suppliers",
  "/products",
  "/billing-closings",
  "/inventory-ledger",
  "/print-jobs",
  "/daily-import",
  "/users",
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
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await context.newPage();

try {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[name="loginId"]', "admin");
  await page.fill('input[name="password"]', "changeme123");
  await page.click('button:has-text("ログイン")');
  await page.waitForURL(`${BASE_URL}/`, { timeout: 8000 });

  // 1. 横にはみ出さない
  const overflowing = [];
  for (const path of PAGES) {
    await page.goto(`${BASE_URL}${path}`);
    await page.waitForLoadState("networkidle");
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    if (width > 390) overflowing.push(`${path}(${width}px)`);
  }
  log(`${PAGES.length} pages fit the phone width`, overflowing.length === 0, overflowing.join(", "));

  // 詳細画面（一覧の先頭の売上伝票）
  await page.goto(`${BASE_URL}/sales-vouchers`);
  await page.locator('tbody a[href^="/sales-vouchers/"]').first().click();
  await page.waitForURL(/\/sales-vouchers\/\d+$/);
  log("voucher detail fits the phone width", (await page.evaluate(() => document.documentElement.scrollWidth)) <= 390);

  // 2. メニュー
  await page.goto(`${BASE_URL}/`);
  log("desktop menu hidden on phone", !(await page.locator('header a:visible', { hasText: "得意先マスタ" }).count()));
  await page.click('button:has-text("メニュー")');
  await page.locator("nav a:visible", { hasText: "得意先マスタ" }).click();
  await page.waitForURL(`${BASE_URL}/customers`, { timeout: 8000 });
  log("menu opens and navigates, then closes", (await page.locator('button:has-text("メニュー")').count()) === 1);

  // 3. 入力欄の文字の大きさ
  await page.goto(`${BASE_URL}/sales-vouchers/new`);
  const sizes = await page.evaluate(() =>
    [...document.querySelectorAll("input:not([type=checkbox]), select, textarea")].map((el) => parseFloat(getComputedStyle(el).fontSize)),
  );
  log("input font size is at least 16px", sizes.length > 0 && Math.min(...sizes) >= 16, `min=${Math.min(...sizes)}px`);

  // 4. 検索ボタン
  await page.locator('button[aria-label="検索"]').first().tap();
  await page.waitForSelector("text=得意先検索", { timeout: 8000 });
  log("search button opens customer search", true);
  await page.click('button:has-text("閉じる")');
  await page.locator('button[aria-label="商品検索"]').first().tap();
  await page.waitForSelector("text=商品検索", { timeout: 8000 });
  log("search button opens product search", true);
} catch (e) {
  log("exception", false, String(e));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
