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

    const data = {
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
      updated_at: new Date(),
    };

    try {
      const existing = await prisma.products.findUnique({ where: { code } });
      await prisma.products.upsert({
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

  revalidatePath("/products");
  return { total: rows.length, created, updated, failed: errors.count, nulledRefs, errors: errors.errors };
}
