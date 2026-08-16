"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { roundByMethod } from "@/lib/tax";
import { withVoucherNoRetry } from "@/lib/voucher-number";

export type SalesVoucherLineInput = {
  product_code?: string | null;
  product_name: string;
  spec?: string | null;
  unit?: string | null;
  quantity: number;
  cost_price?: number | null;
  sale_price?: number | null;
  note?: string | null;
};

export type SalesVoucherInput = {
  customer_code: string;
  voucher_date: string; // YYYY-MM-DD
  staff_code?: string | null;
  is_cash_sale: boolean;
  remarks?: string | null;
  lines: SalesVoucherLineInput[];
};

export type SalesVoucherActionResult = { id?: string; error?: string };

function computeLines(
  lines: SalesVoucherLineInput[],
  taxRate: number,
  roundingMethod: number | null | undefined,
) {
  const validLines = lines.filter((l) => l.product_name?.trim() && Number(l.quantity) !== 0);
  let salesAmount = 0;
  let costAmount = 0;
  let taxAmountTotal = 0;

  const lineData = validLines.map((l, idx) => {
    const qty = Number(l.quantity) || 0;
    const salePrice = Number(l.sale_price) || 0;
    const costPrice = Number(l.cost_price) || 0;
    const saleAmount = Math.round(qty * salePrice * 100) / 100;
    const costAmt = Math.round(qty * costPrice * 100) / 100;
    const lineTax = roundByMethod(saleAmount * (taxRate / 100), roundingMethod);
    salesAmount += saleAmount;
    costAmount += costAmt;
    taxAmountTotal += lineTax;
    return {
      line_no: idx + 1,
      product_code: l.product_code || null,
      product_name: l.product_name.trim(),
      spec: l.spec || null,
      unit: l.unit || null,
      quantity: qty,
      cost_price: l.cost_price != null ? costPrice : null,
      cost_amount: costAmt,
      sale_price: l.sale_price != null ? salePrice : null,
      sale_amount: saleAmount,
      gross_profit: saleAmount - costAmt,
      tax_amount: lineTax,
      note: l.note || null,
    };
  });

  return { lineData, salesAmount, costAmount, taxAmountTotal };
}

async function getEffectiveTaxRate(voucherDate: Date): Promise<number> {
  const row = await prisma.tax_rate_history.findFirst({
    where: { starts_on: { lte: voucherDate } },
    orderBy: { starts_on: "desc" },
  });
  return row ? Number(row.rate) : 10;
}

async function validateInput(input: SalesVoucherInput): Promise<string | null> {
  if (!input.customer_code) return "得意先を選択してください。";
  if (!input.voucher_date) return "伝票日付を入力してください。";
  const validLines = input.lines.filter((l) => l.product_name?.trim() && Number(l.quantity) !== 0);
  if (validLines.length === 0) return "明細を1行以上入力してください（商品名と数量が必要です）。";
  const customer = await prisma.customers.findUnique({ where: { code: input.customer_code } });
  if (!customer) return "指定された得意先が見つかりません。";
  return null;
}

export async function createSalesVoucher(input: SalesVoucherInput): Promise<SalesVoucherActionResult> {
  const session = await auth();
  if (!session?.user) return { error: "ログインが必要です。" };
  const userId: string | null = session.user.id ?? null;

  const validationError = await validateInput(input);
  if (validationError) return { error: validationError };

  const customer = await prisma.customers.findUniqueOrThrow({ where: { code: input.customer_code } });
  const voucherDate = new Date(input.voucher_date);
  const taxRate = await getEffectiveTaxRate(voucherDate);
  const { lineData, salesAmount, costAmount, taxAmountTotal } = computeLines(
    input.lines,
    taxRate,
    customer.rounding_method,
  );

  try {
    const voucher = await withVoucherNoRetry("sales", (voucherNo) =>
      prisma.$transaction(async (tx) => {
        const created = await tx.sales_vouchers.create({
          data: {
            voucher_no: voucherNo,
            is_cash_sale: input.is_cash_sale,
            customer_code: input.customer_code,
            voucher_date: voucherDate,
            entered_on: new Date(),
            tax_rate: taxRate,
            staff_code: input.staff_code || null,
            remarks: input.remarks || null,
            sales_amount: salesAmount,
            cost_amount: costAmount,
            tax_amount: taxAmountTotal,
            gross_profit: salesAmount - costAmount,
            created_by: userId,
          },
        });

        await tx.sales_voucher_lines.createMany({
          data: lineData.map((l) => ({ ...l, voucher_id: created.id })),
        });

        return created;
      }),
    );

    revalidatePath("/sales-vouchers");
    return { id: voucher.id.toString() };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "登録に失敗しました。" };
  }
}

