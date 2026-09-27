// 担当者マスタの動作確認（新規登録→編集→得意先フォームの選択肢に出る→無効化で選択肢から外れる）。
// 事前に `npm run dev` でアプリを起動しておいてください。
//   node scripts/smoke_staff.mjs
//
// 担当者は削除できない（無効化のみ）ため、テスト用コードが既にあれば新規登録は省略し、編集から確認する。

import { chromium } from "playwright";

const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const CODE = "SMKST";
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

  // 1. 一覧（ナビから開ける）
  await page.click('nav >> text=担当者マスタ');
  await page.waitForURL(`${BASE_URL}/staff`);
  let text = await page.textContent("body");
  const exists = text.includes(CODE);
  log("staff list opens from nav", true, exists ? "テスト用担当者は登録済み" : "");

  // 2. 新規登録（重複コードはエラー表示）
  if (!exists) {
    await page.goto(`${BASE_URL}/staff/new`);
    await page.fill('input[name="code"]', CODE);
    await page.fill('input[name="name"]', "スモーク担当");
    await page.click('button:has-text("保存")');
    await page.waitForURL(`${BASE_URL}/staff`, { timeout: 10000 });
    text = await page.textContent("body");
    log("staff created", text.includes("スモーク担当"));
  }
  await page.goto(`${BASE_URL}/staff/new`);
  await page.fill('input[name="code"]', CODE);
  await page.fill('input[name="name"]', "重複");
  await page.click('button:has-text("保存")');
  await page.waitForSelector("text=既に使用されています", { timeout: 10000 });
  log("duplicate code rejected", true);

  // 3. 編集
  await page.goto(`${BASE_URL}/staff/${CODE}`);
  await page.fill('input[name="name"]', "スモーク担当（編集後）");
  await page.click('button:has-text("保存")');
  await page.waitForURL(`${BASE_URL}/staff`, { timeout: 10000 });
  text = await page.textContent("body");
  log("staff edited", text.includes("スモーク担当（編集後）"));

  // 有効な状態にそろえる（前回のテストで無効化されたままの場合）
  const row = page.locator("tbody tr", { hasText: CODE });
  if ((await row.locator("button", { hasText: "有効化" }).count()) > 0) {
    await row.locator("button", { hasText: "有効化" }).click();
    await page.waitForTimeout(800);
  }

  // 4. 得意先フォームの担当者の選択肢に出る
  await page.goto(`${BASE_URL}/customers/new`);
  let options = await page.locator('select[name="staff_code"] option').allTextContents();
  log("active staff appears in customer form", options.some((o) => o.includes(CODE)));

  // 5. 無効化すると選択肢から外れる
  await page.goto(`${BASE_URL}/staff`);
  await page.locator("tbody tr", { hasText: CODE }).locator("button", { hasText: "無効化" }).click();
  await page.waitForTimeout(800);
  await page.goto(`${BASE_URL}/customers/new`);
  options = await page.locator('select[name="staff_code"] option').allTextContents();
  log("inactive staff hidden from customer form", !options.some((o) => o.includes(CODE)));
} catch (e) {
  log("exception", false, String(e));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
