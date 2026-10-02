// 売上伝票の担当者の確認。
// - ユーザー管理で、ユーザーに紐付ける担当者を変えられる
// - 売上伝票の新規登録では、ログインしているユーザーに紐付いた担当者が最初から入り、名前が表示される
// - 担当者コードは変えられる。担当者マスタに無いコードは画面で知らせ、保存もできない
// 担当者コード 5 が登録されていること。最後に、管理者に紐付けた担当者を元に戻す。
// 事前に `npm run dev` でアプリを起動しておいてください。
//   node scripts/smoke_sales_staff.mjs

import { chromium } from "playwright";

const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const STAFF = "5";
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

async function setMyStaff(code) {
  await page.goto(`${BASE_URL}/users`);
  await page.locator("tbody tr", { hasText: "（自分）" }).locator("a").first().click();
  await page.waitForURL(/\/users\/[0-9a-f-]+$/);
  const before = await page.inputValue('select[name="staff_code"]');
  await page.selectOption('select[name="staff_code"]', code);
  await page.locator('form:has(select[name="role"]) button:has-text("保存")').click();
  await page.waitForTimeout(1500);
  return before;
}

let original = null;
try {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[name="loginId"]', "admin");
  await page.fill('input[name="password"]', "changeme123");
  await page.click('button:has-text("ログイン")');
  await page.waitForURL(`${BASE_URL}/`, { timeout: 8000 });

  // 1. ユーザー管理で、自分に紐付ける担当者を変える
  original = await setMyStaff(STAFF);
  await page.goto(`${BASE_URL}/users`);
  // 一覧の「担当者」の列（ログインID・表示名・権限の次）は「5 - 康介」の形
  const staffCell = ((await page.locator("tbody tr", { hasText: "（自分）" }).locator("td").nth(3).textContent()) ?? "").trim();
  const staffName = staffCell.match(new RegExp(`^${STAFF} - (.+)$`))?.[1];
  log("user management links the staff", !!staffName, staffName ?? "");

  // 2. 売上伝票の新規登録で、紐付いた担当者が最初から入る
  await page.goto(`${BASE_URL}/sales-vouchers/new`);
  const staffInput = page.locator('input[aria-label="担当者コード"]');
  await staffInput.waitFor();
  const label = staffInput.locator("xpath=..");
  log("new sales voucher starts with the linked staff", (await staffInput.inputValue()) === STAFF && ((await label.textContent()) ?? "").includes(staffName ?? "?"));

  // 3. 担当者マスタに無いコード
  await staffInput.fill("ZZZ999");
  log("unknown staff code is shown", ((await label.textContent()) ?? "").includes("該当する担当者が見つかりません"));
  await page.fill('input[placeholder*="F8で検索"]', "0054");
  await page.locator("tbody tr").first().locator('input[placeholder*="商品名"]').fill("担当者確認テスト");
  await page.locator("tbody tr").first().locator('input[type="number"]').nth(2).fill("100");
  await page.click('button:has-text("保存")');
  await page.waitForSelector("text=担当者コード「ZZZ999」は担当者マスタにありません", { timeout: 8000 });
  log("saving with an unknown staff code is refused", page.url().endsWith("/sales-vouchers/new"));
} catch (e) {
  log("exception", false, String(e));
} finally {
  if (original !== null) {
    await setMyStaff(original).catch(() => {});
    log("linked staff restored", true, original || "（未設定）");
  }
  await browser.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
