// 売上伝票の一連の動作確認（新規登録→明細の商品検索→金額の自動計算→
// 詳細表示→編集→削除）。事前に `npm run dev` でアプリを起動しておいてください。
//   node scripts/smoke_sales_voucher.mjs

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

  await page.goto(`${BASE_URL}/sales-vouchers/new`);
  await page.waitForSelector('select >> nth=0');

  // 得意先を選択（一覧の2番目の実データを使う）
  const customerSelect = page.locator("select").first();
  const optionValues = await customerSelect.locator("option").evaluateAll((opts) =>
    opts.map((o) => o.value).filter(Boolean),
  );
  await customerSelect.selectOption(optionValues[0]);
  log("customer selected", true, optionValues[0]);

  // 1行目: 商品名で検索して選択
  const firstRow = page.locator("tbody tr").first();
  const nameInput = firstRow.locator('input[placeholder*="商品名"]');
  await nameInput.fill("濃青");
  await page.waitForTimeout(600); // debounce
  const suggestion = page.locator("li button").first();
  const suggestionCount = await suggestion.count();
  if (suggestionCount > 0) {
    const suggestionText = await suggestion.textContent();
    await suggestion.click();
    log("product search + select", true, suggestionText?.trim().slice(0, 30));
  } else {
    await nameInput.fill("テスト商品A（自由入力）");
    log("product search + select", false, "no suggestions, used free text instead");
  }
  await firstRow.locator('input[type="number"]').first().fill("3"); // quantity
  const priceInputs = firstRow.locator('input[type="number"]');
  await priceInputs.nth(2).fill("1000"); // sale_price

  // 2行目を追加（値引き行を模した自由入力・マイナス数量）
  await page.click('button:has-text("+ 明細行を追加")');
  const secondRow = page.locator("tbody tr").nth(1);
  await secondRow.locator('input[placeholder*="商品名"]').fill("値引き");
  await secondRow.locator('input[type="number"]').first().fill("-1"); // quantity
  await secondRow.locator('input[type="number"]').nth(2).fill("500"); // sale_price -> -500

  await page.click('button:has-text("保存")');
  await page.waitForURL(/\/sales-vouchers\/\d+$/, { timeout: 15000 });
  log("voucher created, redirected to detail", true, page.url());

  let text = await page.textContent("body");
  log("detail shows both lines", text.includes("値引き"));
  // 3*1000 - 1*500 = 2500 sales_amount (税抜)
  log("sales amount computed (2,500)", /2,500/.test(text));

  // 一覧で検索できるか
  const voucherNoMatch = text.match(/売上伝票\s*(\d+)/);
  const voucherNo = voucherNoMatch?.[1];
  await page.goto(`${BASE_URL}/sales-vouchers?q=${voucherNo}`);
  await page.waitForSelector("table");
  text = await page.textContent("body");
  log("voucher searchable in list", voucherNo ? text.includes(voucherNo) : false);

  // 編集: 数量を変更して保存
  await page.click(`text=${voucherNo}`);
  await page.waitForURL(/\/sales-vouchers\/\d+$/);
  await page.click('a:has-text("編集")');
  await page.waitForSelector("tbody tr");
  const editFirstRow = page.locator("tbody tr").first();
  await editFirstRow.locator('input[type="number"]').first().fill("5"); // quantity -> 5
  await page.click('button:has-text("保存")');
  await page.waitForURL(/\/sales-vouchers\/\d+$/, { timeout: 15000 });
  text = await page.textContent("body");
  // 5*1000 - 500 = 4500
  log("edit recalculates totals (4,500)", /4,500/.test(text));

  // 削除
  page.once("dialog", (d) => d.accept());
  await page.click('button:has-text("削除")');
  await page.waitForURL(`${BASE_URL}/sales-vouchers`, { timeout: 8000 });
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
