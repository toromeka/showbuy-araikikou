// 入金伝票の一連の動作確認（新規登録→複数明細（現金・振込）→
// 詳細表示→一覧検索→編集→削除）。事前に `npm run dev` でアプリを起動しておいてください。
//   node scripts/smoke_receipt_voucher.mjs

import { chromium } from "playwright";

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
const page = await browser.newPage();

try {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[name="loginId"]', "admin");
  await page.fill('input[name="password"]', "changeme123");
  await page.click('button:has-text("ログイン")');
  await page.waitForURL(`${BASE_URL}/`, { timeout: 8000 });
  log("login", true);

  await page.goto(`${BASE_URL}/receipt-vouchers/new`);
  await page.waitForSelector('select >> nth=0');

  // 得意先を選択（一覧の1番目の実データを使う）
  const customerSelect = page.locator("select").first();
  const optionValues = await customerSelect.locator("option").evaluateAll((opts) =>
    opts.map((o) => o.value).filter(Boolean),
  );
  await customerSelect.selectOption(optionValues[0]);
  log("customer selected", true, optionValues[0]);

  // 参考項目（請求金額）を入力
  await page.fill('input[step="0.01"] >> nth=0', "3300");

  // 1行目: 現金
  const firstRow = page.locator("tbody tr").first();
  await firstRow.locator('input[type="number"]').fill("2000");

  // 2行目を追加: 振込
  await page.click('button:has-text("+ 明細行を追加")');
  const secondRow = page.locator("tbody tr").nth(1);
  await secondRow.locator("select").first().selectOption("振込");
  await secondRow.locator('input[type="number"]').fill("1300");

  await page.click('button:has-text("保存")');
  await page.waitForURL(/\/receipt-vouchers\/\d+$/, { timeout: 15000 });
  log("voucher created, redirected to detail", true, page.url());

  let text = await page.textContent("body");
  log("detail shows 入金合計 3,300", /3,300/.test(text));
  log("detail shows 振込 category", text.includes("振込"));

  // 一覧で検索できるか
  const voucherNoMatch = text.match(/入金伝票\s*(\d+)/);
  const voucherNo = voucherNoMatch?.[1];
  await page.goto(`${BASE_URL}/receipt-vouchers?q=${voucherNo}`);
  await page.waitForSelector("table");
  text = await page.textContent("body");
  log("voucher searchable in list", voucherNo ? text.includes(voucherNo) : false);

  // 編集: 現金行の金額を変更して保存
  await page.click(`text=${voucherNo}`);
  await page.waitForURL(/\/receipt-vouchers\/\d+$/);
  await page.click('a:has-text("編集")');
  await page.waitForSelector("tbody tr");
  const editFirstRow = page.locator("tbody tr").first();
  await editFirstRow.locator('input[type="number"]').fill("2500"); // 2000 -> 2500
  await page.click('button:has-text("保存")');
  await page.waitForURL(/\/receipt-vouchers\/\d+$/, { timeout: 15000 });
  text = await page.textContent("body");
  // 2500 + 1300 = 3800
  log("edit recalculates total (3,800)", /3,800/.test(text));

  // 削除
  page.once("dialog", (d) => d.accept());
  await page.click('button:has-text("削除")');
  await page.waitForURL(`${BASE_URL}/receipt-vouchers`, { timeout: 8000 });
  text = await page.textContent("body");
  log("delete removes from list", voucherNo ? !text.includes(`>${voucherNo}<`) : true);
} catch (e) {
  log("exception", false, String(e));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
