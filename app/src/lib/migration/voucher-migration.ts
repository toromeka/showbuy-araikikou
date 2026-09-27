import { prisma } from "@/lib/prisma";
import { parseCsv } from "@/lib/csv";
import { roundByMethod } from "@/lib/tax";
import { lastClosingDateOnOrBefore, todayInJapan } from "@/lib/closing-date";
import { HANDWRITE_PRODUCT_CODE } from "@/lib/product-codes";
import { acquireClosingLock } from "@/lib/closing-lock";
import { closingTaxAmount } from "@/lib/closing-tax";

// ---------------------------------------------------------------------------
// 旧システムの伝票データ（売上・仕入・入金のCSV）を新システムへ一括で移す処理。
//
// - 売上伝票・仕入伝票は「伝票日付,伝票番号,区分,得意先/仕入先コード,得意先/仕入先名,商品コード,
//   商品名,規格,数量,単位,単価,金額,備考,担当者コード,担当者名,摘要名」の明細単位のCSV
// - 入金伝票は「伝票日付,伝票番号,得意先コード,得意先名,区分,金額,手数料,相殺,手形決済日,入金日付」
//   の1伝票1行のCSV（金額が請求を消し込む全額で、手数料・相殺はその内訳）
//
// 取り込みと同時に、各得意先の最初の売上がある締めから直近の締めまでの請求更新を再現し、
// 過去の請求書を見られるようにする（前回請求残は0から始める）。仕入は、各仕入先の直近の締めまでを
// 支払更新済みにする（支払伝票のデータが無いため、過去の仕入支払更新は再現しない）。
// ---------------------------------------------------------------------------

type Row = Record<string, string>;

export type MigrationFiles = { sales: string; purchase: string | null; receipt: string | null };

type LineInput = {
  category: string | null;
  product_code: string | null;
  product_name: string;
  spec: string | null;
  unit: string | null;
  quantity: number;
  price: number | null;
  amount: number;
  note: string | null;
};

type VoucherPlan = {
  voucher_no: string;
  partner_code: string;
  voucher_date: string; // YYYY-MM-DD
  staff_code: string | null;
  remarks: string | null;
  tax_rate: number;
  lines: LineInput[];
  subtotal: number;
  tax: number;
  line_taxes: number[]; // 売上のみ（明細ごとの消費税）
  closed: boolean; // 売上: 請求確定済み / 仕入: 支払更新済み
};

type ReceiptPlan = {
  voucher_no: string;
  customer_code: string;
  voucher_date: string;
  amount: number;
  lines: { category: string; amount: number; note: string | null; bill_due_date: string | null }[];
};

type BillingRecordPlan = {
  customer_code: string;
  closing_day: number;
  period_from: string | null;
  period_to: string;
  previous_balance: number;
  sales_amount: number;
  tax_amount: number;
  receipt_amount: number;
  billed_amount: number;
};

export type CustomerBalanceSummary = {
  code: string;
  name: string;
  closing_day: number;
  periods: number;
  first_period_to: string;
  last_period_to: string;
  previous_balance: number;
  sales_with_tax: number;
  receipt_amount: number;
  billed_amount: number;
  carried_over: number; // 前回請求残 − 今回入金（0でなければ、支払い残し・払い過ぎ・データの抜けの可能性）
};

export type MigrationPreview = {
  errors: string[];
  warnings: string[];
  counts: {
    salesVouchers: number;
    salesLines: number;
    salesBilled: number;
    purchaseVouchers: number;
    purchaseLines: number;
    purchaseSettled: number;
    receiptVouchers: number;
    receiptLines: number;
    billingClosings: number;
    billingRecords: number;
  };
  newCustomers: { code: string; name: string }[];
  newSuppliers: { code: string; name: string }[];
  newProductCount: number;
  newProductSamples: { code: string; name: string }[];
  blankedStaffCodes: { code: string; rows: number }[];
  balances: CustomerBalanceSummary[];
};

type Plan = {
  preview: MigrationPreview;
  sales: VoucherPlan[];
  purchases: VoucherPlan[];
  receipts: ReceiptPlan[];
  billing: BillingRecordPlan[];
  newCustomers: { code: string; name: string }[];
  newSuppliers: { code: string; name: string }[];
  newProducts: { code: string; name: string; spec: string | null; active: boolean }[];
};

