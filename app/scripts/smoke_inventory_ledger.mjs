// 商品受払台帳の一連の動作確認（商品検索→台帳表示→
// 売上伝票・仕入伝票を作成して出庫・入庫が反映されることを確認→後片付け）。
// 事前に `npm run dev` でアプリを起動しておいてください。
//   node scripts/smoke_inventory_ledger.mjs

import { chromium } from "playwright";

const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
// 実データ上、売上・仕入とも紐づく明細が無い商品コードを使う（残高計算をゼロから検証するため）
const PRODUCT_CODE = "1000E00260";
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

  // 1. 商品検索→台帳表示（この時点では明細0件のはず）
  await page.goto(`${BASE_URL}/inventory-ledger`);
  await page.waitForSelector('input[placeholder*="商品コード"]');
  await page.fill('input[placeholder*="商品コード"]', "濃青");
  await page.waitForTimeout(1000); // debounce + dev-server warmup
  const suggestion = page.locator("li button", { hasText: PRODUCT_CODE }).first();
  await suggestion.click();
  await page.waitForURL(new RegExp(`product=${PRODUCT_CODE}`), { timeout: 10000 });
  let text = await page.textContent("body");
  log("ledger page shows product code", text.includes(PRODUCT_CODE));
  log("ledger initially empty", text.includes("該当する仕入・売上明細がありません"));

  // 2. 仕入伝票を作成（入庫: 数量10, 仕入単価200 → 2,000）
  await page.goto(`${BASE_URL}/purchase-vouchers/new`);
  await page.waitForSelector('select >> nth=0');
  const supplierValues = await page
    .locator("select")
    .first()
    .locator("option")
    .evaluateAll((opts) => opts.map((o) => o.value).filter(Boolean));
  await page.locator("select").first().selectOption(supplierValues[0]);
  const purchaseRow = page.locator("tbody tr").first();
  await purchaseRow.locator('input[placeholder*="商品名"]').fill(PRODUCT_CODE);
  await page.waitForTimeout(1200);
  const purchaseSuggestion = page.locator("li button").first();
  if ((await purchaseSuggestion.count()) > 0) {
    await purchaseSuggestion.click();
  }
  const purchaseNumberInputs = purchaseRow.locator('input[type="number"]');
  await purchaseNumberInputs.nth(0).fill("10");
  await purchaseNumberInputs.nth(1).fill("200");
  await page.click('button:has-text("保存")');
  await page.waitForURL(/\/purchase-vouchers\/\d+$/, { timeout: 15000 });
  const purchaseVoucherUrl = page.url();
  log("purchase voucher created (入庫 10)", true, purchaseVoucherUrl);

  // 3. 売上伝票を作成（出庫: 数量4, 仕入原価100 → 400、売価は任意）
  await page.goto(`${BASE_URL}/sales-vouchers/new`);
  await page.waitForSelector('select >> nth=0');
  const customerValues = await page
    .locator("select")
    .first()
    .locator("option")
    .evaluateAll((opts) => opts.map((o) => o.value).filter(Boolean));
  await page.locator("select").first().selectOption(customerValues[0]);
  const salesRow = page.locator("tbody tr").first();
  await salesRow.locator('input[placeholder*="商品名"]').fill(PRODUCT_CODE);
  await page.waitForTimeout(1200);
  const salesSuggestion = page.locator("li button").first();
  if ((await salesSuggestion.count()) > 0) {
    await salesSuggestion.click();
  }
  const salesNumberInputs = salesRow.locator('input[type="number"]');
  await salesNumberInputs.nth(0).fill("4"); // 数量
  await salesNumberInputs.nth(1).fill("100"); // 仕入単価(原価)
  await salesNumberInputs.nth(2).fill("300"); // 売上単価
  await page.click('button:has-text("保存")');
  await page.waitForURL(/\/sales-vouchers\/\d+$/, { timeout: 15000 });
  const salesVoucherUrl = page.url();
  log("sales voucher created (出庫 4)", true, salesVoucherUrl);

  // 4. 台帳を再確認: 入庫10・出庫4→残高6、残高金額 2,000-400=1,600
  await page.goto(`${BASE_URL}/inventory-ledger?product=${PRODUCT_CODE}`);
  text = await page.textContent("body");
  log("ledger shows purchase line (入庫)", text.includes("仕入"));
  log("ledger shows sales line (出庫)", text.includes("売上"));

  const salesRowInLedger = page.locator("tbody tr", { hasText: "売上" }).first();
  const balanceQtyText = await salesRowInLedger.locator("td").nth(6).textContent();
  const balanceAmountText = await salesRowInLedger.locator("td").nth(7).textContent();
  log(
    "ledger closing balance qty = 6",
    (balanceQtyText ?? "").replace(/,/g, "").trim() === "6",
    `got: ${balanceQtyText}`,
  );
  log(
    "ledger closing balance amount = 1,600",
    (balanceAmountText ?? "").replace(/,/g, "").trim() === "1600",
    `got: ${balanceAmountText}`,
  );

  // 5. 後片付け: テスト用に作成した伝票を削除する
  await page.goto(salesVoucherUrl);
  page.once("dialog", (d) => d.accept());
  await page.click('button:has-text("削除")');
  await page.waitForURL(`${BASE_URL}/sales-vouchers`, { timeout: 8000 });
  await page.goto(purchaseVoucherUrl);
  page.once("dialog", (d) => d.accept());
  await page.click('button:has-text("削除")');
  await page.waitForURL(`${BASE_URL}/purchase-vouchers`, { timeout: 8000 });
  log("test vouchers cleaned up", true);
} catch (e) {
  log("exception", false, String(e));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
