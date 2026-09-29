// 伝票検索の動作確認。
// - 種類のチェック・得意先（名前の一部）・商品名で探せる。表示モードの既定は明細モードで、
//   検索した後に伝票モードに切り替えると、すぐに表示し直される
// - 見出しを押すと並べ替えられる（商品名はふりがな順、もう一度押すと逆順）
// - 行を押すと、その伝票の内容が重ねて表示され、「閉じる」で検索結果に戻り、「詳細画面を開く」で伝票の画面に移れる
// - 商品名は全角カナ・ひらがな・半角カナのどれで入力しても同じ結果になる
// - 得意先コードは先頭の0を省いても（54 → 0054）探せる
// - 商品名で探すときは、入金・支払伝票は対象外である旨が出る
// - CSVファイルで出力できる（Excelで開けるBOM付きUTF-8）
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
  log("only sales vouchers shown", (await page.locator("tbody >> text=仕入伝票").count()) === 0);
  log("default view is line mode", (await page.locator("th >> text=商品名（ふりがな順）").count()) === 1);

  // 1-2. 検索した後に伝票モードへ切り替えると、すぐに表示し直される
  await page.click('label:has-text("伝票モード")');
  await page.waitForURL(/view=voucher/, { timeout: 8000 });
  await page.waitForSelector("text=検索結果");
  log("switching to voucher mode re-renders at once", (await count()) === full && (await page.locator("th >> text=明細").count()) === 1);

  // 2. 表記ゆれ・コードの0省略
  await page.goto(`${BASE_URL}/voucher-search?type=sales&partner=${encodeURIComponent("竹田")}&product=${encodeURIComponent("こーと")}`);
  await page.waitForSelector("text=検索結果");
  const hira = await count();
  await page.goto(`${BASE_URL}/voucher-search?type=sales&partner=54&product=${encodeURIComponent("ｺｰﾄ")}`);
  await page.waitForSelector("text=検索結果");
  const half = await count();
  log("hiragana / half-width kana / unpadded code give the same result", hira === full && half === full, `全角${full} ひらがな${hira} 半角+コード54 ${half}`);

  // 3. 明細モードの表示と並べ替え
  await page.goto(`${BASE_URL}/voucher-search?type=sales&type=purchase&partner=0054`);
  await page.waitForSelector("text=検索結果");
  log("line view shows lines", /明細 [0-9,]+行/.test(await text()) && (await page.locator("tbody tr").count()) > 0);
  const dates = await page.locator("tbody tr td:nth-child(3)").allTextContents();
  log("default order is newest date first", dates.join() === [...dates].sort().reverse().join());
  await page.click('th button:has-text("商品名")');
  const names1 = await page.locator("tbody tr td:nth-child(5)").allTextContents();
  await page.click('th button:has-text("商品名")');
  const names2 = await page.locator("tbody tr td:nth-child(5)").allTextContents();
  log("sort by product name toggles ascending / descending", names1.length > 1 && names1.join() === [...names2].reverse().join() && names1.join() !== names2.join());

  // 3-2. 行を押すと伝票の内容が重ねて表示される
  const firstNo = (await page.locator("tbody tr td:nth-child(2)").first().textContent()).trim();
  await page.locator("tbody tr").first().click();
  await page.waitForSelector('[role="dialog"]', { timeout: 8000 });
  log("clicking a line opens the voucher", (await page.locator('[role="dialog"]').textContent()).includes(firstNo), firstNo);
  await page.click('[role="dialog"] button:has-text("閉じる")');
  log("close returns to the results", (await page.locator('[role="dialog"]').count()) === 0 && (await page.locator("tbody tr").count()) > 0);

  // 4. 商品名で探すときは入金・支払伝票は対象外
  await page.goto(`${BASE_URL}/voucher-search?type=sales&type=receipt&partner=0054&product=${encodeURIComponent("コート")}`);
  await page.waitForSelector("text=検索結果");
  log("receipt vouchers excluded when searching by product", (await text()).includes("入金伝票には商品の明細が無いため"));

  // 5. CSV
  await page.goto(`${BASE_URL}/voucher-search`);
  await page.fill('input[name="partner"]', "0054");
  await page.check('input[name="out"][value="csv"]');
  const [download] = await Promise.all([page.waitForEvent("download"), page.click('button:has-text("検索")')]);
  const buf = fs.readFileSync(await download.path());
  const csv = buf.toString("utf8");
  log("CSV downloaded with BOM and header", buf[0] === 0xef && csv.includes("種類,伝票番号,伝票日付") && csv.includes("竹田栄鉄工"), download.suggestedFilename());

  // 6. 重ねて表示した伝票から詳細画面へ
  await page.goto(`${BASE_URL}/voucher-search?type=sales&partner=0054&view=voucher`);
  await page.waitForSelector("text=検索結果");
  await page.locator("tbody tr").first().click();
  await page.click('[role="dialog"] a:has-text("詳細画面を開く")');
  await page.waitForURL(/\/sales-vouchers\/\d+$/, { timeout: 8000 });
  log("open detail page from the voucher panel", true);
} catch (e) {
  log("exception", false, String(e));
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
