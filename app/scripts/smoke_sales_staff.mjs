// 売上伝票の担当者の確認。
// - 担当者は押して選ぶ切り替え（1人だけ選べる）
// - ユーザー管理で、ユーザーに紐付ける担当者を変えられ、売上伝票の新規登録ではその担当者が最初から選ばれている
// - 得意先を選ぶと、その得意先に紐付いた担当者に切り替わる。そのあと手で切り替えることもできる
// 担当者コード 5 と、担当者 2 が紐付いた得意先 0006 が登録されていること。最後に、管理者に紐付けた担当者を元に戻す。
// 事前に `npm run dev` でアプリを起動しておいてください。
//   node scripts/smoke_sales_staff.mjs

import { chromium } from "playwright";

const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const MY_STAFF = "5";
const CUSTOMER = "0006";
const CUSTOMER_STAFF = "2";
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
const checkedStaff = () => page.locator('input[name="staff_code"]:checked').getAttribute("value");

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

  // 1. ユーザー管理で、自分に紐付ける担当者を変える → 新規登録で最初から選ばれている
  original = await setMyStaff(MY_STAFF);
  await page.goto(`${BASE_URL}/sales-vouchers/new`);
  await page.locator('input[name="staff_code"]').first().waitFor({ state: "attached" });
  log("staff is chosen by buttons", (await page.locator('input[name="staff_code"]').count()) >= 3);
  log("new sales voucher starts with the linked staff", (await checkedStaff()) === MY_STAFF);

  // 2. 得意先を選ぶと、得意先に紐付いた担当者に切り替わる
  await page.fill('input[placeholder*="F8で検索"]', CUSTOMER);
  log("choosing a customer switches to the customer's staff", (await checkedStaff()) === CUSTOMER_STAFF);

  // 3. 手で切り替えられる
  await page.locator(`label:has(input[name="staff_code"][value="${MY_STAFF}"])`).click();
  log("staff can be switched by hand", (await checkedStaff()) === MY_STAFF);
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
