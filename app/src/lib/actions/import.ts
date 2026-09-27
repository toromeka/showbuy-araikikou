"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  decodeCsvBuffer,
  parseCsv,
  emptyToNull,
  toIntOrNull,
  toDecimalOrNull,
  ErrorCollector,
  type ImportResult,
} from "@/lib/csv";

async function readCsvFile(formData: FormData): Promise<Record<string, string>[] | null> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return null;
  const buf = Buffer.from(await file.arrayBuffer());
  const text = decodeCsvBuffer(buf);
  return parseCsv(text);
}

// ---------------------------------------------------------------------
// 得意先マスタ
// ---------------------------------------------------------------------
export async function importCustomersCsv(
  _prevState: ImportResult,
  formData: FormData,
): Promise<ImportResult> {
  const rows = await readCsvFile(formData);
  if (!rows) return { message: "CSVファイルを選択してください。" };
  if (rows.length === 0) return { message: "CSVにデータ行がありませんでした。" };

  const [staffCodes, regionCodes, cat1, cat2, cat3] = await Promise.all([
    prisma.staff.findMany({ select: { code: true } }).then((r) => new Set(r.map((x) => x.code))),
    prisma.regions.findMany({ select: { code: true } }).then((r) => new Set(r.map((x) => x.code))),
    prisma.customer_category_1.findMany({ select: { code: true } }).then((r) => new Set(r.map((x) => x.code))),
    prisma.customer_category_2.findMany({ select: { code: true } }).then((r) => new Set(r.map((x) => x.code))),
    prisma.customer_category_3.findMany({ select: { code: true } }).then((r) => new Set(r.map((x) => x.code))),
  ]);

  const errors = new ErrorCollector();
  let created = 0;
  let updated = 0;
  let nulledRefs = 0;
  // 請求先コード（得意先自身への自己参照）は全件登録後の第2パスで設定する
  const billingRefs: { code: string; billingCustomerCode: string }[] = [];

  for (const [i, row] of rows.entries()) {
    const code = emptyToNull(row["得意先コード"]);
    const name1 = emptyToNull(row["得意先名称1"]);
    if (!code) {
      errors.add(`${i + 2}行目: 得意先コードが空のためスキップしました`);
      continue;
    }
    if (!name1) {
      errors.add(`${i + 2}行目(${code}): 得意先名称1が空のためスキップしました`);
      continue;
    }

    let staff_code = emptyToNull(row["担当者コード"]);
    if (staff_code && !staffCodes.has(staff_code)) {
      nulledRefs++;
      staff_code = null;
    }
    let region_code = emptyToNull(row["地区コード"]);
    if (region_code && !regionCodes.has(region_code)) {
      nulledRefs++;
      region_code = null;
    }
    let category1_code = emptyToNull(row["分類区分1"]);
    if (category1_code && !cat1.has(category1_code)) {
      nulledRefs++;
      category1_code = null;
    }
    let category2_code = emptyToNull(row["分類区分2"]);
    if (category2_code && !cat2.has(category2_code)) {
      nulledRefs++;
      category2_code = null;
    }
    let category3_code = emptyToNull(row["分類区分3"]);
    if (category3_code && !cat3.has(category3_code)) {
      nulledRefs++;
      category3_code = null;
    }

    const billingCode = emptyToNull(row["請求先コード"]);
    if (billingCode) billingRefs.push({ code, billingCustomerCode: billingCode });

    const data = {
      name1,
      name2: emptyToNull(row["得意先名称2"]),
      short_name: emptyToNull(row["得意先略称"]),
      kana: emptyToNull(row["フリガナ"]),
      honorific: emptyToNull(row["敬称"]),
      closing_day: toIntOrNull(row["締日"]),
      collection_day: toIntOrNull(row["集金日"]),
      collection_type: emptyToNull(row["集金区分"]),
      collection_note: emptyToNull(row["集金備考"]),
      staff_code,
      postal_code: emptyToNull(row["郵便番号"]),
      region_code,
      address1: emptyToNull(row["住所1"]),
      address2: emptyToNull(row["住所2"]),
      phone: emptyToNull(row["電話番号"]),
      fax: emptyToNull(row["FAX番号"]),
      mobile: emptyToNull(row["携帯番号"]),
      category1_code,
      category2_code,
      category3_code,
      price_rank: toIntOrNull(row["売上単価ランク"]),
      markup_rate: toDecimalOrNull(row["掛率"]),
      note: emptyToNull(row["備考"]),
      tax_method: toIntOrNull(row["課税方式"]) ?? 0,
      calc_method: toIntOrNull(row["計算方式"]) ?? 0,
      rounding_method: toIntOrNull(row["丸め方式"]) ?? 0,
      updated_at: new Date(),
    };

    try {
      const existing = await prisma.customers.findUnique({ where: { code } });
      await prisma.customers.upsert({
        where: { code },
        update: data,
        create: { code, ...data },
      });
      if (existing) updated++;
      else created++;
    } catch (e) {
      errors.add(`${i + 2}行目(${code}): ${e instanceof Error ? e.message : "登録に失敗しました"}`);
    }
  }

  // 第2パス: 請求先コード（存在確認の上で設定。自分自身は無視）
  for (const ref of billingRefs) {
    if (ref.billingCustomerCode === ref.code) continue;
    const target = await prisma.customers.findUnique({ where: { code: ref.billingCustomerCode } });
    if (!target) {
      nulledRefs++;
      continue;
    }
    await prisma.customers.update({
      where: { code: ref.code },
      data: { billing_customer_code: ref.billingCustomerCode },
    });
  }

  revalidatePath("/customers");
  return {
    total: rows.length,
    created,
    updated,
    failed: errors.count,
    nulledRefs,
    errors: errors.errors,
  };
}

