// 伝票明細の「商品コード」欄の動作確認（売上伝票で確認。仕入伝票・見積書も同じ部品を使う）。
// - コード欄でF8→商品検索ダイアログから選ぶと、コード・品名・単価が入る
// - 手打ち用コード「1」を入れると、品名は自由入力になる（マスタの仮の名前は使わない）
// - 商品マスタに無いコードは「該当する商品なし」と表示され、保存時もエラーになる
// - 編集画面を開いてコード欄を移動しても、手入力した品名が上書きされない
// 事前に `npm run dev` でアプリを起動しておいてください。商品マスタにコード「1」（手打ち商品）が必要です。
//   node scripts/smoke_product_code.mjs

import { chromium } from "playwright";

const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const SEARCH_WORD = process.env.SMOKE_PRODUCT_WORD ?? "濃青";
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
const codeInput = (row) => row.locator('input[aria-label="商品コード"]');
const nameInput = (row) => row.locator("td").nth(1).locator("input").first();

try {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[name="loginId"]', "admin");
  await page.fill('input[name="password"]', "changeme123");
  await page.click('button:has-text("ログイン")');
  await page.waitForURL(`${BASE_URL}/`, { timeout: 8000 });
  log("login", true);

  await page.goto(`${BASE_URL}/sales-vouchers/new`);
  await page.locator('input[placeholder*="F8で検索"]').first().press("F8");
  const customerRow = page.locator('[data-testid="search-dialog"] tbody tr').first();
  await customerRow.waitFor();
  await customerRow.click();

  // 1行目: コード欄でF8 → 商品検索ダイアログから選ぶ
  const row1 = page.locator("tbody tr").nth(0);
  await codeInput(row1).press("F8");
  await page.fill('[data-testid="search-dialog-input"]', SEARCH_WORD);
  const productRow = page.locator('[data-testid="search-dialog"] tbody tr').first();
  await productRow.locator("td.font-mono").waitFor({ timeout: 10000 });
  const pickedCode = (await productRow.locator("td").first().textContent())?.trim();
  await productRow.click();
  await page.waitForTimeout(300);
  log(
    "F8 from code field fills code and name",
    (await codeInput(row1).inputValue()) === pickedCode && (await nameInput(row1).inputValue()).length > 0,
    pickedCode,
  );
  await row1.locator('input[type="number"]').nth(0).fill("1");

  // 2行目: 手打ち用コード「1」 → 品名は自由入力
  await page.click('button:has-text("+ 明細行を追加")');
  const row2 = page.locator("tbody tr").nth(1);
  await codeInput(row2).fill("1");
  await codeInput(row2).press("Enter");
  await page.waitForTimeout(800);
  log(
    "handwrite code 1 keeps name empty for free input",
    (await nameInput(row2).inputValue()) === "" && (await nameInput(row2).getAttribute("placeholder")) === "品名を入力",
  );
  await nameInput(row2).fill("手打ちスモーク品");
  await page.waitForTimeout(400);
  log("typing a name does not clear code 1", (await codeInput(row2).inputValue()) === "1");
  await row2.locator('input[type="number"]').nth(0).fill("2");
  await row2.locator('input[type="number"]').nth(2).fill("500");

  // 3行目: マスタに無いコード
  await page.click('button:has-text("+ 明細行を追加")');
  const row3 = page.locator("tbody tr").nth(2);
  await codeInput(row3).fill("ZZZ-NOT-EXIST");
  await codeInput(row3).press("Enter");
  await page.waitForSelector("text=該当する商品なし", { timeout: 8000 });
  log("unknown code shows not-found", true);
  await nameInput(row3).fill("存在しないコードの行");
  await row3.locator('input[type="number"]').nth(0).fill("1");
  await row3.locator('input[type="number"]').nth(2).fill("100");
  await page.click('button:has-text("保存")');
  await page.waitForSelector("text=商品マスタにありません", { timeout: 10000 });
  log("saving with unknown code is rejected", true);

  // 3行目を削除して保存
  await row3.locator('button[title="この行を削除"]').click();
  await page.click('button:has-text("保存")');
  await page.waitForURL(/\/sales-vouchers\/\d+$/, { timeout: 15000 });
  const voucherUrl = page.url();
  let text = await page.textContent("body");
  log("voucher saved with handwrite line", text.includes("手打ちスモーク品"), voucherUrl);

  // 編集画面: コード欄を移動しても手入力の品名は変わらない
  await page.goto(`${voucherUrl}/edit`);
  const editRow2 = page.locator("tbody tr").nth(1);
  await codeInput(editRow2).waitFor();
  await codeInput(editRow2).focus();
  await nameInput(editRow2).focus();
  await page.waitForTimeout(800);
  log(
    "edit keeps code 1 and handwritten name",
    (await codeInput(editRow2).inputValue()) === "1" && (await nameInput(editRow2).inputValue()) === "手打ちスモーク品",
  );

  // 商品受払台帳: 手打ち用コードは対象外と表示される
  await page.goto(`${BASE_URL}/inventory-ledger?product=1`);
  text = await page.textContent("body");
  log("inventory ledger excludes handwrite code", text.includes("受払台帳の対象外"));

  // 後片付け
  await page.goto(voucherUrl);
  page.once("dialog", (d) => d.accept());
  await page.click('button:has-text("削除")');
  await page.waitForURL(`${BASE_URL}/sales-vouchers`, { timeout: 8000 });
  log("cleanup: test voucher deleted", true);
} catch (e) {
  log("exception", false, String(e));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
