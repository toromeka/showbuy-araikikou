import { prisma } from "@/lib/prisma";
import { parseCsv } from "@/lib/csv";
import { HANDWRITE_PRODUCT_CODE } from "@/lib/product-codes";
import { acquireClosingLock } from "@/lib/closing-lock";
import {
  Problems,
  advanceVoucherSequence,
  groupVoucherRows,
  insertPurchaseVouchers,
  insertSalesVouchers,
  padNumeric,
  purchaseVoucherPlan,
  registerOldMasters,
  salesVoucherPlan,
  taxRateLookup,
  trimOrNull,
  type Row,
  type VoucherGroup,
  type VoucherPlan,
} from "@/lib/migration/voucher-migration";

// ---------------------------------------------------------------------------
// 日計伝票のCSV取り込み。
// 旧システムと並行して使う間、旧システムで入力した売上・仕入の伝票を、何度でも追加で取り込めるようにする。
// CSVはデータ移行と同じ明細単位の形式（伝票日付,伝票番号,区分,得意先/仕入先コード,得意先/仕入先名,商品コード,
// 商品名,規格,数量,単位,単価,金額,備考,担当者コード,担当者名,摘要名）で、売上と仕入が混ざっていてよい。
//
// - 区分「売上」の行は売上伝票、「仕入」の行は仕入伝票。「摘要」（メモ行）・「売値」（値引き行）などは、
//   同じ伝票番号の売上・仕入の行と同じ伝票に入れる。メモ行だけの伝票は、コードが仕入先マスタにだけあれば仕入、
//   得意先マスタにだけあれば売上、どちらとも決められなければ、同じファイルの中で伝票番号が近い方に入れる
// - 同じ伝票番号が既に登録されていれば取り込まない（内容が同じなら「取り込み済み」、違えば一覧に表示する）
// - 取り込んだ売上は未請求、仕入は未払として登録し、次回の請求更新・仕入支払更新の対象になる
//   （締め済みの期間の伝票は、次回の請求・支払に含まれる旨を表示する）
// - マスタに無い得意先・仕入先・商品は、データ移行と同じく旧マスタ（無効）として自動で登録する
// ---------------------------------------------------------------------------

export type ImportedSide = {
  toImport: number;
  lines: number;
  alreadyImported: number;
  conflicts: { voucher_no: string; reason: string }[];
  // 締め済みの期間（最後の請求更新・支払更新の締め日以前）の日付の伝票
  closedPeriod: { voucher_no: string; date: string; partner: string }[];
  dateFrom: string | null;
  dateTo: string | null;
};

export type DailyImportPreview = {
  errors: string[];
  warnings: string[];
  sales: ImportedSide;
  purchases: ImportedSide;
  newCustomers: { code: string; name: string }[];
  newSuppliers: { code: string; name: string }[];
  newProductCount: number;
  newProductSamples: { code: string; name: string }[];
};

type Plan = {
  preview: DailyImportPreview;
  sales: VoucherPlan[];
  purchases: VoucherPlan[];
  newCustomers: { code: string; name: string }[];
  newSuppliers: { code: string; name: string }[];
  newProducts: { code: string; name: string; spec: string | null; active: boolean }[];
};

const SALES_KINDS = new Set(["売上", "売値"]);

