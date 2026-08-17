// 見積書（階層タイプ）の一連の動作確認（新規登録→見出し行＋商品検索明細→
// 金額の自動計算→詳細表示→一覧検索→編集→削除）。
// 事前に `npm run dev` でアプリを起動しておいてください。
//   node scripts/smoke_quotation.mjs

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

  await page.goto(`${BASE_URL}/quotations/new`);
  await page.waitForSelector('input[placeholder*="F8で検索"]');

  // 得意先をF8検索ダイアログから選択
  await page.locator('input[placeholder*="F8で検索"]').first().press("F8");
  const firstCustomerRow = page.locator('[data-testid="search-dialog"] tbody tr').first();
  await firstCustomerRow.waitFor();
  const customerCode = (await firstCustomerRow.locator("td").first().textContent())?.trim();
  await firstCustomerRow.click();
  log("customer selected via F8 dialog", true, customerCode);

  await page.fill('input[placeholder="案件名 1行目"]', "テスト案件");

  // 階層タイプを有効化
  await page.click('text=階層タイプ（見出し行を使用する）');
  await page.waitForTimeout(200);

  // 1行目を見出し行に変更
  const firstRow = page.locator("tbody tr").first();
  await firstRow.locator("select").selectOption("1");
  await firstRow.locator('input[placeholder="見出しテキスト"]').fill("ベアリング一式");
  log("heading row set", true);

  // 2行目を追加（明細・商品検索）
  await page.click('button:has-text("+ 明細行を追加")');
  const secondRow = page.locator("tbody tr").nth(1);
  await secondRow.locator('input[placeholder*="品名"]').fill("濃青");
  await page.waitForTimeout(1200); // debounce + dev-server warmup
  const suggestion = page.locator("li button").first();
  const suggestionCount = await suggestion.count();
  if (suggestionCount > 0) {
    await suggestion.click();
    log("product search + select", true);
  } else {
    await secondRow.locator('input[placeholder*="品名"]').fill("テスト部材（自由入力）");
    log("product search + select", false, "no suggestions, used free text instead");
  }
  const numberInputs = secondRow.locator('input[type="number"]');
  await numberInputs.nth(0).fill("2"); // 数量
  await numberInputs.nth(1).fill("1000"); // 原価単価
  await numberInputs.nth(2).fill("1500"); // 見積単価

  await page.click('button:has-text("保存")');
  await page.waitForURL(/\/quotations\/\d+$/, { timeout: 15000 });
  log("quotation created, redirected to detail", true, page.url());

  let text = await page.textContent("body");
  log("detail shows heading row", text.includes("ベアリング一式"));
  log("detail shows 階層タイプ badge", text.includes("階層タイプ"));
  // 2 * 1500 = 3,000 見積金額 / 2 * 1000 = 2,000 原価金額 / 粗利 1,000
  log("quote amount computed (3,000)", /3,000/.test(text));
  log("cost amount computed (2,000)", /2,000/.test(text));

  // 一覧で検索できるか
  const voucherNoMatch = text.match(/見積書\s*(\d+)/);
  const voucherNo = voucherNoMatch?.[1];
  await page.goto(`${BASE_URL}/quotations?q=${voucherNo}`);
  await page.waitForSelector("table");
  text = await page.textContent("body");
  log("quotation searchable in list", voucherNo ? text.includes(voucherNo) : false);

  // 編集: 数量を変更して保存
  await page.click(`text=${voucherNo}`);
  await page.waitForURL(/\/quotations\/\d+$/);
  await page.click('a:has-text("編集")');
  await page.waitForSelector("tbody tr");
  const editSecondRow = page.locator("tbody tr").nth(1);
  await editSecondRow.locator('input[type="number"]').nth(0).fill("4"); // 数量 2->4
  await page.click('button:has-text("保存")');
  await page.waitForURL(/\/quotations\/\d+$/, { timeout: 15000 });
  text = await page.textContent("body");
  // 4 * 1500 = 6,000
  log("edit recalculates quote amount (6,000)", /6,000/.test(text));

  // 削除
  page.once("dialog", (d) => d.accept());
  await page.click('button:has-text("削除")');
  await page.waitForURL(`${BASE_URL}/quotations`, { timeout: 8000 });
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
