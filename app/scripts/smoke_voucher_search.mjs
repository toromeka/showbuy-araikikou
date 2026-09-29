// 伝票検索の動作確認。
// - 種類のチェック・得意先（名前の一部）・商品名で探せ、伝票ごと・明細ごとの表示を切り替えられる
// - 商品名は全角カナ・ひらがな・半角カナのどれで入力しても同じ結果になる
// - 得意先コードは先頭の0を省いても（54 → 0054）探せる
// - 商品名で探すときは、入金・支払伝票は対象外である旨が出る
// - CSVファイルで出力できる（Excelで開けるBOM付きUTF-8）
// - 結果の伝票番号から伝票の詳細画面に移れる
// 得意先 0054（竹田栄鉄工）の売上伝票に、商品名に「ｺｰﾄ」を含む明細があること（移行済みの実データ）。
// 事前に `npm run dev` でアプリを起動しておいてください。
//   node scripts/smoke_voucher_search.mjs

import { chromium } from "playwright";
import fs from "node:fs";

const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const results = [];
function log(step, ok, extra = "") {
  results.push({ step, ok, extra });
  console.log((ok ? "OK  " : "FAIL") + " - " + step + (extra ? " :: " + extra : ""));
}
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
});
const page = await (await browser.newContext({ acceptDownloads: true })).newPage();
const text = async () => (await page.textContent("main")).replace(/\s+/g, " ");
const count = async () => Number(((await text()).match(/検索結果: ([0-9,]+)件/) ?? [, "-1"])[1].replace(/,/g, ""));

try {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[name="loginId"]', "admin");
  await page.fill('input[name="password"]', "changeme123");
  await page.click('button:has-text("ログイン")');
  await page.waitForURL(`${BASE_URL}/`, { timeout: 8000 });
  log("menu has voucher search", (await page.locator("nav >> text=伝票検索").count()) === 1);

  // 1. フォームから検索（売上だけ・得意先の名前の一部・全角カナの商品名）
  await page.goto(`${BASE_URL}/voucher-search`);
  for (const t of ["purchase", "receipt", "payment"]) await page.uncheck(`input[name="type"][value="${t}"]`);
  await page.fill('input[name="partner"]', "竹田");
  await page.fill('input[name="product"]', "コート");
  await page.click('button:has-text("検索")');
  await page.waitForSelector("text=検索結果", { timeout: 15000 });
  const full = await count();
  log("search by partner name and product (full-width kana)", full > 0, `${full}件`);
  log("only sales vouchers shown", !(await text()).includes("仕入伝票 ") || (await page.locator("tbody >> text=仕入伝票").count()) === 0);

  // 2. 表記ゆれ・コードの0省略
  await page.goto(`${BASE_URL}/voucher-search?type=sales&partner=${encodeURIComponent("竹田")}&product=${encodeURIComponent("こーと")}`);
  await page.waitForSelector("text=検索結果");
  const hira = await count();
  await page.goto(`${BASE_URL}/voucher-search?type=sales&partner=54&product=${encodeURIComponent("ｺｰﾄ")}`);
  await page.waitForSelector("text=検索結果");
  const half = await count();
  log("hiragana / half-width kana / unpadded code give the same result", hira === full && half === full, `全角${full} ひらがな${hira} 半角+コード54 ${half}`);

  // 3. 明細ごとの表示
  await page.goto(`${BASE_URL}/voucher-search?type=sales&partner=0054&product=${encodeURIComponent("コート")}&view=line`);
  await page.waitForSelector("text=検索結果");
  log("line view shows matching lines", /明細 [0-9,]+行/.test(await text()) && (await page.locator("tbody tr").count()) >= full);

  // 4. 商品名で探すときは入金・支払伝票は対象外
  await page.goto(`${BASE_URL}/voucher-search?type=sales&type=receipt&partner=0054&product=${encodeURIComponent("コート")}`);
  await page.waitForSelector("text=検索結果");
  log("receipt vouchers excluded when searching by product", (await text()).includes("入金伝票には商品の明細が無いため"));

  // 5. CSV
  await page.goto(`${BASE_URL}/voucher-search`);
  await page.fill('input[name="partner"]', "0054");
  await page.check('input[name="view"][value="csv"]');
  const [download] = await Promise.all([page.waitForEvent("download"), page.click('button:has-text("検索")')]);
  const buf = fs.readFileSync(await download.path());
  const csv = buf.toString("utf8");
  log("CSV downloaded with BOM and header", buf[0] === 0xef && csv.includes("種類,伝票番号,伝票日付") && csv.includes("竹田栄鉄工"), download.suggestedFilename());

  // 6. 結果から詳細画面へ
  await page.goto(`${BASE_URL}/voucher-search?type=sales&partner=0054`);
  await page.waitForSelector("text=検索結果");
  await page.locator('tbody a[href^="/sales-vouchers/"]').first().click();
  await page.waitForURL(/\/sales-vouchers\/\d+$/, { timeout: 8000 });
  log("voucher number links to the detail page", true);
} catch (e) {
  log("exception", false, String(e));
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
