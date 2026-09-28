// ユーザー管理・パスワード変更の動作確認。
// - 管理者がユーザーを追加でき、同じログインIDは拒否される
// - 一般ユーザーにはユーザー管理・データ移行のメニューが出ず、画面も開けない
// - 本人がパスワードを変更でき（今のパスワード違い・確認不一致はエラー）、新しいパスワードでログインできる
// - 管理者が無効化すると、ログイン中の画面も次の操作から使えなくなり、再ログインもできない
// - 管理者が「パスワードを初期値に戻す」と、初期パスワードでログインでき、変更を促す警告が出る
// - 自分自身の無効化・最後の管理者を一般に変更することはできない
// 事前に `npm run dev` でアプリを起動しておいてください（admin / changeme123 でログインできること）。
//   node scripts/smoke_users.mjs
//
// ユーザーは削除できないため、テスト用ユーザーが既にあれば、有効化とパスワード再設定をしてから確認する。

import { chromium } from "playwright";

const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const LOGIN_ID = "smoke_user";
const PASS1 = "smoke-pass-1";
const PASS2 = "smoke-pass-2";
const results = [];
function log(step, ok, extra = "") {
  results.push({ step, ok, extra });
  console.log((ok ? "OK  " : "FAIL") + " - " + step + (extra ? " :: " + extra : ""));
}

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
});