// 売上と仕入が混ざったCSVの行を、伝票番号ごとに売上・仕入に振り分ける
function splitRows(
  rows: Row[],
  customerCodes: Set<string>,
  supplierCodes: Set<string>,
  problems: Problems,
): { sales: { rows: Row[]; rowNos: number[] }; purchases: { rows: Row[]; rowNos: number[] } } {
  const byVoucher = new Map<string, { row: Row; rowNo: number }[]>();
  for (const [i, r] of rows.entries()) {
    const no = trimOrNull(r["伝票番号"]);
    const key = no ? padNumeric(no, 6) : `__${i}`; // 番号が空の行は、groupVoucherRows でエラーとして表示される
    if (!byVoucher.has(key)) byVoucher.set(key, []);
    byVoucher.get(key)!.push({ row: r, rowNo: i + 2 });
  }

  const sales = { rows: [] as Row[], rowNos: [] as number[] };
  const purchases = { rows: [] as Row[], rowNos: [] as number[] };
  const add = (side: typeof sales, e: { row: Row; rowNo: number }) => {
    side.rows.push(e.row);
    side.rowNos.push(e.rowNo);
  };
  const salesNos: number[] = [];
  const purchaseNos: number[] = [];
  const undecided: [string, { row: Row; rowNo: number }[]][] = [];

  for (const [no, entries] of byVoucher) {
    const kinds = entries.map((e) => trimOrNull(e.row["区分"]) ?? "");
    const hasSales = kinds.some((k) => SALES_KINDS.has(k));
    const hasPurchase = kinds.includes("仕入");
    if (hasSales && hasPurchase) {
      // 1枚の伝票に売上と仕入の行がある場合は、それぞれの伝票に分ける（メモ行などは、コードが同じ側に入れる）
      const salesCode = entries.find((e) => SALES_KINDS.has(trimOrNull(e.row["区分"]) ?? ""))!.row["得意先/仕入先コード"];
      for (const e of entries) {
        const k = trimOrNull(e.row["区分"]) ?? "";
        if (k === "仕入" || (!SALES_KINDS.has(k) && e.row["得意先/仕入先コード"] !== salesCode)) add(purchases, e);
        else add(sales, e);
      }
      salesNos.push(Number(no));
      purchaseNos.push(Number(no));
    } else if (hasSales) {
      entries.forEach((e) => add(sales, e));
      salesNos.push(Number(no));
    } else if (hasPurchase) {
      entries.forEach((e) => add(purchases, e));
      purchaseNos.push(Number(no));
    } else {
      undecided.push([no, entries]);
    }
  }

  // メモ行だけの伝票（どちらの伝票か区分からは分からない）
  const nearest = (nos: number[], n: number) => nos.reduce((m, x) => Math.min(m, Math.abs(x - n)), Infinity);
  for (const [no, entries] of undecided) {
    const code = padNumeric(trimOrNull(entries[0].row["得意先/仕入先コード"]) ?? "", 4);
    const isCustomer = customerCodes.has(code);
    const isSupplier = supplierCodes.has(code);
    let side: "sales" | "purchases" | null = null;
    if (isSupplier && !isCustomer) side = "purchases";
    else if (isCustomer && !isSupplier) side = "sales";
    else if (/^\d+$/.test(no) && (salesNos.length > 0 || purchaseNos.length > 0)) {
      side = nearest(salesNos, Number(no)) <= nearest(purchaseNos, Number(no)) ? "sales" : "purchases";
    }
    if (!side) {
      problems.error(`伝票${no}（${entries[0].rowNo}行目）はメモ行だけで、売上・仕入のどちらの伝票か判断できません。`);
      continue;
    }
    entries.forEach((e) => add(side === "sales" ? sales : purchases, e));
  }
  return { sales, purchases };
}

