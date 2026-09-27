// 各種帳票PDF出力（納品書・見積書・請求書）の一連の動作確認。
// 売上伝票・見積書をそれぞれ作成してPDFリンクの存在とPDF実体の生成を確認し、
// 請求更新を実行して請求書PDFも確認したのち、すべて後片付け（削除・取消）する。
// 事前に `npm run dev` でアプリを起動しておいてください。
//   node scripts/smoke_reports.mjs

import { chromium } from "playwright";
import { PDFParse } from "pdf-parse";

const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const CUSTOMER_CODE = "0006"; // 実データ: closing_day = 31（月末）
const results = [];
function log(step, ok, extra = "") {
  results.push({ step, ok, extra });
  console.log((ok ? "OK  " : "FAIL") + " - " + step + (extra ? " :: " + extra : ""));
}

async function assertPdf(page, url, label) {
  const res = await page.request.get(url);
  const ok = res.ok();
  const contentType = res.headers()["content-type"] || "";
  const body = ok ? await res.body() : Buffer.alloc(0);
  const looksLikePdf = body.length > 500 && body.subarray(0, 5).toString("latin1") === "%PDF-";
  log(`${label}: HTTP 200`, ok, `status=${res.status()}`);
  log(`${label}: content-type is application/pdf`, contentType.includes("application/pdf"), contentType);
  log(`${label}: body is a valid PDF (${body.length} bytes)`, looksLikePdf);
  return body;
}

