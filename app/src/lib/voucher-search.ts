import { prisma } from "@/lib/prisma";
import { kanaVariants } from "@/lib/kana";

// 伝票検索（売上・仕入・入金・支払伝票と見積書をまとめて探す）。
// 得意先・仕入先はコード（数字だけなら4桁にそろえる）の一致か名前の一部、商品名・規格は明細の一部一致で探す。
// 商品名・規格は、全角カナ・ひらがな・半角カナのどれで入力しても見つかる（src/lib/kana.ts）。

export const SEARCH_TYPES = {
  sales: { label: "売上伝票", hasLines: true },
  purchase: { label: "仕入伝票", hasLines: true },
  receipt: { label: "入金伝票", hasLines: false },
  payment: { label: "支払伝票", hasLines: false },
  quotation: { label: "見積書", hasLines: true },
} as const;
export type SearchType = keyof typeof SEARCH_TYPES;

export type VoucherSearchParams = {
  types: SearchType[];
  partner: string;
  product: string;
  spec: string;
  voucherNo: string;
  from: string;
  to: string;
};

export type SearchLine = {
  lineNo: number;
  productCode: string | null;
  productName: string;
  spec: string | null;
  quantity: number | null;
  unit: string | null;
  price: number | null;
  amount: number | null;
  note: string | null;
  // 商品名・規格の条件に当てはまった明細か（明細ごとの表示では、当てはまった明細だけを出す）
  matched: boolean;
};

export type SearchRow = {
  type: SearchType;
  id: string;
  voucherNo: string;
  date: string;
  partnerCode: string;
  partnerName: string;
  amount: number;
  href: string;
  lines: SearchLine[];
};

export type SearchResult = { rows: SearchRow[]; truncated: SearchType[]; skippedForProduct: SearchType[] };

// 種類ごとの最大件数（画面が重くならないように。超えた場合は期間などで絞るよう表示する）
export const MAX_PER_TYPE = 500;

export function parseSearchParams(sp: Record<string, string | string[] | undefined>): VoucherSearchParams {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : (sp[k] as string | undefined)) ?? "";
  const rawTypes = sp.type === undefined ? [] : Array.isArray(sp.type) ? sp.type : [sp.type];
  const types = rawTypes.filter((t): t is SearchType => t in SEARCH_TYPES);
  return {
    types,
    partner: one("partner").trim(),
    product: one("product").trim(),
    spec: one("spec").trim(),
    voucherNo: one("no").trim(),
    from: /^\d{4}-\d{2}-\d{2}$/.test(one("from")) ? one("from") : "",
    to: /^\d{4}-\d{2}-\d{2}$/.test(one("to")) ? one("to") : "",
  };
}

export function hasAnyCondition(p: VoucherSearchParams): boolean {
  return !!(p.partner || p.product || p.spec || p.voucherNo || p.from || p.to);
}

const num = (v: { toString(): string } | null | undefined) => (v === null || v === undefined ? null : Number(v));
const iso = (d: Date) => d.toISOString().slice(0, 10);

function containsAny(field: string, text: string) {
  const variants = kanaVariants(text);
  return variants.length ? { OR: variants.map((v) => ({ [field]: { contains: v, mode: "insensitive" as const } })) } : {};
}

function lineMatches(line: { product_name: string | null; spec: string | null }, p: VoucherSearchParams): boolean {
  const has = (value: string | null, text: string) => {
    if (!text) return true;
    const v = (value ?? "").toLowerCase();
    return kanaVariants(text).some((t) => v.includes(t.toLowerCase()));
  };
  return has(line.product_name, p.product) && has(line.spec, p.spec);
}

