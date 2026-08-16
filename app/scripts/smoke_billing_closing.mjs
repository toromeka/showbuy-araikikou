// 請求更新の一連の動作確認（売上伝票を作成→プレビュー→実行→
// 対象伝票が請求確定済みになることを確認→取り消し→未請求に戻ることを確認）。
// 事前に `npm run dev` でアプリを起動しておいてください。
//   node scripts/smoke_billing_closing.mjs

import { chromium } from "playwright";

const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const CUSTOMER_CODE = "0006"; // 実データ: closing_day = 31（月末）
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

  // 0. 既存データ（実データ）が既に残っている場合があるため、作成前の請求見込み額を基準値として取得する
  async function getPreviewBilledAmount() {
    await page.goto(`${BASE_URL}/billing-closings/new`);
    await page.waitForSelector("select");
    await page.locator("select").selectOption("31"); // 締日: 月末
    await page.click('button:has-text("プレビュー")');
    await page.waitForSelector("table", { timeout: 15000 }).catch(() => {});
    const row = page.locator("tbody tr", { hasText: CUSTOMER_CODE }).first();
    if ((await row.count()) === 0) return 0;
    const cellText = await row.locator("td").nth(6).textContent(); // 今回請求額列
    return Number((cellText ?? "0").replace(/,/g, "").trim()) || 0;
  }

  const baselineAmount = await getPreviewBilledAmount();
  log("baseline billed amount fetched", true, String(baselineAmount));

  // 1. 請求更新の対象になる売上伝票を作成する（2 * 1000 = 2,000, 税10% = 200 → +2,200）
  await page.goto(`${BASE_URL}/sales-vouchers/new`);
  await page.waitForSelector('select >> nth=0');
  await page.locator("select").first().selectOption(CUSTOMER_CODE);
  const firstRow = page.locator("tbody tr").first();
  await firstRow.locator('input[placeholder*="商品名"]').fill("請求更新テスト商品");
  const numberInputs = firstRow.locator('input[type="number"]');
  await numberInputs.nth(0).fill("2"); // 数量
  await numberInputs.nth(2).fill("1000"); // 売上単価
  await page.click('button:has-text("保存")');
  await page.waitForURL(/\/sales-vouchers\/\d+$/, { timeout: 15000 });
  const voucherUrl = page.url();
  log("sales voucher created", true, voucherUrl);

  let text = await page.textContent("body");
  log("sales voucher initially unbilled (編集ボタンあり)", text.includes("編集"));

  // 2. 請求更新プレビュー（テスト伝票分だけ増えているはず: baseline + 2,200）
  await page.goto(`${BASE_URL}/billing-closings/new`);
  await page.waitForSelector("select");
  await page.locator("select").selectOption("31"); // 締日: 月末
  await page.click('button:has-text("プレビュー")');
  await page.waitForSelector("table", { timeout: 15000 });
  text = await page.textContent("body");
  log("preview shows target customer", text.includes(CUSTOMER_CODE));

  const targetRow = page.locator("tbody tr", { hasText: CUSTOMER_CODE }).first();
  const previewAmountText = await targetRow.locator("td").nth(6).textContent();
  const previewAmount = Number((previewAmountText ?? "0").replace(/,/g, "").trim()) || 0;
  log(
    "preview billed amount increased by 2,200",
    previewAmount === baselineAmount + 2200,
    `baseline=${baselineAmount}, preview=${previewAmount}`,
  );

  // 3. 実行
  page.once("dialog", (d) => d.accept());
  await page.click('button:has-text("この内容で請求更新を実行する")');
  await page.waitForURL(/\/billing-closings\/\d+$/, { timeout: 15000 });
  const closingUrl = page.url();
  log("billing closing executed, redirected to detail", true, closingUrl);

  text = await page.textContent("body");
  log("detail shows target customer", text.includes(CUSTOMER_CODE));
  const detailRow = page.locator("tbody tr", { hasText: CUSTOMER_CODE }).first();
  const detailAmountText = await detailRow.locator("td").nth(6).textContent();
  const detailAmount = Number((detailAmountText ?? "0").replace(/,/g, "").trim()) || 0;
  log(
    "detail billed amount matches preview",
    detailAmount === previewAmount,
    `detail=${detailAmount}, preview=${previewAmount}`,
  );

  // 4. 対象の売上伝票が請求確定済みになっているか確認
  await page.goto(voucherUrl);
  text = await page.textContent("body");
  log("sales voucher now billed (請求確定済み, no 編集/削除)", text.includes("請求確定済み") && !text.includes("編集"));

  // 5. 一覧で取消済みでないことを確認
  await page.goto(`${BASE_URL}/billing-closings`);
  await page.waitForSelector("table");
  text = await page.textContent("body");
  log("closing listed as 有効", text.includes("有効"));

  // 6. 取り消し
  await page.goto(closingUrl);
  page.once("dialog", (d) => d.accept());
  await page.click('button:has-text("この請求更新を取り消す")');
  await page.waitForSelector("text=取消済み", { timeout: 10000 });
  log("closing reversed (取消済み shown)", true);

  // 7. 対象の売上伝票が未請求に戻っているか確認
  await page.goto(voucherUrl);
  text = await page.textContent("body");
  log("sales voucher unbilled again (編集ボタン復活)", text.includes("編集") && !text.includes("請求確定済み"));

  // 8. 後片付け: テスト用に作成した売上伝票を削除する
  page.once("dialog", (d) => d.accept());
  await page.click('button:has-text("削除")');
  await page.waitForURL(`${BASE_URL}/sales-vouchers`, { timeout: 8000 });
  log("test sales voucher cleaned up", true);
} catch (e) {
  log("exception", false, String(e));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