async function login(loginId, password) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const dialogs = [];
  page.on("dialog", (d) => {
    dialogs.push(d.message());
    d.accept();
  });
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[name="loginId"]', loginId);
  await page.fill('input[name="password"]', password);
  await page.click('button:has-text("ログイン")');
  const ok = await page
    .waitForURL(`${BASE_URL}/`, { timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  return { context, page, ok, dialogs };
}
const body = async (page) => (await page.textContent("body")).replace(/\s+/g, " ");

try {
  const admin = await login("admin", "changeme123");
  log("admin login", admin.ok);
  log("initial password warning on home", (await body(admin.page)).includes("パスワードが初期設定のまま"));
  log("admin sees user management menu", (await admin.page.locator("nav >> text=ユーザー管理").count()) === 1);

  // 1. ユーザーを追加（既にあれば有効化してパスワードを再設定）
  await admin.page.goto(`${BASE_URL}/users`);
  const existingRow = admin.page.locator("tbody tr", { hasText: LOGIN_ID });
  if ((await existingRow.count()) === 0) {
    await admin.page.goto(`${BASE_URL}/users/new`);
    await admin.page.fill('input[name="login_id"]', LOGIN_ID);
    await admin.page.fill('input[name="display_name"]', "スモーク一般");
    await admin.page.selectOption('select[name="role"]', "staff");
    await admin.page.fill('input[name="password"]', PASS1);
    await admin.page.fill('input[name="password_confirm"]', PASS1);
    await admin.page.click('button:has-text("保存")');
    await admin.page.waitForURL(`${BASE_URL}/users`, { timeout: 10000 });
    log("user created", (await body(admin.page)).includes("スモーク一般"));
  } else {
    if ((await existingRow.locator("button", { hasText: "有効化" }).count()) > 0) {
      await existingRow.locator("button", { hasText: "有効化" }).click();
      await admin.page.waitForTimeout(1000);
    }
    await existingRow.locator("a").first().click();
    await admin.page.waitForURL(/\/users\/[0-9a-f-]+$/);
    const reset = admin.page.locator("section", { hasText: "パスワードの再設定" });
    await reset.locator('input[name="password"]').fill(PASS1);
    await reset.locator('input[name="password_confirm"]').fill(PASS1);
    await reset.locator('button:has-text("パスワードを再設定")').click();
    await admin.page.waitForSelector("text=パスワードを変更しました", { timeout: 8000 });
    log("existing test user re-activated and password reset", true);
  }

  // 同じログインIDは拒否
  await admin.page.goto(`${BASE_URL}/users/new`);
  await admin.page.fill('input[name="login_id"]', LOGIN_ID);
  await admin.page.fill('input[name="display_name"]', "重複");
  await admin.page.fill('input[name="password"]', PASS1);
  await admin.page.fill('input[name="password_confirm"]', PASS1);
  await admin.page.click('button:has-text("保存")');
  await admin.page.waitForSelector("text=既に使われています", { timeout: 8000 });
  log("duplicate login id rejected", true);

  // 2. 一般ユーザー: 管理者向けのメニュー・画面は使えない
  const user = await login(LOGIN_ID, PASS1);
  log("staff user login", user.ok);
  log(
    "staff user has no admin menus",
    (await user.page.locator("nav >> text=ユーザー管理").count()) === 0 &&
      (await user.page.locator("nav >> text=データ移行").count()) === 0,
  );
  await user.page.goto(`${BASE_URL}/users`);
  log("staff user cannot open user management", (await body(user.page)).includes("管理者のみ利用できます"));

  // 3. 本人によるパスワード変更
  await user.page.goto(`${BASE_URL}/account/password`);
  await user.page.fill('input[name="current_password"]', "wrong-password");
  await user.page.fill('input[name="password"]', PASS2);
  await user.page.fill('input[name="password_confirm"]', PASS2);
  await user.page.click('button:has-text("パスワードを変更")');
  await user.page.waitForSelector("text=今のパスワードが正しくありません", { timeout: 8000 });
  log("wrong current password rejected", true);
  await user.page.fill('input[name="current_password"]', PASS1);
  await user.page.fill('input[name="password"]', PASS2);
  await user.page.fill('input[name="password_confirm"]', "different-pass");
  await user.page.click('button:has-text("パスワードを変更")');
  await user.page.waitForSelector("text=確認用のパスワードが一致しません", { timeout: 8000 });
  log("mismatched confirmation rejected", true);
  await user.page.fill('input[name="current_password"]', PASS1);
  await user.page.fill('input[name="password"]', PASS2);
  await user.page.fill('input[name="password_confirm"]', PASS2);
  await user.page.click('button:has-text("パスワードを変更")');
  await user.page.waitForSelector("text=パスワードを変更しました", { timeout: 8000 });
  const relogin = await login(LOGIN_ID, PASS2);
  log("login with new password", relogin.ok);
  await relogin.context.close();

  // 3-2. 管理者が「パスワードを初期値に戻す」→ 初期パスワードでログインでき、ホーム画面に変更を促す警告が出る
  await admin.page.goto(`${BASE_URL}/users`);
  admin.dialogs.length = 0;
  await admin.page.locator("tbody tr", { hasText: LOGIN_ID }).locator("button", { hasText: "パスワードを初期値に戻す" }).click();
  await admin.page.waitForTimeout(1500);
  log("admin resets password to initial", admin.dialogs.some((m) => m.includes("初期パスワード（changeme123）に戻しました")));
  const initialLogin = await login(LOGIN_ID, "changeme123");
  log("login with initial password after reset", initialLogin.ok);
  log("initial password warning shown after reset", initialLogin.ok && (await body(initialLogin.page)).includes("パスワードが初期設定のまま"));
  await initialLogin.context.close();
  const oldLogin = await login(LOGIN_ID, PASS2);
  log("previous password no longer works", !oldLogin.ok);
  await oldLogin.context.close();
  // 以降の確認のため、元のパスワードに戻す
  await admin.page.locator("tbody tr", { hasText: LOGIN_ID }).locator("a").first().click();
  await admin.page.waitForURL(/\/users\/[0-9a-f-]+$/);
  const resetSection = admin.page.locator("section", { hasText: "パスワードの再設定" });
  await resetSection.locator('input[name="password"]').fill(PASS2);
  await resetSection.locator('input[name="password_confirm"]').fill(PASS2);
  await resetSection.locator('button:has-text("パスワードを再設定")').click();
  await admin.page.waitForSelector("text=パスワードを変更しました", { timeout: 8000 });

  // 4. 管理者が無効化 → ログイン中の画面も使えなくなり、再ログインもできない
  await admin.page.goto(`${BASE_URL}/users`);
  await admin.page.locator("tbody tr", { hasText: LOGIN_ID }).locator("button", { hasText: "無効化" }).click();
  await admin.page.waitForTimeout(1500);
  await user.page.goto(`${BASE_URL}/sales-vouchers`);
  log("deactivated user blocked on next page", (await body(user.page)).includes("無効化されているため"));
  const blocked = await login(LOGIN_ID, PASS2);
  log("deactivated user cannot log in", !blocked.ok);
  await blocked.context.close();

  // 5. 自分自身の無効化・最後の管理者を一般に変更することはできない
  await admin.page.goto(`${BASE_URL}/users`);
  admin.dialogs.length = 0;
  await admin.page.locator("tbody tr", { hasText: "（自分）" }).locator("button", { hasText: "無効化" }).click();
  await admin.page.waitForTimeout(1500);
  log("cannot deactivate yourself", admin.dialogs.some((m) => m.includes("自分自身は無効化できません")));
  const adminCount = await admin.page.locator("tbody tr", { hasText: "管理者" }).filter({ hasText: "有効" }).count();
  if (adminCount === 1) {
    await admin.page.locator("tbody tr", { hasText: "（自分）" }).locator("a").first().click();
    await admin.page.waitForURL(/\/users\/[0-9a-f-]+$/);
    await admin.page.selectOption('select[name="role"]', "staff");
    await admin.page.locator('form:has(select[name="role"]) button:has-text("保存")').click();
    await admin.page.waitForSelector("text=管理者が1人もいなくなる", { timeout: 8000 });
    log("cannot demote the last admin", true);
  } else {
    log("cannot demote the last admin", true, "管理者が複数いるため確認を省略");
  }

  await user.context.close();
  await admin.context.close();
} catch (e) {
  log("exception", false, String(e));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
