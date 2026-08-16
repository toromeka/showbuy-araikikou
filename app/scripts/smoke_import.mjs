// CSV取り込み機能の動作確認スクリプト。
// 実データではなく、その場で作る小さなテスト用CSVで一通りの挙動
// （通常インポート・Shift_JIS自動判定・不正な参照コードのnull化・必須項目欠落の
// スキップ）を確認します。
//
// 事前に `npm run dev` でアプリを起動しておいてください。
//   node scripts/smoke_import.mjs

import { chromium } from "playwright";
import iconv from "iconv-lite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arai-smoke-"));

function writeCsv(name, text, encoding = "utf-8") {
  const filePath = path.join(tmpDir, name);
  const buf = encoding === "utf-8" ? Buffer.from(text, "utf-8") : iconv.encode(text, "cp932");
  fs.writeFileSync(filePath, buf);
  return filePath;
}

const customersCsvUtf8 = writeCsv(
  "customers_utf8.csv",
  "得意先コード,得意先名称1,担当者コード\nSMK001,スモークテスト商事株式会社,ZZ999\n",
);
const customersCsvSjis = writeCsv(
  "customers_sjis.csv",
  "得意先コード,得意先名称1\nSMK001,スモークテスト商事（更新後）\n",
  "sjis",
);
const customersCsvBadRow = writeCsv(
  "customers_badrow.csv",
  "得意先コード,得意先名称1\nSMK002,\n",
);

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

  // 1. 通常インポート（新規作成、かつ存在しない担当者コードはnull化される）
  await page.goto(`${BASE_URL}/customers/import`);
  await page.setInputFiles('input[name="file"]', customersCsvUtf8);
  await page.click('button:has-text("取り込み")');
  await page.waitForSelector("text=取り込み結果", { timeout: 15000 });
  let text = await page.textContent("body");
  log(
    "normal import (create + FK null)",
    /新規登録\s*1/.test(text) && /1件の参照項目を空欄/.test(text),
  );

  // 2. Shift_JIS自動判定 + 同一コードの上書き更新
  await page.goto(`${BASE_URL}/customers/import`);
  await page.setInputFiles('input[name="file"]', customersCsvSjis);
  await page.click('button:has-text("取り込み")');
  await page.waitForSelector("text=取り込み結果", { timeout: 15000 });
  text = await page.textContent("body");
  log("Shift_JIS import + upsert update", /更新\s*1/.test(text));

  await page.goto(`${BASE_URL}/customers?q=SMK001`);
  await page.waitForSelector("table");
  text = await page.textContent("body");
  log("updated name reflected", text.includes("スモークテスト商事（更新後）"));

  // 3. 必須項目欠落行はスキップされる
  await page.goto(`${BASE_URL}/customers/import`);
  await page.setInputFiles('input[name="file"]', customersCsvBadRow);
  await page.click('button:has-text("取り込み")');
  await page.waitForSelector("text=取り込み結果", { timeout: 15000 });
  text = await page.textContent("body");
  log("missing required field row skipped", /失敗（スキップ）\s*1/.test(text));

  // 後片付け
  await page.goto(`${BASE_URL}/customers?q=SMK001`);
  await page.waitForSelector("table");
  const deactivateBtn = page.locator("text=無効化").first();
  if (await deactivateBtn.count()) await deactivateBtn.click();
  log("cleanup: test customer deactivated", true);
} catch (e) {
  log("exception", false, String(e));
} finally {
  await browser.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
