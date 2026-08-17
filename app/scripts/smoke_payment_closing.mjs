// 仕入支払更新の一連の動作確認（仕入伝票を作成→プレビュー→実行→
// 対象伝票が支払更新済みになることを確認→取り消し→未払に戻ることを確認）。
// 事前に `npm run dev` でアプリを起動しておいてください。
//   node scripts/smoke_payment_closing.mjs

import { chromium } from "playwright";

const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const SUPPLIER_CODE = "1002"; // 実データ: closing_day = 31（月末）
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

  // 0. 既存データ（実データ）が既に残っている場合があるため、作成前の支払見込み額を基準値として取得する
  async function getPreviewPayableAmount() {
    await page.goto(`${BASE_URL}/payment-closings/new`);
    await page.waitForSelector("select");
    await page.locator("select").selectOption("31"); // 締日: 月末
    await page.click('button:has-text("プレビュー")');
    await page.waitForSelector("table", { timeout: 15000 }).catch(() => {});
    const row = page.locator("tbody tr", { hasText: SUPPLIER_CODE }).first();
    if ((await row.count()) === 0) return 0;
    const cellText = await row.locator("td").nth(6).textContent(); // 今回支払額列
    return Number((cellText ?? "0").replace(/,/g, "").trim()) || 0;
  }

  const baselineAmount = await getPreviewPayableAmount();
  log("baseline payable amount fetched", true, String(baselineAmount));

  // 1. 仕入支払更新の対象になる仕入伝票を作成する（2 * 1000 = 2,000, 税10% = 200 → +2,200）
  await page.goto(`${BASE_URL}/purchase-vouchers/new`);
  await page.waitForSelector('input[placeholder*="F8で検索"]');
  await page.fill('input[placeholder*="F8で検索"]', SUPPLIER_CODE);
  const firstRow = page.locator("tbody tr").first();
  await firstRow.locator('input[placeholder*="商品名"]').fill("仕入支払更新テスト商品");
  const numberInputs = firstRow.locator('input[type="number"]');
  await numberInputs.nth(0).fill("2"); // 数量
  await numberInputs.nth(1).fill("1000"); // 仕入単価
  await page.click('button:has-text("保存")');
  await page.waitForURL(/\/purchase-vouchers\/\d+$/, { timeout: 15000 });
  const voucherUrl = page.url();
  log("purchase voucher created", true, voucherUrl);

  let text = await page.textContent("body");
  log("purchase voucher initially unsettled (編集ボタンあり)", text.includes("編集"));

  // 2. 仕入支払更新プレビュー（テスト伝票分だけ増えているはず: baseline + 2,200）
  await page.goto(`${BASE_URL}/payment-closings/new`);
  await page.waitForSelector("select");
  await page.locator("select").selectOption("31"); // 締日: 月末
  await page.click('button:has-text("プレビュー")');
  await page.waitForSelector("table", { timeout: 15000 });
  text = await page.textContent("body");
  log("preview shows target supplier", text.includes(SUPPLIER_CODE));

  const targetRow = page.locator("tbody tr", { hasText: SUPPLIER_CODE }).first();
  const previewAmountText = await targetRow.locator("td").nth(6).textContent();
  const previewAmount = Number((previewAmountText ?? "0").replace(/,/g, "").trim()) || 0;
  log(
    "preview payable amount increased by 2,200",
    previewAmount === baselineAmount + 2200,
    `baseline=${baselineAmount}, preview=${previewAmount}`,
  );

  // 3. 実行
  page.once("dialog", (d) => d.accept());
  await page.click('button:has-text("この内容で仕入支払更新を実行する")');
  await page.waitForURL(/\/payment-closings\/\d+$/, { timeout: 15000 });
  const closingUrl = page.url();
  log("payment closing executed, redirected to detail", true, closingUrl);

  text = await page.textContent("body");
  log("detail shows target supplier", text.includes(SUPPLIER_CODE));
  const detailRow = page.locator("tbody tr", { hasText: SUPPLIER_CODE }).first();
  const detailAmountText = await detailRow.locator("td").nth(6).textContent();
  const detailAmount = Number((detailAmountText ?? "0").replace(/,/g, "").trim()) || 0;
  log(
    "detail payable amount matches preview",
    detailAmount === previewAmount,
    `detail=${detailAmount}, preview=${previewAmount}`,
  );

  // 4. 対象の仕入伝票が支払更新済みになっているか確認
  await page.goto(voucherUrl);
  text = await page.textContent("body");
  log("purchase voucher now settled (支払更新済み, no 編集/削除)", text.includes("支払更新済み") && !text.includes("編集"));

  // 5. 一覧で有効と表示されるか確認
  await page.goto(`${BASE_URL}/payment-closings`);
  await page.waitForSelector("table");
  text = await page.textContent("body");
  log("closing listed as 有効", text.includes("有効"));

  // 6. 取り消し
  await page.goto(closingUrl);
  page.once("dialog", (d) => d.accept());
  await page.click('button:has-text("この仕入支払更新を取り消す")');
  await page.waitForSelector("text=取消済み", { timeout: 10000 });
  log("closing reversed (取消済み shown)", true);

  // 7. 対象の仕入伝票が未払に戻っているか確認
  await page.goto(voucherUrl);
  text = await page.textContent("body");
  log("purchase voucher unsettled again (編集ボタン復活)", text.includes("編集") && !text.includes("支払更新済み"));

  // 8. 後片付け: テスト用に作成した仕入伝票を削除する
  page.once("dialog", (d) => d.accept());
  await page.click('button:has-text("削除")');
  await page.waitForURL(`${BASE_URL}/purchase-vouchers`, { timeout: 8000 });
  log("test purchase voucher cleaned up", true);
} catch (e) {
  log("exception", false, String(e));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