export async function planDailyImport(csv: string): Promise<Plan> {
  const problems = new Problems();
  const rows = parseCsv(csv);
  if (rows.length === 0) problems.error("CSVにデータ行がありませんでした。");

  const [customers, suppliers, productRows, staffRows, taxRates] = await Promise.all([
    prisma.customers.findMany({ select: { code: true, rounding_method: true, billing_customer_code: true } }),
    prisma.suppliers.findMany({ select: { code: true, rounding_method: true } }),
    prisma.products.findMany({ select: { code: true } }),
    prisma.staff.findMany({ select: { code: true } }),
    prisma.tax_rate_history.findMany(),
  ]);
  const customerMap = new Map(customers.map((c) => [c.code, c]));
  const supplierMap = new Map(suppliers.map((s) => [s.code, s]));
  const productCodes = new Set(productRows.map((p) => p.code));
  const staffCodes = new Set(staffRows.map((s) => s.code));
  const taxRateOn = taxRateLookup(taxRates);

  const split = splitRows(rows, new Set(customerMap.keys()), new Set(supplierMap.keys()), problems);
  const salesGroups = groupVoucherRows("売上", split.sales.rows, problems, split.sales.rowNos);
  const purchaseGroups = groupVoucherRows("仕入", split.purchases.rows, problems, split.purchases.rowNos);

  // --- 既に登録されている伝票番号（取り込み済み・内容が違うもの）を除く ---
  const existingSales = await prisma.sales_vouchers.findMany({
    where: { voucher_no: { in: salesGroups.map((g) => g.voucher_no) } },
    select: { voucher_no: true, voucher_date: true, customer_code: true, sales_amount: true, _count: { select: { sales_voucher_lines: true } } },
  });
  const existingPurchases = await prisma.purchase_vouchers.findMany({
    where: { voucher_no: { in: purchaseGroups.map((g) => g.voucher_no) } },
    select: { voucher_no: true, voucher_date: true, supplier_code: true, subtotal_amount: true, _count: { select: { purchase_voucher_lines: true } } },
  });
  type Existing = { date: string; partner: string; amount: number; lines: number };
  const exSales = new Map<string, Existing>(
    existingSales.map((v) => [
      v.voucher_no,
      { date: v.voucher_date.toISOString().slice(0, 10), partner: v.customer_code, amount: Number(v.sales_amount), lines: v._count.sales_voucher_lines },
    ]),
  );
  const exPurchases = new Map<string, Existing>(
    existingPurchases.map((v) => [
      v.voucher_no,
      { date: v.voucher_date.toISOString().slice(0, 10), partner: v.supplier_code, amount: Number(v.subtotal_amount), lines: v._count.purchase_voucher_lines },
    ]),
  );
  const sift = (groups: VoucherGroup[], existing: Map<string, Existing>, partnerLabel: string) => {
    const fresh: VoucherGroup[] = [];
    let already = 0;
    const conflicts: { voucher_no: string; reason: string }[] = [];
    for (const g of groups) {
      const ex = existing.get(g.voucher_no);
      if (!ex) {
        fresh.push(g);
        continue;
      }
      const amount = g.lines.reduce((a, l) => a + l.amount, 0);
      const diffs: string[] = [];
      if (ex.date !== g.date) diffs.push(`日付（登録済み ${ex.date} / CSV ${g.date}）`);
      if (ex.partner !== g.partner_code) diffs.push(`${partnerLabel}（登録済み ${ex.partner} / CSV ${g.partner_code}）`);
      if (ex.amount !== amount) diffs.push(`金額（登録済み ${ex.amount.toLocaleString()} / CSV ${amount.toLocaleString()}）`);
      if (ex.lines !== g.lines.length) diffs.push(`明細の行数（登録済み ${ex.lines} / CSV ${g.lines.length}）`);
      if (diffs.length === 0) already++;
      else conflicts.push({ voucher_no: g.voucher_no, reason: diffs.join("、") });
    }
    return { fresh, already, conflicts };
  };
  const salesSift = sift(salesGroups, exSales, "得意先");
  const purchaseSift = sift(purchaseGroups, exPurchases, "仕入先");

  // --- マスタに無いコード（旧マスタとして無効状態で自動登録する） ---
  const newCustomers = new Map<string, { code: string; name: string; latest: string }>();
  const newSuppliers = new Map<string, { code: string; name: string; latest: string }>();
  const newProducts = new Map<string, { code: string; name: string; spec: string | null; active: boolean; latest: string }>();
  const blankedStaff = new Set<string>();
  const noteNew = (target: typeof newCustomers, code: string, name: string, date: string) => {
    const cur = target.get(code);
    if (!cur || (date >= cur.latest && name)) target.set(code, { code, name: name || cur?.name || "", latest: date });
  };
  for (const g of salesSift.fresh) if (!customerMap.has(g.partner_code)) noteNew(newCustomers, g.partner_code, g.partner_name, g.date);
  for (const g of purchaseSift.fresh) if (!supplierMap.has(g.partner_code)) noteNew(newSuppliers, g.partner_code, g.partner_name, g.date);
  for (const g of [...salesSift.fresh, ...purchaseSift.fresh]) {
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
    if (g.staff && !staffCodes.has(g.staff)) blankedStaff.add(g.staff);
  }
  for (const c of newCustomers.values()) if (!c.name) c.name = `旧得意先${c.code}`;
  for (const s of newSuppliers.values()) if (!s.name) s.name = `旧仕入先${s.code}`;

  // --- 伝票（消費税の計算は画面から入力したときと同じ。売上は未請求、仕入は未払で登録する） ---
  const sales = salesSift.fresh.map((g) =>
    salesVoucherPlan(g, customerMap.get(g.partner_code)?.rounding_method ?? 0, taxRateOn(g.date), staffCodes),
  );
  const purchases = purchaseSift.fresh.map((g) =>
    purchaseVoucherPlan(g, supplierMap.get(g.partner_code)?.rounding_method ?? 0, taxRateOn(g.date), staffCodes, false),
  );

  // --- 締め済みの期間の伝票（次回の請求更新・仕入支払更新に含まれる） ---
  const rootOf = (code: string) => customerMap.get(code)?.billing_customer_code ?? code;
  const lastBilled = new Map(
    (
      await prisma.billing_records.groupBy({
        by: ["customer_code"],
        where: { billing_closings: { is_reversed: false } },
        _max: { period_to: true },
      })
    ).map((r) => [r.customer_code, r._max.period_to?.toISOString().slice(0, 10) ?? ""]),
  );
  const lastPaid = new Map(
    (
      await prisma.payment_records.groupBy({
        by: ["supplier_code"],
        where: { payment_closings: { is_reversed: false } },
        _max: { period_to: true },
      })
    ).map((r) => [r.supplier_code, r._max.period_to?.toISOString().slice(0, 10) ?? ""]),
  );
  const closedSales = sales
    .filter((v) => (lastBilled.get(rootOf(v.partner_code)) ?? "") >= v.voucher_date)
    .map((v) => ({ voucher_no: v.voucher_no, date: v.voucher_date, partner: v.partner_code }));
  const closedPurchases = purchases
    .filter((v) => (lastPaid.get(v.partner_code) ?? "") >= v.voucher_date)
    .map((v) => ({ voucher_no: v.voucher_no, date: v.voucher_date, partner: v.partner_code }));

  if (blankedStaff.size > 0) {
    problems.warnings.push(`担当者マスタに無い担当者コード（${[...blankedStaff].join("、")}）は、伝票の担当者を空欄にして取り込みます。`);
  }
  problems.finish();

  const side = (plans: VoucherPlan[], s: ReturnType<typeof sift>, closedPeriod: ImportedSide["closedPeriod"]): ImportedSide => {
    const dates = plans.map((v) => v.voucher_date).sort();
    return {
      toImport: plans.length,
      lines: plans.reduce((a, v) => a + v.lines.length, 0),
      alreadyImported: s.already,
      conflicts: s.conflicts,
      closedPeriod,
      dateFrom: dates[0] ?? null,
      dateTo: dates[dates.length - 1] ?? null,
    };
  };
  const byCode = (a: { code: string }, b: { code: string }) => (a.code < b.code ? -1 : 1);
  return {
    preview: {
      errors: problems.errors,
      warnings: problems.warnings,
      sales: side(sales, salesSift, closedSales),
      purchases: side(purchases, purchaseSift, closedPurchases),
      newCustomers: [...newCustomers.values()].map(({ code, name }) => ({ code, name })).sort(byCode),
      newSuppliers: [...newSuppliers.values()].map(({ code, name }) => ({ code, name })).sort(byCode),
      newProductCount: newProducts.size,
      newProductSamples: [...newProducts.values()].slice(0, 20).map(({ code, name }) => ({ code, name })),
    },
    sales,
    purchases,
    newCustomers: [...newCustomers.values()].map(({ code, name }) => ({ code, name })),
    newSuppliers: [...newSuppliers.values()].map(({ code, name }) => ({ code, name })),
    newProducts: [...newProducts.values()].map(({ code, name, spec, active }) => ({ code, name, spec, active })),
  };
}

// 取り込みの実行（1つのトランザクションで行い、途中で失敗したら何も登録しない）
export async function executeDailyImport(csv: string, userId: string | null): Promise<DailyImportPreview> {
  const plan = await planDailyImport(csv);
  if (plan.preview.errors.length > 0) return plan.preview;
  if (plan.sales.length === 0 && plan.purchases.length === 0) return plan.preview;

  await prisma.$transaction(
    async (tx) => {
      // 請求更新・仕入支払更新と同時に動かないようにする（未請求・未払の伝票が途中で増えないように）
      await acquireClosingLock(tx, "billing_closing");
      await acquireClosingLock(tx, "payment_closing");
      await registerOldMasters(tx, plan.newCustomers, plan.newSuppliers, plan.newProducts);
      await insertSalesVouchers(tx, plan.sales, userId);
      await insertPurchaseVouchers(tx, plan.purchases, userId);
      await advanceVoucherSequence(tx, "sales", plan.sales.map((v) => v.voucher_no));
      await advanceVoucherSequence(tx, "purchase", plan.purchases.map((v) => v.voucher_no));
    },
    { timeout: 5 * 60 * 1000, maxWait: 30 * 1000 },
  );
  return plan.preview;
}