async function pdfPageCount(buf) {
  const parser = new PDFParse({ data: buf });
  const info = await parser.getInfo({ parsePageInfo: true });
  await parser.destroy();
  return info.total;
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

  // ログイン前（未認証）のPDFルートはミドルウェアにより/loginへリダイレクトされ、
  // PDFの実体は返らないことを確認する（他の画面と同じ認証保護がPDFルートにも効いている）
  {
    const unauthedContext = await browser.newContext();
    const unauthedPage = await unauthedContext.newPage();
    const res = await unauthedPage.request.get(`${BASE_URL}/sales-vouchers/1/print`, { maxRedirects: 0 });
    const location = res.headers()["location"] || "";
    log(
      "print route requires login (redirects to /login without session)",
      res.status() === 307 && location.includes("/login"),
      `status=${res.status()}, location=${location}`,
    );
    await unauthedContext.close();
  }

  // 1. 売上伝票を作成 → 納品書PDF
  await page.goto(`${BASE_URL}/sales-vouchers/new`);
  await page.waitForSelector('input[placeholder*="F8で検索"]');
  await page.fill('input[placeholder*="F8で検索"]', CUSTOMER_CODE);
  const svRow = page.locator("tbody tr").first();
  await svRow.locator('input[placeholder*="商品名"]').fill("帳票出力テスト商品");
  const svNumberInputs = svRow.locator('input[type="number"]');
  await svNumberInputs.nth(0).fill("2"); // 数量
  await svNumberInputs.nth(2).fill("1000"); // 売上単価
  await page.click('button:has-text("保存")');
  await page.waitForURL(/\/sales-vouchers\/\d+$/, { timeout: 15000 });
  const salesVoucherUrl = page.url();
  const salesVoucherId = salesVoucherUrl.match(/\/sales-vouchers\/(\d+)$/)?.[1];
  log("sales voucher created", true, salesVoucherUrl);

  const deliveryNoteLink = page.locator('a:has-text("納品書PDF")');
  log("納品書PDF link shown on detail page", (await deliveryNoteLink.count()) === 1);
  const shortPdf = await assertPdf(page, `${BASE_URL}/sales-vouchers/${salesVoucherId}/print`, "納品書PDF");
  const shortPageCount = await pdfPageCount(shortPdf);
  log("納品書PDF(2品番): 正・控1組で1枚に収まる", shortPageCount === 1, `pages=${shortPageCount}`);

  // 1-b. 品番が7件を超える売上伝票 → 納品書が正・控とも2枚に分かれることを確認
  await page.goto(`${BASE_URL}/sales-vouchers/new`);
  await page.waitForSelector('input[placeholder*="F8で検索"]');
  await page.fill('input[placeholder*="F8で検索"]', CUSTOMER_CODE);
  for (let i = 0; i < 9; i++) {
    if (i > 0) await page.click('button:has-text("+ 明細行を追加")');
    const row = page.locator("tbody tr").nth(i);
    await row.locator('input[placeholder*="商品名"]').fill(`帳票出力テスト改ページ商品${i + 1}`);
    const nums = row.locator('input[type="number"]');
    await nums.nth(0).fill("1");
    await nums.nth(2).fill("1000");
  }
  await page.click('button:has-text("保存")');
  await page.waitForURL(/\/sales-vouchers\/\d+$/, { timeout: 15000 });
  const longVoucherUrl = page.url();
  const longVoucherId = longVoucherUrl.match(/\/sales-vouchers\/(\d+)$/)?.[1];
  log("9品番の売上伝票を作成（改ページ確認用）", true, longVoucherUrl);

  const longPdf = await assertPdf(page, `${BASE_URL}/sales-vouchers/${longVoucherId}/print`, "納品書PDF(9品番)");
  const longPageCount = await pdfPageCount(longPdf);
  log("納品書PDF(9品番): 7品番/枚を超えるため2枚に分かれる", longPageCount === 2, `pages=${longPageCount}`);

  await page.goto(longVoucherUrl);
  page.once("dialog", (d) => d.accept());
  await page.click('button:has-text("削除")');
  await page.waitForURL(`${BASE_URL}/sales-vouchers`, { timeout: 8000 });
  log("9品番の売上伝票を後片付け", true);

  // 2. 見積書を作成 → 見積書PDF
  await page.goto(`${BASE_URL}/quotations/new`);
  await page.waitForSelector('input[placeholder*="F8で検索"]');
  await page.fill('input[placeholder*="F8で検索"]', CUSTOMER_CODE);
  await page.fill('input[placeholder="案件名 1行目"]', "帳票出力テスト案件");
  const qRow = page.locator("tbody tr").first();
  await qRow.locator('input[placeholder*="品名"]').fill("帳票出力テスト部材");
  const qNumberInputs = qRow.locator('input[type="number"]');
  await qNumberInputs.nth(0).fill("3"); // 数量
  await qNumberInputs.nth(1).fill("500"); // 原価単価
  await qNumberInputs.nth(2).fill("800"); // 見積単価
  await page.click('button:has-text("保存")');
  await page.waitForURL(/\/quotations\/\d+$/, { timeout: 15000 });
  const quotationUrl = page.url();
  const quotationId = quotationUrl.match(/\/quotations\/(\d+)$/)?.[1];
  log("quotation created", true, quotationUrl);

  const quotationPdfLink = page.locator('a:has-text("見積書PDF")');
  log("見積書PDF link shown on detail page", (await quotationPdfLink.count()) === 1);
  await assertPdf(page, `${BASE_URL}/quotations/${quotationId}/print`, "見積書PDF");

  // 3. 請求更新を実行 → 請求書PDF
  await page.goto(`${BASE_URL}/billing-closings/new`);
  await page.waitForSelector("select");
  await page.locator("select").selectOption("31"); // 締日: 月末
  await page.click('button:has-text("プレビュー")');
  await page.waitForSelector("table", { timeout: 15000 });
  page.once("dialog", (d) => d.accept());
  await page.click('button:has-text("この内容で請求更新を実行する")');
  await page.waitForURL(/\/billing-closings\/\d+$/, { timeout: 15000 });
  const closingUrl = page.url();
  const closingId = closingUrl.match(/\/billing-closings\/(\d+)$/)?.[1];
  log("billing closing executed", true, closingUrl);

  const recordRow = page.locator("tbody tr", { hasText: CUSTOMER_CODE }).first();
  const invoicePdfLink = recordRow.locator('a:has-text("請求書PDF")');
  log("請求書PDF link shown on closing detail page", (await invoicePdfLink.count()) === 1);
  const invoiceHref = await invoicePdfLink.getAttribute("href");
  log("請求書PDF link points to this closing's record", !!invoiceHref && invoiceHref.includes(`/billing-closings/${closingId}/records/`));
  await assertPdf(page, `${BASE_URL}${invoiceHref}`, "請求書PDF");

  // 4. 後片付け: 請求更新を取り消し、対象の売上伝票が未請求に戻ってから伝票を削除する
  page.once("dialog", (d) => d.accept());
  await page.click('button:has-text("この請求更新を取り消す")');
  await page.waitForSelector("text=取消済み", { timeout: 10000 });
  log("billing closing reversed for cleanup", true);

  await page.goto(salesVoucherUrl);
  page.once("dialog", (d) => d.accept());
  await page.click('button:has-text("削除")');
  await page.waitForURL(`${BASE_URL}/sales-vouchers`, { timeout: 8000 });
  log("test sales voucher cleaned up", true);

  await page.goto(quotationUrl);
  page.once("dialog", (d) => d.accept());
  await page.click('button:has-text("削除")');
  await page.waitForURL(`${BASE_URL}/quotations`, { timeout: 8000 });
  log("test quotation cleaned up", true);

  console.log(
    `\n※ billing_closings/billing_records の履歴行（id=${closingId}, 取消済み）はDBに残ります。監査目的でUIからは削除できないため、開発DBをクリーンな状態に保つ場合は別途SQLで削除してください。`,
  );
} catch (e) {
  log("exception", false, String(e));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