// ---------------------------------------------------------------------
// 仕入先マスタ
// ---------------------------------------------------------------------
export async function importSuppliersCsv(
  _prevState: ImportResult,
  formData: FormData,
): Promise<ImportResult> {
  const rows = await readCsvFile(formData);
  if (!rows) return { message: "CSVファイルを選択してください。" };
  if (rows.length === 0) return { message: "CSVにデータ行がありませんでした。" };

  const staffCodes = new Set(
    (await prisma.staff.findMany({ select: { code: true } })).map((x) => x.code),
  );

  const errors = new ErrorCollector();
  let created = 0;
  let updated = 0;
  let nulledRefs = 0;

  for (const [i, row] of rows.entries()) {
    const code = emptyToNull(row["仕入先コード"]);
    const name1 = emptyToNull(row["仕入先名称1"]);
    if (!code) {
      errors.add(`${i + 2}行目: 仕入先コードが空のためスキップしました`);
      continue;
    }
    if (!name1) {
      errors.add(`${i + 2}行目(${code}): 仕入先名称1が空のためスキップしました`);
      continue;
    }

    let staff_code = emptyToNull(row["担当者コード"]);
    if (staff_code && !staffCodes.has(staff_code)) {
      nulledRefs++;
      staff_code = null;
    }

    const data = {
      name1,
      name2: emptyToNull(row["仕入先名称2"]),
      short_name: emptyToNull(row["仕入先略称"]),
      kana: emptyToNull(row["フリガナ"]),
      closing_day: toIntOrNull(row["締日"]),
      payment_day: toIntOrNull(row["支払日"]),
      staff_code,
      postal_code: emptyToNull(row["郵便番号"]),
      address1: emptyToNull(row["住所1"]),
      address2: emptyToNull(row["住所2"]),
      phone: emptyToNull(row["電話番号"]),
      fax: emptyToNull(row["FAX番号"]),
      mobile: emptyToNull(row["携帯番号"]),
      note: emptyToNull(row["備考"]),
      tax_method: toIntOrNull(row["課税方式"]) ?? 0,
      calc_method: toIntOrNull(row["計算方式"]) ?? 0,
      rounding_method: toIntOrNull(row["丸め方式"]) ?? 0,
      updated_at: new Date(),
    };

    try {
      const existing = await prisma.suppliers.findUnique({ where: { code } });
      await prisma.suppliers.upsert({
        where: { code },
        update: data,
        create: { code, ...data },
      });
      if (existing) updated++;
      else created++;
    } catch (e) {
      errors.add(`${i + 2}行目(${code}): ${e instanceof Error ? e.message : "登録に失敗しました"}`);
    }
  }

  revalidatePath("/suppliers");
  return { total: rows.length, created, updated, failed: errors.count, nulledRefs, errors: errors.errors };
}

