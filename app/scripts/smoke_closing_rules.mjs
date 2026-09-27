// 締め日まわりのルールの動作確認。
// 1. 伝票日付が得意先の直近の締め日以前だと、売上伝票の入力画面に注意書きが出る（今日の日付なら出ない）
// 2. 請求更新は、各得意先の一番新しいものからしか取り消せない
// 事前に `npm run dev` でアプリを起動しておいてください。
//   node scripts/smoke_closing_rules.mjs

import { chromium } from "playwright";

const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const CUSTOMER_CODE = "0006"; // 実データ: closing_day = 31（月末）
const results = [];
function log(step, ok, extra = "") {
  results.push({ step, ok, extra });
  console.log((ok ? "OK  " : "FAIL") + " - " + step + (extra ? " :: " + extra : ""));
}
const ymd = (d) => d.toISOString().slice(0, 10);

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
});
const page = await browser.newPage();
const dialogs = [];
page.on("dialog", (d) => {
  dialogs.push(d.message());
  d.accept();
});

async function executeClosing(asOf) {
  await page.goto(`${BASE_URL}/billing-closings/new`);
  await page.locator("select").selectOption("31");
  await page.fill('input[type="date"]', asOf);
  await page.click('button:has-text("プレビュー")');
  await page.waitForSelector("text=プレビュー結果", { timeout: 15000 });
  await page.click('button:has-text("この内容で請求更新を実行する")');
  await page.waitForURL(/\/billing-closings\/\d+$/, { timeout: 15000 });
  return page.url();
}
async function reverse(url) {
  dialogs.length = 0;
  await page.goto(url);
  await page.click('button:has-text("この請求更新を取り消す")');
  await page.waitForTimeout(2500);
  return { reversed: (await page.textContent("body")).includes("取消済み"), messages: [...dialogs] };
}

let voucherUrl = null;
try {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[name="loginId"]', "admin");
  await page.fill('input[name="password"]', "changeme123");
  await page.click('button:has-text("ログイン")');
  await page.waitForURL(`${BASE_URL}/`, { timeout: 8000 });
  log("login", true);

  // 1. 締め日を過ぎた日付の注意書き
  const now = new Date();
  const lastMonthFirst = ymd(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)));
  const today = ymd(new Date(now.getTime() + 9 * 3600 * 1000)); // 日本時間の今日
  await page.goto(`${BASE_URL}/sales-vouchers/new`);
  await page.fill('input[placeholder*="F8で検索"]', CUSTOMER_CODE);
  await page.fill('input[type="date"]', today);
  await page.waitForTimeout(1200);
  log("no notice for today's date", (await page.locator("text=直近の締め日").count()) === 0);
  await page.fill('input[type="date"]', lastMonthFirst);
  await page.waitForSelector("text=直近の締め日", { timeout: 8000 });
  log("notice shown for date before last closing", true, lastMonthFirst);

  // 請求更新の対象になる伝票を今日の日付で作成
  await page.fill('input[type="date"]', today);
  const row = page.locator("tbody tr").first();
  await row.locator('input[placeholder*="商品名"]').fill("締めルール確認用");
  await row.locator('input[type="number"]').nth(0).fill("1");
  await row.locator('input[type="number"]').nth(2).fill("1000");
  await page.click('button:has-text("保存")');
  await page.waitForURL(/\/sales-vouchers\/\d+$/, { timeout: 15000 });
  voucherUrl = page.url();

  // 2. 請求更新を2回（今日・40日後）実行し、古い方だけを取り消そうとすると拒否される
  const first = await executeClosing(today);
  const later = await executeClosing(ymd(new Date(now.getTime() + 40 * 86400 * 1000)));
  log("two closings executed", true, `${first} / ${later}`);

  let r = await reverse(first);
  log(
    "older closing cannot be reversed while a newer one exists",
    !r.reversed && r.messages.some((m) => m.includes("新しいものから順に")),
  );
  r = await reverse(later);
  log("newest closing can be reversed", r.reversed);
  r = await reverse(first);
  log("then the older one can be reversed", r.reversed);
} catch (e) {
  log("exception", false, String(e));
} finally {
  if (voucherUrl) {
    await page.goto(voucherUrl);
    if ((await page.locator('button:has-text("削除")').count()) > 0) {
      await page.click('button:has-text("削除")');
      await page.waitForURL(`${BASE_URL}/sales-vouchers`, { timeout: 8000 }).catch(() => {});
    }
  }
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
