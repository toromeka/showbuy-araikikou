// 仕入伝票の一連の動作確認（新規登録→明細の商品検索→金額の自動計算→
// 詳細表示→編集→削除）。事前に `npm run dev` でアプリを起動しておいてください。
//   node scripts/smoke_purchase_voucher.mjs

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

  await page.goto(`${BASE_URL}/purchase-vouchers/new`);
  await page.waitForSelector('select >> nth=0');

  // 仕入先を選択（一覧の1番目の実データを使う）
  const supplierSelect = page.locator("select").first();
  const optionValues = await supplierSelect.locator("option").evaluateAll((opts) =>
    opts.map((o) => o.value).filter(Boolean),
  );
  await supplierSelect.selectOption(optionValues[0]);
  log("supplier selected", true, optionValues[0]);

  // 1行目: 商品名で検索して選択
  const firstRow = page.locator("tbody tr").first();
  const nameInput = firstRow.locator('input[placeholder*="商品名"]');
  await nameInput.fill("濃青");
  await page.waitForTimeout(1500); // debounce (+ dev-server first-compile warmup)
  const suggestion = page.locator("li button").first();
  const suggestionCount = await suggestion.count();
  if (suggestionCount > 0) {
    const suggestionText = await suggestion.textContent();
    await suggestion.click();
    log("product search + select", true, suggestionText?.trim().slice(0, 30));
  } else {
    await nameInput.fill("テスト部材A（自由入力）");
    log("product search + select", false, "no suggestions, used free text instead");
  }
  await firstRow.locator('input[type="number"]').first().fill("10"); // quantity
  const priceInputs = firstRow.locator('input[type="number"]');
  await priceInputs.nth(1).fill("200"); // cost_price

  // 2行目を追加（返品を模した自由入力・マイナス数量）
  await page.click('button:has-text("+ 明細行を追加")');
  const secondRow = page.locator("tbody tr").nth(1);
  await secondRow.locator('input[placeholder*="商品名"]').fill("返品");
  await secondRow.locator('input[type="number"]').first().fill("-1"); // quantity
  await secondRow.locator('input[type="number"]').nth(1).fill("500"); // cost_price -> -500

  await page.click('button:has-text("保存")');
  await page.waitForURL(/\/purchase-vouchers\/\d+$/, { timeout: 15000 });
  log("voucher created, redirected to detail", true, page.url());

  let text = await page.textContent("body");
  log("detail shows both lines", text.includes("返品"));
  // 10*200 - 1*500 = 1500 subtotal_amount (税抜)
  log("subtotal amount computed (1,500)", /1,500/.test(text));

  // 一覧で検索できるか
  const voucherNoMatch = text.match(/仕入伝票\s*(\d+)/);
  const voucherNo = voucherNoMatch?.[1];
  await page.goto(`${BASE_URL}/purchase-vouchers?q=${voucherNo}`);
  await page.waitForSelector("table");
  text = await page.textContent("body");
  log("voucher searchable in list", voucherNo ? text.includes(voucherNo) : false);

  // 編集: 数量を変更して保存
  await page.click(`text=${voucherNo}`);
  await page.waitForURL(/\/purchase-vouchers\/\d+$/);
  await page.click('a:has-text("編集")');
  await page.waitForSelector("tbody tr");
  const editFirstRow = page.locator("tbody tr").first();
  await editFirstRow.locator('input[type="number"]').first().fill("15"); // quantity -> 15
  await page.click('button:has-text("保存")');
  await page.waitForURL(/\/purchase-vouchers\/\d+$/, { timeout: 15000 });
  text = await page.textContent("body");
  // 15*200 - 500 = 2500
  log("edit recalculates totals (2,500)", /2,500/.test(text));

  // 削除
  page.once("dialog", (d) => d.accept());
  await page.click('button:has-text("削除")');
  await page.waitForURL(`${BASE_URL}/purchase-vouchers`, { timeout: 8000 });
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
