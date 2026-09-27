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
// 旧システムの実際の出力に合わせ、見出しの数字が全角（得意先名称１など）のケース
const customersCsvFullWidthHeader = writeCsv(
  "customers_fullwidth_header.csv",
  "得意先コード,得意先名称１,得意先名称２,得意先略称,フリガナ,締日,集金日,集金区分,集金備考,担当者コード\n" +
    "SMK001,全角見出しテスト商事,,全角テスト,ｾﾞﾝｶｸﾃｽﾄ,31,20,3,,\n",
  "sjis",
);
// 商品マスタ（まとめて登録する処理）: 正常行・商品名が長すぎる行・商品名が空の行・同じコードの重複行
const productsCsvMixed = writeCsv(
  "products_mixed.csv",
  "商品コード,商　品　名,規　格,売上単価１\n" +
    "SMKP01,スモーク商品（最初の行）,M8,100\n" +
    `SMKP02,${"長".repeat(81)},M8,100\n` +
    "SMKP03,,M8,100\n" +
    "SMKP01,スモーク商品（後の行で上書き）,M10,250\n",
  "sjis",
);
// ExcelでCSVを保存して、得意先コードの先頭の0が消えたケース（0998 → 998）
const customersCsvUnpadded = writeCsv(
  "customers_unpadded.csv",
  "得意先コード,得意先名称1,郵便番号,住所1\n998,ゼロ補完テスト商事,920-0998,金沢市ゼロ補完町1\n",
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
    // 2回目以降の実行ではテスト用の得意先が既にあるため「更新」になる
    (/新規登録\s*1/.test(text) || /更新\s*1/.test(text)) && /1件の参照項目を空欄/.test(text),
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

  // 4. 見出しの数字が全角（得意先名称１）でも列を認識できる
  await page.goto(`${BASE_URL}/customers/import`);
  await page.setInputFiles('input[name="file"]', customersCsvFullWidthHeader);
  await page.click('button:has-text("取り込み")');
  await page.waitForSelector("text=取り込み結果", { timeout: 15000 });
  text = await page.textContent("body");
  log("full-width digit headers (得意先名称１) recognized", /更新\s*1/.test(text) && /失敗（スキップ）\s*0/.test(text));

  await page.goto(`${BASE_URL}/customers?q=SMK001`);
  await page.waitForSelector("table");
  text = await page.textContent("body");
  log("name from full-width header reflected", text.includes("全角見出しテスト商事"));

  // 4-2. 得意先コードの先頭の0が消えたCSV（998）は4桁（0998）にそろえて取り込み、
  //      以前の取り込みで「998」のまま別に登録されていたもの（伝票の紐づきなし）は削除される
  await page.goto(`${BASE_URL}/customers/998`);
  if ((await page.locator('input[name="name1"]').count()) === 0) {
    await page.goto(`${BASE_URL}/customers/new`);
    await page.fill('input[name="code"]', "998");
    await page.fill('input[name="name1"]', "先頭の0が消えた得意先");
    await page.click('button:has-text("保存")');
    await page.waitForURL(/\/customers(\?.*)?$/, { timeout: 10000 });
  }
  await page.goto(`${BASE_URL}/customers/import`);
  await page.setInputFiles('input[name="file"]', customersCsvUnpadded);
  await page.click('button:has-text("取り込み")');
  await page.waitForSelector("text=取り込み結果", { timeout: 15000 });
  text = (await page.textContent("body")).replace(/\s+/g, "");
  log("unpadded customer code padded to 4 digits", text.includes("先頭に0を補って4桁のコードとして取り込みました"));
  log("unpadded duplicate removed", text.includes("1件は、伝票などが紐づいていなかったため削除しました"));
  await page.goto(`${BASE_URL}/customers/0998`);
  log(
    "postal code stored on the 4-digit customer",
    (await page.inputValue('input[name="postal_code"]')) === "920-0998" &&
      (await page.inputValue('input[name="name1"]')) === "ゼロ補完テスト商事",
  );
  await page.goto(`${BASE_URL}/customers/998`);
  log("unpadded duplicate no longer exists", (await page.locator('input[name="name1"]').count()) === 0);

  // 5. 商品マスタ: 問題のある行だけスキップされ、他の行はまとめて登録される
  await page.goto(`${BASE_URL}/products/import`);
  await page.setInputFiles('input[name="file"]', productsCsvMixed);
  await page.click('button:has-text("取り込み")');
  await page.waitForSelector("text=取り込み結果", { timeout: 15000 });
  text = await page.textContent("body");
  log(
    "product import: invalid rows skipped with reasons",
    /失敗（スキップ）\s*2/.test(text) && text.includes("商品名が80文字を超えている") && text.includes("商品名が空"),
  );
  await page.goto(`${BASE_URL}/products?q=SMKP01`);
  await page.waitForSelector("table");
  text = await page.textContent("body");
  log("product import: duplicate code uses the later row", text.includes("スモーク商品（後の行で上書き）"));

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