// ---------------------------------------------------------------------
// 商品マスタ
// ---------------------------------------------------------------------
type ProductRow = {
  line: number;
  code: string;
  name: string;
  spec: string | null;
  kana: string | null;
  unit_code: string | null;
  tax_category: number;
  stock_managed: boolean;
  cost_category: number;
  major_class_code: string | null;
  middle_class_code: string | null;
  minor_class_code: string | null;
  category1_code: string | null;
  category2_code: string | null;
  category3_code: string | null;
  sale_price_1: string | null;
  sale_price_2: string | null;
  sale_price_3: string | null;
  sale_price_4: string | null;
  sale_price_5: string | null;
  standard_cost: string | null;
  last_cost: string | null;
  moving_avg_cost: string | null;
};

const PRODUCT_UPSERT_CHUNK = 1000;

// まとめて登録する前に、DBの列定義（桁数・型）に収まらない行をはじいておく。
// 1行でも収まらない値があるとまとめた1,000行ごと失敗してしまうため。
function validateProductRow(r: ProductRow): string | null {
  if (r.code.length > 15) return "商品コードが15文字を超えている";
  if (r.name.length > 80) return "商品名が80文字を超えている";
  if (r.spec && r.spec.length > 80) return "規格が80文字を超えている";
  if (r.kana && r.kana.length > 80) return "フリガナが80文字を超えている";
  for (const v of [r.tax_category, r.cost_category]) {
    if (v < -32768 || v > 32767) return "消費税区分・原価区分の値が範囲外";
  }
  const prices = [r.sale_price_1, r.sale_price_2, r.sale_price_3, r.sale_price_4, r.sale_price_5, r.standard_cost, r.last_cost];
  if (prices.some((v) => v !== null && Math.abs(Number(v)) >= 1e10)) return "単価の桁数が大きすぎる";
  if (r.moving_avg_cost !== null && Math.abs(Number(r.moving_avg_cost)) >= 1e8) return "移動平均単価の桁数が大きすぎる";
  return null;
}