export async function updateSalesVoucher(
  id: string,
  input: SalesVoucherInput,
): Promise<SalesVoucherActionResult> {
  const session = await auth();
  if (!session?.user) return { error: "ログインが必要です。" };

  const existing = await prisma.sales_vouchers.findUnique({ where: { id: BigInt(id) } });
  if (!existing) return { error: "対象の伝票が見つかりません。" };
  if (existing.is_billed) return { error: "請求確定済みの伝票は編集できません。" };

  const validationError = await validateInput(input);
  if (validationError) return { error: validationError };

  const customer = await prisma.customers.findUniqueOrThrow({ where: { code: input.customer_code } });
  const voucherDate = new Date(input.voucher_date);
  const taxRate = await getEffectiveTaxRate(voucherDate);
  const { lineData, salesAmount, costAmount, taxAmountTotal } = computeLines(
    input.lines,
    taxRate,
    customer.rounding_method,
  );

  try {
    await prisma.$transaction(async (tx) => {
      // 直前のfindUniqueによるis_billedチェックとこの更新の間に、別端末での請求更新が
      // 割り込む可能性がある（TOCTOU）。where句にis_billed: falseを含めることで、
      // 「未請求であること」の確認と更新を1つの原子的なSQL文にまとめ、競合を防ぐ。
      const updateResult = await tx.sales_vouchers.updateMany({
        where: { id: BigInt(id), is_billed: false },
        data: {
          is_cash_sale: input.is_cash_sale,
          customer_code: input.customer_code,
          voucher_date: voucherDate,
          tax_rate: taxRate,
          staff_code: input.staff_code || null,
          remarks: input.remarks || null,
          sales_amount: salesAmount,
          cost_amount: costAmount,
          tax_amount: taxAmountTotal,
          gross_profit: salesAmount - costAmount,
          updated_at: new Date(),
        },
      });
      if (updateResult.count === 0) {
        throw new Error("請求確定済みの伝票は編集できません（他の端末で先に請求更新された可能性があります）。");
      }
      await tx.sales_voucher_lines.deleteMany({ where: { voucher_id: BigInt(id) } });
      await tx.sales_voucher_lines.createMany({
        data: lineData.map((l) => ({ ...l, voucher_id: BigInt(id) })),
      });
    });

    revalidatePath("/sales-vouchers");
    revalidatePath(`/sales-vouchers/${id}`);
    return { id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "更新に失敗しました。" };
  }
}

export async function deleteSalesVoucher(id: string): Promise<{ error?: string }> {
  const existing = await prisma.sales_vouchers.findUnique({ where: { id: BigInt(id) } });
  if (!existing) return { error: "対象の伝票が見つかりません。" };

  // findUniqueでの事前チェックと削除の間に別端末が請求更新を実行する可能性があるため、
  // 削除自体もis_billed: falseを条件に含めて原子的に行う（TOCTOU対策）。
  const result = await prisma.sales_vouchers.deleteMany({ where: { id: BigInt(id), is_billed: false } });
  if (result.count === 0) {
    return { error: "請求確定済みの伝票は削除できません（他の端末で先に請求更新された可能性があります）。" };
  }
  revalidatePath("/sales-vouchers");
  return {};
}

export type ProductSearchResult = {
  code: string;
  name: string;
  spec: string | null;
  unit_code: string | null;
  sale_price_1: string | null;
  standard_cost: string | null;
};

export async function searchProducts(query: string): Promise<ProductSearchResult[]> {
  const q = query.trim();
  if (q.length === 0) return [];

  const products = await prisma.products.findMany({
    where: {
      is_active: true,
      OR: [
        { code: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
        { kana: { contains: q, mode: "insensitive" } },
      ],
    },
    orderBy: { code: "asc" },
    take: 15,
    select: { code: true, name: true, spec: true, unit_code: true, sale_price_1: true, standard_cost: true },
  });

  return products.map((p) => ({
    code: p.code,
    name: p.name,
    spec: p.spec,
    unit_code: p.unit_code,
    sale_price_1: p.sale_price_1 != null ? p.sale_price_1.toString() : null,
    standard_cost: p.standard_cost != null ? p.standard_cost.toString() : null,
  }));
}