// ---------------------------------------------------------------------------
// 共通の小さな関数
// ---------------------------------------------------------------------------
const len = (s: string) => [...s].length;
const trimOrNull = (s: string | undefined) => {
  const t = (s ?? "").replace(/[\s　]+$/g, "").replace(/^[\s　]+/g, "");
  return t === "" ? null : t;
};
function toNumber(s: string | undefined): number | null {
  const t = (s ?? "").replace(/,/g, "").trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}
function toIsoDate(s: string | undefined): string | null {
  const m = (s ?? "").trim().match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (!m) return null;
  const iso = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : iso;
}
// 旧システムのCSVはExcelを経由すると先頭の0が落ちることがあるため、数字だけのコードは桁をそろえる
const padNumeric = (code: string, width: number) => (/^\d+$/.test(code) ? code.padStart(width, "0") : code);
const toDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const addDays = (iso: string, days: number) => {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

// 締日cdの、その月の締め日（月の日数を超える締日は末日）
function closingDateOf(cd: number, y: number, m: number): string {
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(Math.min(cd, last)).padStart(2, "0")}`;
}
// date以降で最初の締め日
function nextClosingOnOrAfter(cd: number, iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  const thisMonth = closingDateOf(cd, y, m);
  if (iso <= thisMonth) return thisMonth;
  return m === 12 ? closingDateOf(cd, y + 1, 1) : closingDateOf(cd, y, m + 1);
}

class Problems {
  errors: string[] = [];
  warnings: string[] = [];
  private errorCount = 0;
  error(msg: string) {
    this.errorCount++;
    if (this.errors.length < 50) this.errors.push(msg);
  }
  finish() {
    if (this.errorCount > this.errors.length) {
      this.errors.push(`ほか ${this.errorCount - this.errors.length} 件のエラーがあります。`);
    }
  }
}

// ---------------------------------------------------------------------------
// 売上・仕入（明細単位のCSV）を伝票ごとにまとめる
// ---------------------------------------------------------------------------
function groupVoucherRows(
  kind: "売上" | "仕入",
  rows: Row[],
  problems: Problems,
): { voucher_no: string; partner_code: string; partner_name: string; date: string; staff: string | null; remarks: string | null; lines: (LineInput & { rowNo: number; rawAmount: boolean })[] }[] {
  const required = ["伝票日付", "伝票番号", "区分", "得意先/仕入先コード", "商品名", "数量", "単価", "金額"];
  if (rows.length > 0) {
    const missing = required.filter((h) => !(h in rows[0]));
    if (missing.length > 0) {
      problems.error(`${kind}伝票のCSVに見出し「${missing.join("」「")}」がありません。`);
      return [];
    }
  }

  const map = new Map<string, ReturnType<typeof groupVoucherRows>[number]>();
  for (const [i, r] of rows.entries()) {
    const rowNo = i + 2;
    const where = `${kind}伝票 ${rowNo}行目`;
    const noRaw = trimOrNull(r["伝票番号"]);
    const date = toIsoDate(r["伝票日付"]);
    const partnerRaw = trimOrNull(r["得意先/仕入先コード"]);
    if (!noRaw || !date || !partnerRaw) {
      problems.error(`${where}: 伝票番号・伝票日付・${kind === "売上" ? "得意先" : "仕入先"}コードのいずれかが空か、日付の形式が正しくありません。`);
      continue;
    }
    const voucher_no = padNumeric(noRaw, 6);
    const partner_code = padNumeric(partnerRaw, 4);
    const name = trimOrNull(r["商品名"]);
    if (!name) {
      problems.error(`${where}(伝票${voucher_no}): 商品名が空です。`);
      continue;
    }
    const qty = toNumber(r["数量"]) ?? 0;
    const price = toNumber(r["単価"]);
    const amountRaw = toNumber(r["金額"]);
    if (Number.isNaN(qty) || Number.isNaN(price as number) || Number.isNaN(amountRaw as number)) {
      problems.error(`${where}(伝票${voucher_no}): 数量・単価・金額に数字でない値があります。`);
      continue;
    }
    const category = trimOrNull(r["区分"]);
    const line = {
      rowNo,
      rawAmount: amountRaw !== null,
      // 「売上」「仕入」は通常の明細。それ以外（摘要=メモ行、売値=値引き行など）は区分として残す
      category: category === kind ? null : category,
      product_code: trimOrNull(r["商品コード"]),
      product_name: name,
      spec: trimOrNull(r["規格"]),
      unit: trimOrNull(r["単位"]),
      quantity: qty,
      price: price ?? null,
      amount: amountRaw ?? 0,
      note: trimOrNull(r["備考"]),
    };
    for (const [label, v, max] of [
      ["商品名", line.product_name, 80],
      ["規格", line.spec, 80],
      ["単位", line.unit, 10],
      ["備考", line.note, 100],
      ["商品コード", line.product_code, 15],
    ] as const) {
      if (v && len(v) > max) problems.error(`${where}(伝票${voucher_no}): ${label}が${max}文字を超えています。`);
    }

    const existing = map.get(voucher_no);
    if (existing) {
      if (existing.date !== date || existing.partner_code !== partner_code) {
        problems.error(`${where}: 伝票${voucher_no}の中で伝票日付または${kind === "売上" ? "得意先" : "仕入先"}が行ごとに違います。`);
        continue;
      }
      existing.lines.push(line);
    } else {
      const remarks = trimOrNull(r["摘要名"]);
      if (remarks && len(remarks) > 200) problems.error(`${where}(伝票${voucher_no}): 摘要名が200文字を超えています。`);
      map.set(voucher_no, {
        voucher_no,
        partner_code,
        partner_name: trimOrNull(r["得意先/仕入先名"]) ?? "",
        date,
        staff: trimOrNull(r["担当者コード"]),
        remarks,
        lines: [line],
      });
    }
  }
  return [...map.values()];
}

// ---------------------------------------------------------------------------
// 取り込み計画を作る（DBは読むだけ）
// ---------------------------------------------------------------------------
export async function planMigration(files: MigrationFiles): Promise<Plan> {
  const problems = new Problems();
  const salesRows = parseCsv(files.sales);
  const purchaseRows = files.purchase ? parseCsv(files.purchase) : [];
  const receiptRows = files.receipt ? parseCsv(files.receipt) : [];

  const salesGroups = groupVoucherRows("売上", salesRows, problems);
  const purchaseGroups = groupVoucherRows("仕入", purchaseRows, problems);

  // --- マスタ・設定の読み込み ---
  const [customers, suppliers, productRows, staffRows, settings, taxRates] = await Promise.all([
    prisma.customers.findMany({
      select: {
        code: true,
        name1: true,
        closing_day: true,
        rounding_method: true,
        calc_method: true,
        billing_customer_code: true,
        opening_balance: true,
      },
    }),
    prisma.suppliers.findMany({ select: { code: true, closing_day: true, rounding_method: true } }),
    prisma.products.findMany({ select: { code: true } }),
    prisma.staff.findMany({ select: { code: true } }),
    prisma.company_settings.findUnique({ where: { id: 1 } }),
    prisma.tax_rate_history.findMany({ orderBy: { starts_on: "desc" } }),
  ]);
  const defaultClosingDay = settings?.default_closing_day ?? 31;
  const customerMap = new Map(customers.map((c) => [c.code, c]));
  const supplierMap = new Map(suppliers.map((s) => [s.code, s]));
  const productCodes = new Set(productRows.map((p) => p.code));
  const staffCodes = new Set(staffRows.map((s) => s.code));
  const taxRateOn = (iso: string) => {
    const row = taxRates.find((t) => t.starts_on.toISOString().slice(0, 10) <= iso);
    return row ? Number(row.rate) : 10;
  };
  const today = todayInJapan();

  // --- マスタに無いコード（旧マスタとして無効状態で自動登録する） ---
  const newCustomers = new Map<string, { code: string; name: string; latest: string }>();
  const newSuppliers = new Map<string, { code: string; name: string; latest: string }>();
  const newProducts = new Map<string, { code: string; name: string; spec: string | null; active: boolean; latest: string }>();
  const blankedStaff = new Map<string, number>();

  const noteNew = (
    target: Map<string, { code: string; name: string; latest: string }>,
    code: string,
    name: string,
    date: string,
  ) => {
    const cur = target.get(code);
    // 同じコードで名前が違う場合は、日付が一番新しい伝票の名前を使う
    if (!cur || (date >= cur.latest && name)) target.set(code, { code, name: name || cur?.name || "", latest: date });
  };

  for (const g of salesGroups) if (!customerMap.has(g.partner_code)) noteNew(newCustomers, g.partner_code, g.partner_name, g.date);
  for (const g of purchaseGroups) if (!supplierMap.has(g.partner_code)) noteNew(newSuppliers, g.partner_code, g.partner_name, g.date);
  for (const g of [...salesGroups, ...purchaseGroups]) {
    for (const l of g.lines) {
      if (!l.product_code || productCodes.has(l.product_code)) continue;
      if (l.product_code === HANDWRITE_PRODUCT_CODE) {
        newProducts.set(l.product_code, { code: l.product_code, name: "手打ち商品", spec: null, active: true, latest: "9999-12-31" });
        continue;
      }
      const cur = newProducts.get(l.product_code);
      if (!cur || g.date >= cur.latest) {
        newProducts.set(l.product_code, { code: l.product_code, name: l.product_name, spec: l.spec, active: false, latest: g.date });
      }
    }
    if (g.staff && !staffCodes.has(g.staff)) blankedStaff.set(g.staff, (blankedStaff.get(g.staff) ?? 0) + g.lines.length);
  }

  // --- 売上伝票（明細ごとに消費税を計算。画面から入力したときと同じ計算） ---
  const sales: VoucherPlan[] = salesGroups.map((g) => {
    const rounding = customerMap.get(g.partner_code)?.rounding_method ?? 0;
    const rate = taxRateOn(g.date);
    const lineTaxes = g.lines.map((l) => roundByMethod(l.amount * (rate / 100), rounding));
    return {
      voucher_no: g.voucher_no,
      partner_code: g.partner_code,
      voucher_date: g.date,
      staff_code: g.staff && staffCodes.has(g.staff) ? g.staff : null,
      remarks: g.remarks,
      tax_rate: rate,
      lines: g.lines,
      subtotal: g.lines.reduce((a, l) => a + l.amount, 0),
      tax: lineTaxes.reduce((a, t) => a + t, 0),
      line_taxes: lineTaxes,
      closed: false,
    };
  });

  // --- 仕入伝票（伝票単位で消費税を計算。画面から入力したときと同じ計算） ---
  const purchases: VoucherPlan[] = purchaseGroups.map((g) => {
    const supplier = supplierMap.get(g.partner_code);
    const rate = taxRateOn(g.date);
    const subtotal = g.lines.reduce((a, l) => a + l.amount, 0);
    const lastClosing = lastClosingDateOnOrBefore(supplier?.closing_day ?? defaultClosingDay, today);
    // 金額が空の明細がある伝票は、後から画面で直せるよう未払のまま取り込む
    const hasBlankAmount = g.lines.some((l) => l.category === null && !l.rawAmount);
    if (hasBlankAmount && g.date <= lastClosing) {
      problems.warnings.push(`仕入伝票${g.voucher_no}（${g.date}）は金額が空の明細があるため、画面で直せるよう未払のまま取り込みます。`);
    }
    return {
      voucher_no: g.voucher_no,
      partner_code: g.partner_code,
      voucher_date: g.date,
      staff_code: g.staff && staffCodes.has(g.staff) ? g.staff : null,
      remarks: g.remarks,
      tax_rate: rate,
      lines: g.lines,
      subtotal,
      tax: roundByMethod(subtotal * (rate / 100), supplier?.rounding_method ?? 0),
      line_taxes: [],
      closed: g.date <= lastClosing && !hasBlankAmount,
    };
  });

  // --- 入金伝票（金額を、区分そのものの金額・振込手数料・相殺の明細に分ける） ---
  const receipts: ReceiptPlan[] = [];
  if (receiptRows.length > 0) {
    const required = ["伝票日付", "伝票番号", "得意先コード", "区分", "金額"];
    const missing = required.filter((h) => !(h in receiptRows[0]));
    if (missing.length > 0) problems.error(`入金伝票のCSVに見出し「${missing.join("」「")}」がありません。`);
  }
  const seenReceipts = new Set<string>();
  for (const [i, r] of receiptRows.entries()) {
    const where = `入金伝票 ${i + 2}行目`;
    const noRaw = trimOrNull(r["伝票番号"]);
    const date = toIsoDate(r["伝票日付"]);
    const codeRaw = trimOrNull(r["得意先コード"]);
    const amount = toNumber(r["金額"]);
    const fee = toNumber(r["手数料"]) ?? 0;
    const offset = toNumber(r["相殺"]) ?? 0;
    const category = trimOrNull(r["区分"]);
    if (!noRaw || !date || !codeRaw || amount === null || Number.isNaN(amount) || Number.isNaN(fee) || Number.isNaN(offset)) {
      problems.error(`${where}: 伝票番号・伝票日付・得意先コード・金額のいずれかが空か、正しくありません。`);
      continue;
    }
    if (!["振込", "手形", "現金", "相殺", "その他"].includes(category ?? "")) {
      problems.error(`${where}: 区分「${category ?? ""}」は取り込めません（振込・手形・現金・相殺・その他のみ）。`);
      continue;
    }
    const voucher_no = padNumeric(noRaw, 6);
    if (seenReceipts.has(voucher_no)) {
      problems.error(`${where}: 伝票番号${voucher_no}が重複しています。`);
      continue;
    }
    seenReceipts.add(voucher_no);
    const customer_code = padNumeric(codeRaw, 4);
    if (!customerMap.has(customer_code)) noteNew(newCustomers, customer_code, trimOrNull(r["得意先名"]) ?? "", date);

    const dueRaw = trimOrNull(r["手形決済日"]);
    const due = dueRaw ? toIsoDate(dueRaw) : null;
    if (dueRaw && !due) problems.error(`${where}: 手形決済日「${dueRaw}」の形式が正しくありません。`);
    const paidOn = trimOrNull(r["入金日付"]);
    const main = amount - fee - offset;
    const lines: ReceiptPlan["lines"] = [];
    if (main !== 0 || (fee === 0 && offset === 0)) {
      lines.push({
        category: category === "相殺" ? "その他" : category!,
        amount: main,
        note: category === "相殺" ? "相殺" : paidOn ? `入金日 ${paidOn}` : null,
        bill_due_date: category === "手形" ? due : null,
      });
    }
    if (fee !== 0) lines.push({ category: "その他", amount: fee, note: "振込手数料", bill_due_date: null });
    if (offset !== 0) lines.push({ category: "その他", amount: offset, note: "相殺", bill_due_date: null });
    receipts.push({ voucher_no, customer_code, voucher_date: date, amount, lines });
  }

  // 新しく登録する得意先・仕入先の名前が分からない場合は仮の名前を付ける（後から画面で直せる）
  for (const c of newCustomers.values()) if (!c.name) c.name = `旧得意先${c.code}`;
  for (const s of newSuppliers.values()) if (!s.name) s.name = `旧仕入先${s.code}`;

  // --- 請求更新の再現 ---
  // 得意先のまとめ（請求先コード）は既存マスタの設定に従う。自動登録する得意先は単独の請求先。
  type Cust = {
    code: string;
    name: string;
    closing_day: number | null;
    billing_customer_code: string | null;
    opening_balance: number;
    calc_method: number | null;
    rounding_method: number | null;
  };
  const allCustomers = new Map<string, Cust>();
  for (const c of customers) {
    allCustomers.set(c.code, {
      code: c.code,
      name: c.name1,
      closing_day: c.closing_day,
      billing_customer_code: c.billing_customer_code,
      opening_balance: Number(c.opening_balance ?? 0),
      calc_method: c.calc_method,
      rounding_method: c.rounding_method,
    });
  }
  for (const c of newCustomers.values()) {
    allCustomers.set(c.code, {
      code: c.code,
      name: c.name,
      closing_day: null,
      billing_customer_code: null,
      opening_balance: 0,
      calc_method: null,
      rounding_method: null,
    });
  }
  const rootOf = (code: string) => allCustomers.get(code)?.billing_customer_code ?? code;

  const salesByRoot = new Map<string, VoucherPlan[]>();
  for (const v of sales) {
    const root = rootOf(v.partner_code);
    if (!salesByRoot.has(root)) salesByRoot.set(root, []);
    salesByRoot.get(root)!.push(v);
  }
  const receiptsByRoot = new Map<string, ReceiptPlan[]>();
  for (const r of receipts) {
    const root = rootOf(r.customer_code);
    if (!receiptsByRoot.has(root)) receiptsByRoot.set(root, []);
    receiptsByRoot.get(root)!.push(r);
  }

  const billing: BillingRecordPlan[] = [];
  const balances: CustomerBalanceSummary[] = [];
  for (const [root, vouchers] of salesByRoot) {
    const cust = allCustomers.get(root)!;
    const cd = cust.closing_day ?? defaultClosingDay;
    const last = lastClosingDateOnOrBefore(cd, today);
    const sorted = [...vouchers].sort((a, b) => (a.voucher_date < b.voucher_date ? -1 : 1));
    const groupReceipts = receiptsByRoot.get(root) ?? [];
    let d = nextClosingOnOrAfter(cd, sorted[0].voucher_date);
    let prev: BillingRecordPlan | null = null;
    const records: BillingRecordPlan[] = [];
    while (d <= last) {
      const periodFrom: string | null = prev ? addDays(prev.period_to, 1) : null;
      const periodSales = sorted.filter((v) => !v.closed && v.voucher_date <= d);
      periodSales.forEach((v) => (v.closed = true));
      const salesAmount = periodSales.reduce((a, v) => a + v.subtotal, 0);
      // 消費税は得意先の計算方式に従う（旧システムと同じ請求単位が既定。税率ごとに計算）
      const byRate = new Map<number, { subtotal: number; voucherTax: number }>();
      for (const v of periodSales) {
        const g = byRate.get(v.tax_rate) ?? { subtotal: 0, voucherTax: 0 };
        g.subtotal += v.subtotal;
        g.voucherTax += v.tax;
        byRate.set(v.tax_rate, g);
      }
      const taxAmount = closingTaxAmount(
        [...byRate.entries()].map(([rate, g]) => ({ rate, ...g })),
        cust.calc_method,
        cust.rounding_method,
      );
      const receiptAmount = groupReceipts
        .filter((r) => r.voucher_date <= d && (periodFrom === null || r.voucher_date >= periodFrom))
        .reduce((a, r) => a + r.amount, 0);
      const previousBalance = prev ? prev.billed_amount : cust.opening_balance;
      if (previousBalance !== 0 || salesAmount !== 0 || taxAmount !== 0 || receiptAmount !== 0) {
        const rec: BillingRecordPlan = {
          customer_code: root,
          closing_day: cd,
          period_from: periodFrom,
          period_to: d,
          previous_balance: previousBalance,
          sales_amount: salesAmount,
          tax_amount: taxAmount,
          receipt_amount: receiptAmount,
          billed_amount: previousBalance + salesAmount + taxAmount - receiptAmount,
        };
        records.push(rec);
        prev = rec;
      }
      const [y, m] = d.split("-").map(Number);
      d = m === 12 ? closingDateOf(cd, y + 1, 1) : closingDateOf(cd, y, m + 1);
    }
    billing.push(...records);
    if (records.length > 0) {
      const lastRec = records[records.length - 1];
      balances.push({
        code: root,
        name: cust.name,
        closing_day: cd,
        periods: records.length,
        first_period_to: records[0].period_to,
        last_period_to: lastRec.period_to,
        previous_balance: lastRec.previous_balance,
        sales_with_tax: lastRec.sales_amount + lastRec.tax_amount,
        receipt_amount: lastRec.receipt_amount,
        billed_amount: lastRec.billed_amount,
        carried_over: lastRec.previous_balance - lastRec.receipt_amount,
      });
    }
  }
  balances.sort((a, b) => (a.code < b.code ? -1 : 1));

  const receiptOnly = [...receiptsByRoot.keys()].filter((root) => !salesByRoot.has(root));
  if (receiptOnly.length > 0) {
    problems.warnings.push(
      `売上が無く入金だけがある得意先: ${receiptOnly.join("、")}。これらの入金は、次回の請求更新で「今回入金額」として差し引かれます。`,
    );
  }
  const negatives = balances.filter((b) => b.billed_amount < 0);
  if (negatives.length > 0) {
    problems.warnings.push(`直近の請求額がマイナスになる得意先: ${negatives.map((b) => b.code).join("、")}（入金が売上より多い。データの抜けの可能性）。`);
  }
  if (blankedStaff.size > 0) {
    problems.warnings.push(
      `担当者マスタに無い担当者コード（${[...blankedStaff.keys()].join("、")}）は、伝票の担当者を空欄にして取り込みます。`,
    );
  }

  // --- 既に取り込み済みでないか（伝票番号の重複・請求更新の実行済み） ---
  const chunk = <T>(arr: T[], n: number) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
  const dupCheck = async (label: string, nos: string[], find: (nos: string[]) => Promise<{ voucher_no: string }[]>) => {
    const found: string[] = [];
    for (const part of chunk(nos, 1000)) found.push(...(await find(part)).map((v) => v.voucher_no));
    if (found.length > 0) {
      problems.error(`${label}の伝票番号 ${found.slice(0, 10).join("、")}${found.length > 10 ? ` ほか${found.length - 10}件` : ""} は既に登録されています（取り込み済みの可能性があります）。`);
    }
  };
  await dupCheck("売上伝票", sales.map((v) => v.voucher_no), (nos) =>
    prisma.sales_vouchers.findMany({ where: { voucher_no: { in: nos } }, select: { voucher_no: true } }),
  );
  await dupCheck("仕入伝票", purchases.map((v) => v.voucher_no), (nos) =>
    prisma.purchase_vouchers.findMany({ where: { voucher_no: { in: nos } }, select: { voucher_no: true } }),
  );
  await dupCheck("入金伝票", receipts.map((v) => v.voucher_no), (nos) =>
    prisma.receipt_vouchers.findMany({ where: { voucher_no: { in: nos } }, select: { voucher_no: true } }),
  );
  const activeClosings = await prisma.billing_closings.count({ where: { is_reversed: false } });
  if (activeClosings > 0) {
    problems.error(
      `請求更新が既に${activeClosings}件実行されています。過去の請求更新を再現するため、取り消し済みでない請求更新が無い状態で取り込んでください（請求更新の画面から、新しいものから順に取り消せます）。`,
    );
  }
  problems.finish();

  const closingKeys = new Set(billing.map((b) => `${b.closing_day}|${b.period_to}`));
  return {
    preview: {
      errors: problems.errors,
      warnings: problems.warnings,
      counts: {
        salesVouchers: sales.length,
        salesLines: sales.reduce((a, v) => a + v.lines.length, 0),
        salesBilled: sales.filter((v) => v.closed).length,
        purchaseVouchers: purchases.length,
        purchaseLines: purchases.reduce((a, v) => a + v.lines.length, 0),
        purchaseSettled: purchases.filter((v) => v.closed).length,
        receiptVouchers: receipts.length,
        receiptLines: receipts.reduce((a, r) => a + r.lines.length, 0),
        billingClosings: closingKeys.size,
        billingRecords: billing.length,
      },
      newCustomers: [...newCustomers.values()].map(({ code, name }) => ({ code, name })).sort((a, b) => (a.code < b.code ? -1 : 1)),
      newSuppliers: [...newSuppliers.values()].map(({ code, name }) => ({ code, name })).sort((a, b) => (a.code < b.code ? -1 : 1)),
      newProductCount: newProducts.size,
      newProductSamples: [...newProducts.values()].slice(0, 20).map(({ code, name }) => ({ code, name })),
      blankedStaffCodes: [...blankedStaff.entries()].map(([code, rows]) => ({ code, rows })),
      balances,
    },
    sales,
    purchases,
    receipts,
    billing,
    newCustomers: [...newCustomers.values()].map(({ code, name }) => ({ code, name })),
    newSuppliers: [...newSuppliers.values()].map(({ code, name }) => ({ code, name })),
    newProducts: [...newProducts.values()].map(({ code, name, spec, active }) => ({ code, name, spec, active })),
  };
}

// ---------------------------------------------------------------------------
// 取り込みの実行（1つのトランザクションで行い、途中で失敗したら何も登録しない）
// ---------------------------------------------------------------------------
export async function executeMigration(files: MigrationFiles, userId: string | null): Promise<MigrationPreview> {
  const plan = await planMigration(files);
  if (plan.preview.errors.length > 0) return plan.preview;

  const chunk = <T>(arr: T[], n: number) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

  await prisma.$transaction(
    async (tx) => {
      await acquireClosingLock(tx, "billing_closing");

      // 1. 旧マスタ（無効状態）の自動登録
      if (plan.newCustomers.length > 0) {
        await tx.customers.createMany({ data: plan.newCustomers.map((c) => ({ code: c.code, name1: c.name, is_active: false })) });
      }
      if (plan.newSuppliers.length > 0) {
        await tx.suppliers.createMany({ data: plan.newSuppliers.map((s) => ({ code: s.code, name1: s.name, is_active: false })) });
      }
      for (const part of chunk(plan.newProducts, 1000)) {
        await tx.products.createMany({
          data: part.map((p) => ({ code: p.code, name: p.name, spec: p.spec, is_active: p.active })),
        });
      }

      // 2. 売上伝票
      for (const part of chunk(plan.sales, 500)) {
        const created = await tx.sales_vouchers.createManyAndReturn({
          data: part.map((v) => ({
            voucher_no: v.voucher_no,
            customer_code: v.partner_code,
            voucher_date: toDate(v.voucher_date),
            tax_rate: v.tax_rate,
            staff_code: v.staff_code,
            remarks: v.remarks,
            sales_amount: v.subtotal,
            cost_amount: 0,
            tax_amount: v.tax,
            gross_profit: v.subtotal,
            is_billed: v.closed,
            created_by: userId,
          })),
          select: { id: true, voucher_no: true },
        });
        const idOf = new Map(created.map((c) => [c.voucher_no, c.id]));
        await tx.sales_voucher_lines.createMany({
          data: part.flatMap((v) =>
            v.lines.map((l, i) => ({
              voucher_id: idOf.get(v.voucher_no)!,
              line_no: i + 1,
              category: l.category,
              product_code: l.product_code,
              product_name: l.product_name,
              spec: l.spec,
              unit: l.unit,
              quantity: l.quantity,
              sale_price: l.price,
              sale_amount: l.amount,
              cost_amount: 0,
              gross_profit: l.amount,
              tax_amount: v.line_taxes[i],
              note: l.note,
            })),
          ),
        });
      }

      // 3. 仕入伝票
      for (const part of chunk(plan.purchases, 500)) {
        const created = await tx.purchase_vouchers.createManyAndReturn({
          data: part.map((v) => ({
            voucher_no: v.voucher_no,
            supplier_code: v.partner_code,
            voucher_date: toDate(v.voucher_date),
            tax_rate: v.tax_rate,
            staff_code: v.staff_code,
            remarks: v.remarks,
            subtotal_amount: v.subtotal,
            tax_amount: v.tax,
            total_amount: v.subtotal + v.tax,
            is_settled: v.closed,
            created_by: userId,
          })),
          select: { id: true, voucher_no: true },
        });
        const idOf = new Map(created.map((c) => [c.voucher_no, c.id]));
        await tx.purchase_voucher_lines.createMany({
          data: part.flatMap((v) =>
            v.lines.map((l, i) => ({
              voucher_id: idOf.get(v.voucher_no)!,
              line_no: i + 1,
              category: l.category,
              product_code: l.product_code,
              product_name: l.product_name,
              spec: l.spec,
              unit: l.unit,
              quantity: l.quantity,
              cost_price: l.price,
              cost_amount: l.amount,
              note: l.note,
            })),
          ),
        });
      }

      // 4. 入金伝票
      for (const part of chunk(plan.receipts, 500)) {
        const created = await tx.receipt_vouchers.createManyAndReturn({
          data: part.map((r) => ({
            voucher_no: r.voucher_no,
            customer_code: r.customer_code,
            voucher_date: toDate(r.voucher_date),
            subtotal_amount: r.amount,
            created_by: userId,
          })),
          select: { id: true, voucher_no: true },
        });
        const idOf = new Map(created.map((c) => [c.voucher_no, c.id]));
        await tx.receipt_voucher_lines.createMany({
          data: part.flatMap((r) =>
            r.lines.map((l, i) => ({
              voucher_id: idOf.get(r.voucher_no)!,
              line_no: i + 1,
              category: l.category,
              amount: l.amount,
              note: l.note,
              bill_due_date: l.bill_due_date ? toDate(l.bill_due_date) : null,
            })),
          ),
        });
      }

      // 5. 請求更新の再現（締日・基準日ごとに1回分の請求更新として登録する）
      const closingIds = new Map<string, bigint>();
      const keys = [...new Set(plan.billing.map((b) => `${b.closing_day}|${b.period_to}`))].sort((a, b) =>
        a.split("|")[1] < b.split("|")[1] ? -1 : 1,
      );
      for (const key of keys) {
        const [closingDay, asOf] = key.split("|");
        const closing = await tx.billing_closings.create({
          data: { closing_day: Number(closingDay), as_of_date: toDate(asOf), executed_by: userId },
        });
        closingIds.set(key, closing.id);
      }
      for (const part of chunk(plan.billing, 1000)) {
        await tx.billing_records.createMany({
          data: part.map((b) => ({
            closing_id: closingIds.get(`${b.closing_day}|${b.period_to}`)!,
            customer_code: b.customer_code,
            period_from: b.period_from ? toDate(b.period_from) : null,
            period_to: toDate(b.period_to),
            previous_balance: b.previous_balance,
            sales_amount: b.sales_amount,
            tax_amount: b.tax_amount,
            receipt_amount: b.receipt_amount,
            billed_amount: b.billed_amount,
          })),
        });
      }

      // 6. 伝票番号の採番カウンタを、取り込んだ番号の続きから採番されるようにする
      const maxNo = (nos: string[]) => nos.reduce((m, n) => (/^\d+$/.test(n) && BigInt(n) > m ? BigInt(n) : m), BigInt(0));
      for (const [type, nos] of [
        ["sales", plan.sales.map((v) => v.voucher_no)],
        ["purchase", plan.purchases.map((v) => v.voucher_no)],
        ["receipt", plan.receipts.map((v) => v.voucher_no)],
      ] as const) {
        const max = maxNo([...nos]);
        if (max === BigInt(0)) continue;
        const current = await tx.voucher_sequences.findUnique({ where: { voucher_type: type } });
        if (!current) await tx.voucher_sequences.create({ data: { voucher_type: type, last_number: max } });
        else if (current.last_number < max) {
          await tx.voucher_sequences.update({ where: { voucher_type: type }, data: { last_number: max } });
        }
      }
    },
    { timeout: 10 * 60 * 1000, maxWait: 30 * 1000 },
  );

  return plan.preview;
}