async function upsertProducts(rows: ProductRow[]): Promise<void> {
  const col = <K extends keyof ProductRow>(k: K) => rows.map((r) => r[k]);
  await prisma.$executeRaw`
    INSERT INTO products (
      code, name, spec, kana, unit_code, tax_category, stock_managed, cost_category,
      major_class_code, middle_class_code, minor_class_code, category1_code, category2_code, category3_code,
      sale_price_1, sale_price_2, sale_price_3, sale_price_4, sale_price_5,
      standard_cost, last_cost, moving_avg_cost, updated_at
    )
    SELECT
      u.code, u.name, u.spec, u.kana, u.unit_code, u.tax_category, u.stock_managed, u.cost_category,
      u.major_class_code, u.middle_class_code, u.minor_class_code, u.category1_code, u.category2_code, u.category3_code,
      u.sale_price_1::numeric, u.sale_price_2::numeric, u.sale_price_3::numeric, u.sale_price_4::numeric, u.sale_price_5::numeric,
      u.standard_cost::numeric, u.last_cost::numeric, u.moving_avg_cost::numeric, now()
    FROM unnest(
      ${col("code")}::text[], ${col("name")}::text[], ${col("spec")}::text[], ${col("kana")}::text[],
      ${col("unit_code")}::text[], ${col("tax_category")}::int2[], ${col("stock_managed")}::bool[],
      ${col("cost_category")}::int2[], ${col("major_class_code")}::text[], ${col("middle_class_code")}::text[],
      ${col("minor_class_code")}::text[], ${col("category1_code")}::text[], ${col("category2_code")}::text[],
      ${col("category3_code")}::text[], ${col("sale_price_1")}::text[], ${col("sale_price_2")}::text[],
      ${col("sale_price_3")}::text[], ${col("sale_price_4")}::text[], ${col("sale_price_5")}::text[],
      ${col("standard_cost")}::text[], ${col("last_cost")}::text[], ${col("moving_avg_cost")}::text[]
    ) AS u(
      code, name, spec, kana, unit_code, tax_category, stock_managed, cost_category,
      major_class_code, middle_class_code, minor_class_code, category1_code, category2_code, category3_code,
      sale_price_1, sale_price_2, sale_price_3, sale_price_4, sale_price_5, standard_cost, last_cost, moving_avg_cost
    )
    ON CONFLICT (code) DO UPDATE SET
      name = EXCLUDED.name, spec = EXCLUDED.spec, kana = EXCLUDED.kana, unit_code = EXCLUDED.unit_code,
      tax_category = EXCLUDED.tax_category, stock_managed = EXCLUDED.stock_managed,
      cost_category = EXCLUDED.cost_category, major_class_code = EXCLUDED.major_class_code,
      middle_class_code = EXCLUDED.middle_class_code, minor_class_code = EXCLUDED.minor_class_code,
      category1_code = EXCLUDED.category1_code, category2_code = EXCLUDED.category2_code,
      category3_code = EXCLUDED.category3_code, sale_price_1 = EXCLUDED.sale_price_1,
      sale_price_2 = EXCLUDED.sale_price_2, sale_price_3 = EXCLUDED.sale_price_3,
      sale_price_4 = EXCLUDED.sale_price_4, sale_price_5 = EXCLUDED.sale_price_5,
      standard_cost = EXCLUDED.standard_cost, last_cost = EXCLUDED.last_cost,
      moving_avg_cost = EXCLUDED.moving_avg_cost, updated_at = EXCLUDED.updated_at
  `;
}

