// 伝票番号が衝突した場合に、自動的に次の番号へ採番し直して登録を継続する
// （旧システムの挙動に合わせた）機能のスモークテスト。
//
// 手順:
//   1. 現在の voucher_sequences.sales.last_number（=N）を確認する。
//   2. 次に採番されるはずの番号（N+1）を、DBに直接あらかじめ挿入しておく
//      （＝他端末が先に同じ番号で登録済み、という状況を人為的に再現する）。
//   3. アプリのUIから通常どおり売上伝票を新規登録する。
//   4. 保存が失敗せずに完了し、実際に採番された伝票番号が N+1 ではなく N+2
//      （衝突した番号を自動的にスキップした次の番号）になっていることを確認する。
//   5. voucher_sequences.sales.last_number が N+2 まで進んでいることも確認する。
//   6. 後片付け（今回作成した2件の伝票、カウンタの復元）。
//
// 事前に `npm run dev` でアプリを起動しておいてください。
//   node scripts/smoke_voucher_number_retry.mjs

import { chromium } from "playwright";
import pg from "pg";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const CUSTOMER_CODE = "0006";
const results = [];
function log(step, ok, extra = "") {
  results.push({ step, ok, extra });
  console.log((ok ? "OK  " : "FAIL") + " - " + step + (extra ? " :: " + extra : ""));
}

function loadDatabaseUrlFromEnvFile() {
  try {
    const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".env");
    const content = readFileSync(envPath, "utf8");
    const match = content.match(/^DATABASE_URL\s*=\s*"?(.*?)"?\s*$/m);
    return match?.[1];
  } catch {
    return undefined;
  }
}

const dbUrl = process.env.DATABASE_URL_OVERRIDE ?? process.env.DATABASE_URL ?? loadDatabaseUrlFromEnvFile();
if (!dbUrl) {
  console.error("DATABASE_URL が見つかりません（環境変数、または app/.env のいずれかに設定してください）");
  process.exit(1);
}
const db = new pg.Client({ connectionString: dbUrl });
await db.connect();

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
});

let plantedVoucherNo = null;
let createdVoucherIds = [];
let originalLastNumber = null;

try {
  const { rows: seqRows } = await db.query(
    "select last_number from voucher_sequences where voucher_type = 'sales'",
  );
  if (seqRows.length === 0) throw new Error("voucher_sequences に sales の行がありません");
  originalLastNumber = BigInt(seqRows[0].last_number);
  log("現在の採番カウンタを確認", true, `last_number=${originalLastNumber}`);

  const nextNo = originalLastNumber + 1n;
  plantedVoucherNo = nextNo.toString().padStart(6, "0");

  // 「他端末が先にこの番号で登録済み」の状況を人為的に再現する
  await db.query(
    `insert into sales_vouchers
       (voucher_no, is_cash_sale, customer_code, voucher_date, entered_on, tax_rate,
        sales_amount, cost_amount, tax_amount, gross_profit)
     values ($1, false, $2, current_date, now(), 10, 0, 0, 0, 0)`,
    [plantedVoucherNo, CUSTOMER_CODE],
  );
  log("次の採番予定番号を先取りする伝票をDBに直接挿入（衝突状況を再現）", true, `voucher_no=${plantedVoucherNo}`);

  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[name="loginId"]', "admin");
  await page.fill('input[name="password"]', "changeme123");
  await page.click('button:has-text("ログイン")');
  await page.waitForURL(`${BASE_URL}/`, { timeout: 8000 });

  await page.goto(`${BASE_URL}/sales-vouchers/new`);
  await page.waitForSelector('input[placeholder*="F8で検索"]');
  await page.fill('input[placeholder*="F8で検索"]', CUSTOMER_CODE);
  const row = page.locator("tbody tr").first();
  await row.locator('input[placeholder*="商品名"]').fill("番号衝突自動リトライテスト商品");
  const nums = row.locator('input[type="number"]');
  await nums.nth(0).fill("1");
  await nums.nth(2).fill("100");

  let saveOk = true;
  await page.click('button:has-text("保存")');
  try {
    await page.waitForURL(/\/sales-vouchers\/\d+$/, { timeout: 15000 });
  } catch {
    saveOk = false;
  }
  log("番号が衝突する状況でも、エラーにならず登録が完了する", saveOk, saveOk ? page.url() : "保存に失敗した");

  if (saveOk) {
    const id = page.url().match(/\/sales-vouchers\/(\d+)$/)[1];
    createdVoucherIds.push(id);
    const { rows } = await db.query("select voucher_no from sales_vouchers where id = $1", [id]);
    const actualNo = rows[0]?.voucher_no;
    const expectedNo = (nextNo + 1n).toString().padStart(6, "0");
    log(
      "衝突した番号(N+1)をスキップし、その次の番号(N+2)で採番されている",
      actualNo === expectedNo,
      `期待値=${expectedNo}, 実際=${actualNo}`,
    );

    const { rows: seqAfterRows } = await db.query(
      "select last_number from voucher_sequences where voucher_type = 'sales'",
    );
    const lastNumberAfter = BigInt(seqAfterRows[0].last_number);
    log(
      "採番カウンタもN+2まで進んでいる",
      lastNumberAfter === nextNo + 1n,
      `期待値=${nextNo + 1n}, 実際=${lastNumberAfter}`,
    );
  }

  await context.close();
} catch (e) {
  log("exception", false, String(e));
} finally {
  // 後片付け: 作成した伝票と、人為的に挿入した衝突用の伝票を削除する
  for (const id of createdVoucherIds) {
    await db.query("delete from sales_voucher_lines where voucher_id = $1", [id]);
    await db.query("delete from sales_vouchers where id = $1", [id]);
  }
  if (plantedVoucherNo) {
    await db.query("delete from sales_voucher_lines where voucher_id in (select id from sales_vouchers where voucher_no = $1)", [plantedVoucherNo]);
    await db.query("delete from sales_vouchers where voucher_no = $1", [plantedVoucherNo]);
  }
  // 採番カウンタは「実データの最大値へ引き上げる」方向のみ許容する設計であり、
  // このテストで進んだ分を元に戻しても実害はないため、テスト前の値へ復元しておく。
  if (originalLastNumber !== null) {
    await db.query("update voucher_sequences set last_number = $1 where voucher_type = 'sales'", [
      originalLastNumber.toString(),
    ]);
  }
  console.log("後片付け完了");

  await browser.close();
  await db.end();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
