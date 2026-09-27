// 印刷係（指定カセットへの直接印刷）の一連の動作確認。印刷係のパソコンの代わりに、このスクリプトがAPIを呼ぶ。
// - 管理者が接続キーを発行できる（誤ったキーは拒否される）
// - 売上伝票の「印刷する」で依頼すると、印刷係が未接続の間は「印刷待ち」と表示される
// - 印刷係が依頼を取り出すと、納品書のカセット（3）とPDFを受け取れ、完了を報告すると画面に「印刷しました」と出る
// - 同じ依頼を二重に取り出さない。印刷待ちの依頼は取り消せ、取り消した依頼は印刷されない
// - 帳票ごとのカセットの設定が依頼に反映される（確認後に元へ戻す）
// - 失敗を報告するとエラーとして表示される。無効にした印刷係のキーは使えない
// 売上伝票が1件以上登録されていること。事前に `npm run dev` でアプリを起動しておいてください。
//   node scripts/smoke_print_agent.mjs

import { chromium } from "playwright";

const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const AGENT_NAME = `スモーク印刷係${Date.now() % 100000}`;
const results = [];
function log(step, ok, extra = "") {
  results.push({ step, ok, extra });
  console.log((ok ? "OK  " : "FAIL") + " - " + step + (extra ? " :: " + extra : ""));
}

async function api(key, method, path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const type = res.headers.get("content-type") || "";
  return { status: res.status, type, data: type.includes("json") ? await res.json() : Buffer.from(await res.arrayBuffer()) };
}

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
});
const page = await browser.newPage();
page.on("dialog", (d) => d.accept());

try {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[name="loginId"]', "admin");
  await page.fill('input[name="password"]', "changeme123");
  await page.click('button:has-text("ログイン")');
  await page.waitForURL(`${BASE_URL}/`, { timeout: 8000 });
  log("print status menu shown", (await page.locator("nav >> text=印刷状況").count()) === 1);

  // 1. 接続キーを発行
  await page.goto(`${BASE_URL}/print-jobs`);
  await page.fill('input[name="name"]', AGENT_NAME);
  await page.click('button:has-text("接続キーを発行")');
  await page.waitForSelector("code", { timeout: 8000 });
  const key = (await page.textContent("code")).trim();
  log("agent key issued", key.length >= 20);
  const bad = await api("wrong-key", "POST", "/api/print-agent/next");
  log("wrong key rejected", bad.status === 401);

  // 2. 売上伝票の「印刷する」（この時点では印刷係はまだ一度も接続していない）
  await page.goto(`${BASE_URL}/sales-vouchers`);
  const href = (await page.locator("tbody a").evaluateAll((as) => as.map((a) => a.getAttribute("href")))).find((h) =>
    /^\/sales-vouchers\/\d+$/.test(h ?? ""),
  );
  await page.goto(`${BASE_URL}${href}`);
  log(
    "preview and print buttons shown",
    (await page.locator('a:has-text("プレビュー")').count()) === 1 &&
      (await page.locator('button:has-text("印刷する")').count()) === 1,
  );
  await page.click('button:has-text("印刷する")');
  await page.waitForSelector("text=印刷係のパソコンが接続されていないため、印刷待ちです", { timeout: 8000 });
  log("offline agent shown as waiting", true);

  const ping = await api(key, "GET", "/api/print-agent/ping");
  log("ping returns agent name (utf-8 json)", ping.data.name === AGENT_NAME && ping.type.includes("charset=utf-8"));
  // 以前から残っている印刷待ちの依頼は失敗として片付け、このテストの依頼（一番新しいもの）を取り出す
  let job = null;
  for (let i = 0; i < 50; i++) {
    const { data } = await api(key, "POST", "/api/print-agent/next");
    if (!data.job) break;
    if (job) await api(key, "POST", `/api/print-agent/jobs/${job.id}/result`, { ok: false, error: "テスト前の片付け" });
    job = data.job;
  }
  log("agent claims delivery note job with cassette 3", !!job && job.cassette === 3 && job.title.startsWith("納品書"), JSON.stringify(job));
  await page.waitForSelector("text=印刷中です（カセット3）", { timeout: 8000 });
  log("page shows printing", true);
  const again = await api(key, "POST", "/api/print-agent/next");
  log("same job is not claimed twice", again.data.job === null);
  const pdf = await api(key, "GET", `/api/print-agent/jobs/${job.id}/pdf`);
  log("agent downloads the PDF", pdf.status === 200 && pdf.data.subarray(0, 5).toString("latin1") === "%PDF-");
  await api(key, "POST", `/api/print-agent/jobs/${job.id}/result`, { ok: true });
  await page.waitForSelector("text=印刷しました（カセット3）", { timeout: 8000 });
  log("page shows printed", true);

  // 3. 取り消し
  await page.click('button:has-text("印刷する")');
  await page.waitForSelector("text=/印刷を依頼しました|印刷待ち/", { timeout: 8000 });
  await page.goto(`${BASE_URL}/print-jobs`);
  await page.locator("tbody tr", { hasText: "印刷待ち" }).first().locator('button:has-text("取り消す")').click();
  await page.waitForTimeout(1500);
  const afterCancel = await api(key, "POST", "/api/print-agent/next");
  log("canceled job is not printed", afterCancel.data.job === null);

  // 4. カセットの設定変更が反映される
  await page.goto(`${BASE_URL}/print-jobs`);
  await page.selectOption('select[name="delivery_note"]', "1");
  await page.click('form:has(select[name="delivery_note"]) button:has-text("保存")');
  await page.waitForSelector("text=保存しました", { timeout: 8000 });
  await page.goto(`${BASE_URL}${href}`);
  await page.click('button:has-text("印刷する")');
  await page.waitForSelector("text=/印刷を依頼しました|印刷待ち/", { timeout: 8000 });
  const job2 = (await api(key, "POST", "/api/print-agent/next")).data.job;
  log("cassette setting is used", job2?.cassette === 1, JSON.stringify(job2));
  // 5. 失敗の報告
  await api(key, "POST", `/api/print-agent/jobs/${job2.id}/result`, { ok: false, error: "用紙がありません（テスト）" });
  await page.waitForSelector("text=用紙がありません（テスト）", { timeout: 8000 });
  log("failure is shown on the page", true);
  await page.goto(`${BASE_URL}/print-jobs`);
  await page.selectOption('select[name="delivery_note"]', "3");
  await page.click('form:has(select[name="delivery_note"]) button:has-text("保存")');
  await page.waitForSelector("text=保存しました", { timeout: 8000 });
  log("cassette setting restored", true);

  // 6. 無効にした印刷係のキーは使えない
  await page.locator("tbody tr", { hasText: AGENT_NAME }).locator('button:has-text("無効にする")').click();
  await page.waitForTimeout(1500);
  const disabled = await api(key, "POST", "/api/print-agent/next");
  log("deactivated agent key rejected", disabled.status === 401);
} catch (e) {
  log("exception", false, String(e));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