export async function importProductsCsv(
  _prevState: ImportResult,
  formData: FormData,
): Promise<ImportResult> {
  const rows = await readCsvFile(formData);
  if (!rows) return { message: "CSVファイルを選択してください。" };
  if (rows.length === 0) return { message: "CSVにデータ行がありませんでした。" };

  const [units, major, middle, minor, cat1, cat2, cat3] = await Promise.all([
    prisma.units.findMany({ select: { code: true } }).then((r) => new Set(r.map((x) => x.code))),
    prisma.product_class_major.findMany({ select: { code: true } }).then((r) => new Set(r.map((x) => x.code))),
    prisma.product_class_middle.findMany({ select: { code: true } }).then((r) => new Set(r.map((x) => x.code))),
    prisma.product_class_minor.findMany({ select: { code: true } }).then((r) => new Set(r.map((x) => x.code))),
    prisma.product_category_1.findMany({ select: { code: true } }).then((r) => new Set(r.map((x) => x.code))),
    prisma.product_category_2.findMany({ select: { code: true } }).then((r) => new Set(r.map((x) => x.code))),
    prisma.product_category_3.findMany({ select: { code: true } }).then((r) => new Set(r.map((x) => x.code))),
  ]);

  const errors = new ErrorCollector();
  let created = 0;
  let updated = 0;
  let nulledRefs = 0;
  const byCode = new Map<string, ProductRow>();

  for (const [i, row] of rows.entries()) {
    const code = emptyToNull(row["商品コード"]);
    const name = emptyToNull(row["商品名"]); // ヘッダーは正規化済み（全角スペース除去後）
    if (!code) {
      errors.add(`${i + 2}行目: 商品コードが空のためスキップしました`);
      continue;
    }
    if (!name) {
      errors.add(`${i + 2}行目(${code}): 商品名が空のためスキップしました`);
      continue;
    }

    let unit_code = emptyToNull(row["単位"]);
    if (unit_code && !units.has(unit_code)) {
      nulledRefs++;
      unit_code = null;
    }
    let major_class_code = emptyToNull(row["大分類コード"]);
    if (major_class_code && !major.has(major_class_code)) {
      nulledRefs++;
      major_class_code = null;
    }
    let middle_class_code = emptyToNull(row["中分類コード"]);
    if (middle_class_code && !middle.has(middle_class_code)) {
      nulledRefs++;
      middle_class_code = null;
    }
    let minor_class_code = emptyToNull(row["小分類コード"]);
    if (minor_class_code && !minor.has(minor_class_code)) {
      nulledRefs++;
      minor_class_code = null;
    }
    let category1_code = emptyToNull(row["分類区分1"]);
    if (category1_code && !cat1.has(category1_code)) {
      nulledRefs++;
      category1_code = null;
    }
    let category2_code = emptyToNull(row["分類区分2"]);
    if (category2_code && !cat2.has(category2_code)) {
      nulledRefs++;
      category2_code = null;
    }
    let category3_code = emptyToNull(row["分類区分3"]);
    if (category3_code && !cat3.has(category3_code)) {
      nulledRefs++;
      category3_code = null;
    }

    const data: ProductRow = {
      line: i + 2,
      code,
      name,
      spec: emptyToNull(row["規格"]),
      kana: emptyToNull(row["フリガナ"]),
      unit_code,
      tax_category: toIntOrNull(row["消費税区分"]) ?? 0,
      stock_managed: (toIntOrNull(row["在庫区分"]) ?? 1) !== 0,
      cost_category: toIntOrNull(row["原価区分"]) ?? 0,
      major_class_code,
      middle_class_code,
      minor_class_code,
      category1_code,
      category2_code,
      category3_code,
      sale_price_1: toDecimalOrNull(row["売上単価1"]),
      sale_price_2: toDecimalOrNull(row["売上単価2"]),
      sale_price_3: toDecimalOrNull(row["売上単価3"]),
      sale_price_4: toDecimalOrNull(row["売上単価4"]),
      sale_price_5: toDecimalOrNull(row["売上単価5"]),
      standard_cost: toDecimalOrNull(row["標準仕入単価"]),
      last_cost: toDecimalOrNull(row["最終仕入単価"]),
      moving_avg_cost: toDecimalOrNull(row["移動平均単価"]),
    };

    const invalid = validateProductRow(data);
    if (invalid) {
      errors.add(`${data.line}行目(${code}): ${invalid}のためスキップしました`);
      continue;
    }
    // 同じ商品コードが複数行ある場合は、従来（1行ずつ上書き）と同じく後の行の内容を採用する
    byCode.set(code, data);
  }

  // 商品マスタは約14.6万行あるため、1行ずつ存在確認→upsertすると数十分かかり、
  // 途中でリクエストがタイムアウトしてしまう。既存コードを一括で取得したうえで、
  // INSERT ... ON CONFLICT DO UPDATE を1,000行単位でまとめて実行する。
  const existingCodes = new Set(
    (await prisma.products.findMany({ select: { code: true } })).map((p) => p.code),
  );
  const targets = [...byCode.values()];
  for (let start = 0; start < targets.length; start += PRODUCT_UPSERT_CHUNK) {
    const chunk = targets.slice(start, start + PRODUCT_UPSERT_CHUNK);
    try {
      await upsertProducts(chunk);
      for (const r of chunk) {
        if (existingCodes.has(r.code)) updated++;
        else created++;
      }
    } catch {
      // まとめて登録できなかった場合は、原因の行を特定するため1行ずつ登録し直す
      for (const r of chunk) {
        try {
          await upsertProducts([r]);
          if (existingCodes.has(r.code)) updated++;
          else created++;
        } catch (e) {
          errors.add(`${r.line}行目(${r.code}): ${e instanceof Error ? e.message : "登録に失敗しました"}`);
        }
      }
    }
  }

  revalidatePath("/products");
  return { total: rows.length, created, updated, failed: errors.count, nulledRefs, errors: errors.errors };
}
