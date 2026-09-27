// 日計伝票のCSV取り込みの動作確認。
// - 売上と仕入が混ざったCSVを、区分で売上伝票・仕入伝票に振り分けて取り込める（摘要の行は同じ伝票に入る）
// - メモ行だけの伝票は、コードが仕入先マスタにだけあれば仕入伝票になる
// - 取り込んだ売上は未請求、仕入は未払になり、消費税も計算される
// - 同じCSVをもう一度取り込むと、すべて「取り込み済み」になり二重に登録されない
// - 同じ伝票番号で内容が違う伝票は「内容が違う」として取り込まない
// - 伝票番号が空の行はエラーになり、何も取り込まない
// 得意先 0006・仕入先 1001 が登録されていること。事前に `npm run dev` でアプリを起動しておいてください。
//   node scripts/smoke_daily_import.mjs
// 取り込んだテスト用の伝票は、最後に削除する。

import { chromium } from "playwright";
import iconv from "iconv-lite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const CUSTOMER = "0006";
const SUPPLIER = "1001";
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arai-daily-"));
// 実データと重ならない伝票番号（9で始まる6桁）
const base = 900000 + (Date.now() % 90000);
const SALES_NO = String(base);
const PURCHASE_NO = String(base + 1);
const MEMO_NO = String(base + 2);

const HEADER = "伝票日付,伝票番号,区分,得意先/仕入先コード,得意先/仕入先名,商品コード,商品名,規格,数量,単位,単価,金額,備考,担当者コード,担当者名,摘要名";
function writeCsv(name, lines) {
  const filePath = path.join(tmpDir, name);
  fs.writeFileSync(filePath, iconv.encode([HEADER, ...lines].join("\r\n") + "\r\n", "cp932"));
  return filePath;
}
const rows = (salesAmount) => [
  `2026/09/26,${SALES_NO},摘要,${CUSTOMER},テスト得意先,,日計取込テストの摘要,,0,,0,0,,,,`,
  `2026/09/26,${SALES_NO},売上,${CUSTOMER},テスト得意先,,日計取込テスト売上品,規格A,2,個,${salesAmount / 2},${salesAmount},,,,`,
  `2026/09/26,${PURCHASE_NO},仕入,${SUPPLIER},テスト仕入先,,日計取込テスト仕入品,,3,個,1000,3000,,,,`,
  `2026/09/26,${MEMO_NO},摘要,${SUPPLIER},テスト仕入先,,日計取込テストのメモだけの仕入,,0,,0,0,,,,`,
];
const csvFirst = writeCsv("daily1.csv", rows(10000));
const csvChanged = writeCsv("daily2.csv", rows(12000));
const csvBad = writeCsv("daily_bad.csv", [`2026/09/26,,売上,${CUSTOMER},テスト,,伝票番号なし,,1,個,100,100,,,,`]);

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
page.on("dialog", (d) => d.accept());

async function preview(file) {
  await page.goto(`${BASE_URL}/daily-import`);
  await page.setInputFiles('input[name="file"]', file);
  await page.click('button:has-text("内容を確認")');
  await page.waitForSelector("text=/取り込む内容|エラー（このままでは取り込めません）/", { timeout: 30000 });
  return (await page.textContent("main")).replace(/\s+/g, "");
}

async function deleteVoucher(kind, no) {
  await page.goto(`${BASE_URL}/${kind}?q=${no}`);
  const link = page.locator(`tbody a[href^="/${kind}/"]`).first();
  if ((await link.count()) === 0) return false;
  await link.click();
  await page.waitForURL(new RegExp(`/${kind}/\\d+$`));
  await page.click('button:has-text("削除")');
  await page.waitForURL(`${BASE_URL}/${kind}`, { timeout: 10000 });
  return true;
}

try {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[name="loginId"]', "admin");
  await page.fill('input[name="password"]', "changeme123");
  await page.click('button:has-text("ログイン")');
  await page.waitForURL(`${BASE_URL}/`, { timeout: 8000 });
  log("daily import menu shown", (await page.locator("nav >> text=日計伝票取込").count()) === 1);

  // 1. 伝票番号が空の行があると取り込めない
  let text = await preview(csvBad);
  log("row without voucher number is an error", text.includes("エラー（このままでは取り込めません）") && (await page.locator('button:has-text("この内容で取り込む")').count()) === 0);

  // 2. 売上・仕入が混ざったCSVのプレビューと取り込み
  text = await preview(csvFirst);
  log("preview: 1 sales voucher (2 lines)", text.includes("売上伝票取り込む伝票1件（明細2行）"), text.slice(text.indexOf("売上伝票"), text.indexOf("売上伝票") + 60));
  log("preview: 2 purchase vouchers incl. memo-only", text.includes("仕入伝票取り込む伝票2件（明細2行）"));
  await page.click('button:has-text("この内容で取り込む")');
  await page.waitForSelector("text=取り込みが完了しました", { timeout: 60000 });
  log("import executed", true);

  // 3. 取り込んだ伝票の中身
  await page.goto(`${BASE_URL}/sales-vouchers?q=${SALES_NO}`);
  await page.locator(`tbody a[href^="/sales-vouchers/"]`).first().click();
  await page.waitForURL(/\/sales-vouchers\/\d+$/);
  text = (await page.textContent("main")).replace(/\s+/g, "");
  log(
    "sales voucher: memo row kept, amount and tax, unbilled",
    text.includes("日計取込テストの摘要") && text.includes("日計取込テスト売上品") && text.includes("10,000") && text.includes("1,000") && !text.includes("請求確定済み"),
  );
  await page.goto(`${BASE_URL}/purchase-vouchers?q=${MEMO_NO}`);
  log("memo-only voucher became a purchase voucher", (await page.locator(`tbody a[href^="/purchase-vouchers/"]`).count()) === 1);

  // 4. 同じCSVをもう一度 → すべて取り込み済み
  text = await preview(csvFirst);
  log(
    "same CSV again: all already imported",
    text.includes("新しく取り込む伝票はありません") && text.includes("売上伝票取り込む伝票0件") && text.includes("取り込み済み1件") && text.includes("取り込み済み2件"),
  );
  log("same CSV again: no import button", (await page.locator('button:has-text("この内容で取り込む")').count()) === 0);

  // 5. 金額を変えたCSV → 内容が違う伝票として取り込まない
  text = await preview(csvChanged);
  log("changed voucher reported as conflict", text.includes(`${SALES_NO}:金額（登録済み10,000/CSV12,000）`), text.slice(text.indexOf("内容が違う"), text.indexOf("内容が違う") + 120));
} catch (e) {
  log("exception", false, String(e));
} finally {
  // 後片付け（取り込んだテスト用の伝票を削除）
  const cleaned = [
    await deleteVoucher("sales-vouchers", SALES_NO).catch(() => false),
    await deleteVoucher("purchase-vouchers", PURCHASE_NO).catch(() => false),
    await deleteVoucher("purchase-vouchers", MEMO_NO).catch(() => false),
  ];
  log("cleanup: test vouchers deleted", cleaned.every(Boolean), JSON.stringify(cleaned));
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