export async function searchVouchers(p: VoucherSearchParams): Promise<SearchResult> {
  const types = p.types.length ? p.types : (Object.keys(SEARCH_TYPES) as SearchType[]);
  const lineFilter = !!(p.product || p.spec);
  const partnerCode = /^\d+$/.test(p.partner) && p.partner.length < 4 ? p.partner.padStart(4, "0") : p.partner;
  const dateRange = (field: string) =>
    p.from || p.to ? { [field]: { ...(p.from ? { gte: new Date(`${p.from}T00:00:00Z`) } : {}), ...(p.to ? { lte: new Date(`${p.to}T00:00:00Z`) } : {}) } } : {};
  const partnerWhere = (codeField: string, relation: "customers" | "suppliers", nameField: string) =>
    p.partner ? { OR: [{ [codeField]: partnerCode }, { [relation]: containsAny(nameField, p.partner) }] } : {};
  const noWhere = p.voucherNo ? { voucher_no: { contains: p.voucherNo } } : {};
  const lineWhere = { AND: [p.product ? containsAny("product_name", p.product) : {}, p.spec ? containsAny("spec", p.spec) : {}] };

  const rows: SearchRow[] = [];
  const truncated: SearchType[] = [];
  const skippedForProduct: SearchType[] = [];
  const take = MAX_PER_TYPE + 1;
  const push = (type: SearchType, items: SearchRow[]) => {
    if (items.length > MAX_PER_TYPE) truncated.push(type);
    rows.push(...items.slice(0, MAX_PER_TYPE));
  };

  if (types.includes("sales")) {
    const list = await prisma.sales_vouchers.findMany({
      where: {
        ...dateRange("voucher_date"),
        ...noWhere,
        ...partnerWhere("customer_code", "customers", "name1"),
        ...(lineFilter ? { sales_voucher_lines: { some: lineWhere } } : {}),
      },
      include: { customers: { select: { name1: true } }, sales_voucher_lines: { orderBy: { line_no: "asc" } } },
      orderBy: [{ voucher_date: "desc" }, { voucher_no: "desc" }],
      take,
    });
    push(
      "sales",
      list.map((v) => ({
        type: "sales",
        id: v.id.toString(),
        voucherNo: v.voucher_no,
        date: iso(v.voucher_date),
        partnerCode: v.customer_code,
        partnerName: v.customers.name1,
        amount: Number(v.sales_amount),
        href: `/sales-vouchers/${v.id}`,
        lines: v.sales_voucher_lines.map((l) => ({
          lineNo: l.line_no,
          productCode: l.product_code,
          productName: l.product_name,
          spec: l.spec,
          quantity: num(l.quantity),
          unit: l.unit,
          price: num(l.sale_price),
          amount: num(l.sale_amount),
          note: [l.note, l.note2].filter(Boolean).join(" ") || null,
          matched: lineMatches(l, p),
        })),
      })),
    );
  }

  if (types.includes("purchase")) {
    const list = await prisma.purchase_vouchers.findMany({
      where: {
        ...dateRange("voucher_date"),
        ...noWhere,
        ...partnerWhere("supplier_code", "suppliers", "name1"),
        ...(lineFilter ? { purchase_voucher_lines: { some: lineWhere } } : {}),
      },
      include: { suppliers: { select: { name1: true } }, purchase_voucher_lines: { orderBy: { line_no: "asc" } } },
      orderBy: [{ voucher_date: "desc" }, { voucher_no: "desc" }],
      take,
    });
    push(
      "purchase",
      list.map((v) => ({
        type: "purchase",
        id: v.id.toString(),
        voucherNo: v.voucher_no,
        date: iso(v.voucher_date),
        partnerCode: v.supplier_code,
        partnerName: v.suppliers.name1,
        amount: Number(v.subtotal_amount),
        href: `/purchase-vouchers/${v.id}`,
        lines: v.purchase_voucher_lines.map((l) => ({
          lineNo: l.line_no,
          productCode: l.product_code,
          productName: l.product_name,
          spec: l.spec,
          quantity: num(l.quantity),
          unit: l.unit,
          price: num(l.cost_price),
          amount: num(l.cost_amount),
          note: l.note,
          matched: lineMatches(l, p),
        })),
      })),
    );
  }

  if (types.includes("quotation")) {
    const list = await prisma.quotations.findMany({
      where: {
        ...dateRange("quotation_date"),
        ...noWhere,
        ...partnerWhere("customer_code", "customers", "name1"),
        ...(lineFilter ? { quotation_lines: { some: lineWhere } } : {}),
      },
      include: { customers: { select: { name1: true } }, quotation_lines: { orderBy: { line_no: "asc" } } },
      orderBy: [{ quotation_date: "desc" }, { voucher_no: "desc" }],
      take,
    });
    push(
      "quotation",
      list.map((v) => ({
        type: "quotation",
        id: v.id.toString(),
        voucherNo: v.voucher_no,
        date: iso(v.quotation_date),
        partnerCode: v.customer_code,
        partnerName: v.customers.name1,
        amount: Number(v.quote_amount),
        href: `/quotations/${v.id}`,
        lines: v.quotation_lines.map((l) => ({
          lineNo: l.line_no,
          productCode: l.product_code,
          productName: l.product_name ?? "",
          spec: l.spec,
          quantity: num(l.quantity),
          unit: l.unit,
          price: num(l.quote_price),
          amount: num(l.quote_amount),
          note: null,
          matched: lineMatches(l, p),
        })),
      })),
    );
  }

  // 入金・支払伝票には商品の明細が無いため、商品名・規格で探すときは対象外にする
  for (const type of ["receipt", "payment"] as const) {
    if (!types.includes(type)) continue;
    if (lineFilter) {
      skippedForProduct.push(type);
      continue;
    }
    if (type === "receipt") {
      const list = await prisma.receipt_vouchers.findMany({
        where: { ...dateRange("voucher_date"), ...noWhere, ...partnerWhere("customer_code", "customers", "name1") },
        include: { customers: { select: { name1: true } }, receipt_voucher_lines: { orderBy: { line_no: "asc" } } },
        orderBy: [{ voucher_date: "desc" }, { voucher_no: "desc" }],
        take,
      });
      push(
        "receipt",
        list.map((v) => ({
          type: "receipt",
          id: v.id.toString(),
          voucherNo: v.voucher_no,
          date: iso(v.voucher_date),
          partnerCode: v.customer_code,
          partnerName: v.customers.name1,
          amount: Number(v.subtotal_amount),
          href: `/receipt-vouchers/${v.id}`,
          lines: v.receipt_voucher_lines.map((l) => ({
            lineNo: l.line_no,
            productCode: null,
            productName: l.category ?? "",
            spec: null,
            quantity: null,
            unit: null,
            price: null,
            amount: num(l.amount),
            note: l.note,
            matched: true,
          })),
        })),
      );
    } else {
      const list = await prisma.payment_vouchers.findMany({
        where: { ...dateRange("voucher_date"), ...noWhere, ...partnerWhere("supplier_code", "suppliers", "name1") },
        include: { suppliers: { select: { name1: true } }, payment_voucher_lines: { orderBy: { line_no: "asc" } } },
        orderBy: [{ voucher_date: "desc" }, { voucher_no: "desc" }],
        take,
      });
      push(
        "payment",
        list.map((v) => ({
          type: "payment",
          id: v.id.toString(),
          voucherNo: v.voucher_no,
          date: iso(v.voucher_date),
          partnerCode: v.supplier_code,
          partnerName: v.suppliers.name1,
          amount: Number(v.subtotal_amount),
          href: `/payment-vouchers/${v.id}`,
          lines: v.payment_voucher_lines.map((l) => ({
            lineNo: l.line_no,
            productCode: null,
            productName: l.category ?? "",
            spec: null,
            quantity: null,
            unit: null,
            price: null,
            amount: num(l.amount),
            note: l.note,
            matched: true,
          })),
        })),
      );
    }
  }

  // すべての種類をまとめて、日付の新しい順に並べる
  rows.sort((a, b) => (a.date === b.date ? (a.voucherNo < b.voucherNo ? 1 : -1) : a.date < b.date ? 1 : -1));
  return { rows, truncated, skippedForProduct };
}

// CSV（Excelで開けるよう、BOM付きUTF-8）。明細ごとに1行
export function toCsv(rows: SearchRow[], lineFilter: boolean): string {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ["種類", "伝票番号", "伝票日付", "得意先/仕入先コード", "得意先/仕入先名", "伝票金額", "行", "商品コード", "商品名/区分", "規格", "数量", "単位", "単価", "金額", "備考"];
  const out = [header.join(",")];
  for (const r of rows) {
    const lines = lineFilter ? r.lines.filter((l) => l.matched) : r.lines;
    const base = [SEARCH_TYPES[r.type].label, r.voucherNo, r.date.replace(/-/g, "/"), r.partnerCode, r.partnerName, r.amount];
    if (lines.length === 0) out.push([...base, "", "", "", "", "", "", "", "", ""].map(esc).join(","));
    for (const l of lines) {
      out.push(
        [...base, l.lineNo, l.productCode, l.productName, l.spec, l.quantity, l.unit, l.price, l.amount, l.note].map(esc).join(","),
      );
    }
  }
  return "﻿" + out.join("\r\n") + "\r\n";
}
