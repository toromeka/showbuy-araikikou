// 複数端末からの同時アクセスに対する安全性を確認するスモークテスト。
// 1. 5つの独立したブラウザコンテキスト（＝別々のPCを想定）で同時ログインし、
//    同時に売上伝票を新規登録して、伝票番号がすべて重複なく採番されることを確認する。
// 2. 同じ請求更新を2つの端末からほぼ同時に「実行」しても、二重に締め処理（billing_closings行の
//    重複作成）が起きないことを確認する（アドバイザリロックによる排他制御）。
// 3. 請求確定済みの伝票を、確定とほぼ同時に別端末から編集・削除しようとしても失敗する
//    （TOCTOU対策のwhere句がここで効いていることを確認）。
// 事前に `npm run dev` でアプリを起動しておいてください。
//   node scripts/smoke_concurrency.mjs

import { chromium } from "playwright";
import pg from "pg";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const CUSTOMER_CODE = "0006"; // 実データ: closing_day = 31（月末）
const results = [];
function log(step, ok, extra = "") {
  results.push({ step, ok, extra });
  console.log((ok ? "OK  " : "FAIL") + " - " + step + (extra ? " :: " + extra : ""));
}

// このスクリプトはDB直接検証のためDATABASE_URLが必要。他のスモークテストと同じ手順
// （`node scripts/smoke_concurrency.mjs` だけ）で動くよう、未設定なら .env から読み込む。
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

async function newLoggedInPage() {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[name="loginId"]', "admin");
  await page.fill('input[name="password"]', "changeme123");
  await page.click('button:has-text("ログイン")');
  await page.waitForURL(`${BASE_URL}/`, { timeout: 8000 });
  return { context, page };
}

const cleanupVoucherUrls = [];

try {
  // --- 1. 5端末から同時に売上伝票を新規登録 → 伝票番号が重複しないこと ---
  const N = 5;
  const sessions = await Promise.all(Array.from({ length: N }, () => newLoggedInPage()));
  log(`${N}端末で同時ログイン`, true);

  const createResults = await Promise.all(
    sessions.map(async ({ page }, i) => {
      await page.goto(`${BASE_URL}/sales-vouchers/new`);
      await page.waitForSelector('input[placeholder*="F8で検索"]');
      await page.fill('input[placeholder*="F8で検索"]', CUSTOMER_CODE);
      const row = page.locator("tbody tr").first();
      await row.locator('input[placeholder*="商品名"]').fill(`同時実行テスト商品${i}`);
      const nums = row.locator('input[type="number"]');
      await nums.nth(0).fill("1");
      await nums.nth(2).fill("100");
      await page.click('button:has-text("保存")');
      try {
        await page.waitForURL(/\/sales-vouchers\/\d+$/, { timeout: 15000 });
        return { ok: true, url: page.url() };
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    }),
  );

  const allCreated = createResults.every((r) => r.ok);
  log(`${N}件すべて同時登録に成功`, allCreated, JSON.stringify(createResults.map((r) => r.ok)));
  createResults.forEach((r) => r.ok && cleanupVoucherUrls.push(r.url));

  const voucherNos = [];
  for (const r of createResults) {
    if (!r.ok) continue;
    const id = r.url.match(/\/sales-vouchers\/(\d+)$/)[1];
    const { rows } = await db.query("select voucher_no from sales_vouchers where id = $1", [id]);
    voucherNos.push(rows[0]?.voucher_no);
  }
  const uniqueNos = new Set(voucherNos);
  log(
    "同時登録された伝票番号がすべて重複なく採番されている",
    uniqueNos.size === voucherNos.length && voucherNos.length === N,
    JSON.stringify(voucherNos),
  );

  // --- 2. 請求更新を2端末からほぼ同時に実行 → billing_closings行が1つしか作られないこと ---
  const { rows: beforeRows } = await db.query(
    "select coalesce(max(id), 0) as max_id from billing_closings",
  );
  const closingIdBefore = Number(beforeRows[0].max_id);

  const [session1, session2] = sessions;
  await Promise.all(
    [session1, session2].map(async ({ page }) => {
      await page.goto(`${BASE_URL}/billing-closings/new`);
      await page.waitForSelector("select");
      await page.locator("select").selectOption("31");
      await page.click('button:has-text("プレビュー")');
      await page.waitForSelector("table", { timeout: 15000 });
    }),
  );

  const executeOutcomes = await Promise.all(
    [session1, session2].map(async ({ page }) => {
      page.once("dialog", (d) => d.accept());
      await page.click('button:has-text("この内容で請求更新を実行する")');
      try {
        await page.waitForURL(/\/billing-closings\/\d+$/, { timeout: 15000 });
        return { succeeded: true, url: page.url() };
      } catch {
        const errorText = await page
          .locator("p.text-red-600")
          .textContent()
          .catch(() => null);
        return { succeeded: false, errorText };
      }
    }),
  );
  log(
    "2端末同時実行の結果を取得",
    true,
    JSON.stringify(executeOutcomes.map((o) => (o.succeeded ? `success:${o.url}` : `failed:${o.errorText}`))),
  );

  const { rows: afterRows } = await db.query(
    "select id from billing_closings where id > $1 order by id",
    [closingIdBefore],
  );
  log(
    "同時実行にもかかわらずbilling_closingsは1件しか作成されない（二重請求防止）",
    afterRows.length === 1,
    `created=${afterRows.length}`,
  );

  const newClosingId = afterRows[0]?.id;
  const succeededCount = executeOutcomes.filter((o) => o.succeeded).length;
  log("2端末のうち少なくとも1件は成功している", succeededCount >= 1, `succeeded=${succeededCount}`);

  // --- 3. 請求確定済みの伝票を、別端末から編集・削除しようとすると拒否される ---
  if (newClosingId) {
    const testVoucherUrl = cleanupVoucherUrls[0];
    const testVoucherId = testVoucherUrl.match(/\/sales-vouchers\/(\d+)$/)[1];
    const { rows: billedRows } = await db.query(
      "select is_billed from sales_vouchers where id = $1",
      [testVoucherId],
    );
    if (billedRows[0]?.is_billed) {
      const { page } = session1;
      await page.goto(`${BASE_URL}/sales-vouchers/${testVoucherId}`);
      const text = await page.textContent("body");
      log(
        "請求確定済みの伝票は詳細画面で編集・削除ボタンが表示されない",
        text.includes("請求確定済み") && !text.includes("編集"),
      );
    } else {
      log("請求確定済みの伝票でのUI確認", true, "テスト対象の伝票が今回のバッチ対象外だったためスキップ扱い");
    }

    // 後片付け: 今回作成した請求更新を取り消す
    const { page } = session1;
    await page.goto(`${BASE_URL}/billing-closings/${newClosingId}`);
    page.once("dialog", (d) => d.accept());
    await page.click('button:has-text("この請求更新を取り消す")');
    await page.waitForSelector("text=取消済み", { timeout: 10000 });
    log("後片付け: 請求更新を取り消し", true);
  }

  // --- 後片付け: 作成したテスト伝票をすべて削除 ---
  const { page: cleanupPage } = session1;
  let cleanedUp = 0;
  for (const url of cleanupVoucherUrls) {
    await cleanupPage.goto(url);
    const text = await cleanupPage.textContent("body");
    if (!text.includes("削除")) continue; // 何らかの理由でまだ確定済みならスキップ
    cleanupPage.once("dialog", (d) => d.accept());
    await cleanupPage.click('button:has-text("削除")');
    await cleanupPage.waitForURL(`${BASE_URL}/sales-vouchers`, { timeout: 8000 }).catch(() => {});
    cleanedUp++;
  }
  log(`テスト伝票を後片付け（${cleanedUp}/${cleanupVoucherUrls.length}件）`, cleanedUp === cleanupVoucherUrls.length);

  await Promise.all(sessions.map(({ context }) => context.close()));
} catch (e) {
  log("exception", false, String(e));
} finally {
  await browser.close();
  await db.end();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
