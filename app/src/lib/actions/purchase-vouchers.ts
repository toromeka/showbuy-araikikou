"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { roundByMethod } from "@/lib/tax";
import { withVoucherNoRetry } from "@/lib/voucher-number";

export type PurchaseVoucherLineInput = {
  product_code?: string | null;
  product_name: string;
  spec?: string | null;
  unit?: string | null;
  category?: string | null;
  quantity: number;
  cost_price?: number | null;
  note?: string | null;
};

export type PurchaseVoucherInput = {
  supplier_code: string;
  voucher_date: string; // YYYY-MM-DD
  staff_code?: string | null;
  remarks?: string | null;
  lines: PurchaseVoucherLineInput[];
};

export type PurchaseVoucherActionResult = { id?: string; error?: string };

function computeLines(
  lines: PurchaseVoucherLineInput[],
  taxRate: number,
  roundingMethod: number | null | undefined,
) {
  const validLines = lines.filter((l) => l.product_name?.trim() && Number(l.quantity) !== 0);
  let subtotalAmount = 0;

  const lineData = validLines.map((l, idx) => {
    const qty = Number(l.quantity) || 0;
    const costPrice = Number(l.cost_price) || 0;
    const costAmount = Math.round(qty * costPrice * 100) / 100;
    subtotalAmount += costAmount;
    return {
      line_no: idx + 1,
      category: l.category || null,
      product_code: l.product_code || null,
      product_name: l.product_name.trim(),
      spec: l.spec || null,
      unit: l.unit || null,
      quantity: qty,
      cost_price: l.cost_price != null ? costPrice : null,
      cost_amount: costAmount,
      note: l.note || null,
    };
  });

  const taxAmount = roundByMethod(subtotalAmount * (taxRate / 100), roundingMethod);
  return { lineData, subtotalAmount, taxAmount, totalAmount: subtotalAmount + taxAmount };
}

async function getEffectiveTaxRate(voucherDate: Date): Promise<number> {
  const row = await prisma.tax_rate_history.findFirst({
    where: { starts_on: { lte: voucherDate } },
    orderBy: { starts_on: "desc" },
  });
  return row ? Number(row.rate) : 10;
}

async function validateInput(input: PurchaseVoucherInput): Promise<string | null> {
  if (!input.supplier_code) return "仕入先を選択してください。";
  if (!input.voucher_date) return "伝票日付を入力してください。";
  const validLines = input.lines.filter((l) => l.product_name?.trim() && Number(l.quantity) !== 0);
  if (validLines.length === 0) return "明細を1行以上入力してください（商品名と数量が必要です）。";
  const supplier = await prisma.suppliers.findUnique({ where: { code: input.supplier_code } });
  if (!supplier) return "指定された仕入先が見つかりません。";
  return null;
}

export async function createPurchaseVoucher(
  input: PurchaseVoucherInput,
): Promise<PurchaseVoucherActionResult> {
  const session = await auth();
  if (!session?.user) return { error: "ログインが必要です。" };
  const userId: string | null = session.user.id ?? null;

  const validationError = await validateInput(input);
  if (validationError) return { error: validationError };

  const supplier = await prisma.suppliers.findUniqueOrThrow({ where: { code: input.supplier_code } });
  const voucherDate = new Date(input.voucher_date);
  const taxRate = await getEffectiveTaxRate(voucherDate);
  const { lineData, subtotalAmount, taxAmount, totalAmount } = computeLines(
    input.lines,
    taxRate,
    supplier.rounding_method,
  );

  try {
    const voucher = await withVoucherNoRetry("purchase", (voucherNo) =>
      prisma.$transaction(async (tx) => {
        const created = await tx.purchase_vouchers.create({
          data: {
            voucher_no: voucherNo,
            supplier_code: input.supplier_code,
            voucher_date: voucherDate,
            tax_rate: taxRate,
            staff_code: input.staff_code || null,
            remarks: input.remarks || null,
            subtotal_amount: subtotalAmount,
            tax_amount: taxAmount,
            total_amount: totalAmount,
            created_by: userId,
          },
        });

        await tx.purchase_voucher_lines.createMany({
          data: lineData.map((l) => ({ ...l, voucher_id: created.id })),
        });

        return created;
      }),
    );

    revalidatePath("/purchase-vouchers");
    return { id: voucher.id.toString() };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "登録に失敗しました。" };
  }
}

export async function updatePurchaseVoucher(
  id: string,
  input: PurchaseVoucherInput,
): Promise<PurchaseVoucherActionResult> {
  const session = await auth();
  if (!session?.user) return { error: "ログインが必要です。" };

  const existing = await prisma.purchase_vouchers.findUnique({ where: { id: BigInt(id) } });
  if (!existing) return { error: "対象の伝票が見つかりません。" };
  if (existing.is_settled) return { error: "支払更新済みの伝票は編集できません。" };

  const validationError = await validateInput(input);
  if (validationError) return { error: validationError };

  const supplier = await prisma.suppliers.findUniqueOrThrow({ where: { code: input.supplier_code } });
  const voucherDate = new Date(input.voucher_date);
  const taxRate = await getEffectiveTaxRate(voucherDate);
  const { lineData, subtotalAmount, taxAmount, totalAmount } = computeLines(
    input.lines,
    taxRate,
    supplier.rounding_method,
  );

  try {
    await prisma.$transaction(async (tx) => {
      // 直前のfindUniqueによるis_settledチェックとこの更新の間に、別端末での仕入支払更新が
      // 割り込む可能性がある（TOCTOU）。where句にis_settled: falseを含めることで、
      // 「未払であること」の確認と更新を1つの原子的なSQL文にまとめ、競合を防ぐ。
      const updateResult = await tx.purchase_vouchers.updateMany({
        where: { id: BigInt(id), is_settled: false },
        data: {
          supplier_code: input.supplier_code,
          voucher_date: voucherDate,
          tax_rate: taxRate,
          staff_code: input.staff_code || null,
          remarks: input.remarks || null,
          subtotal_amount: subtotalAmount,
          tax_amount: taxAmount,
          total_amount: totalAmount,
          updated_at: new Date(),
        },
      });
      if (updateResult.count === 0) {
        throw new Error("支払更新済みの伝票は編集できません（他の端末で先に仕入支払更新された可能性があります）。");
      }
      await tx.purchase_voucher_lines.deleteMany({ where: { voucher_id: BigInt(id) } });
      await tx.purchase_voucher_lines.createMany({
        data: lineData.map((l) => ({ ...l, voucher_id: BigInt(id) })),
      });
    });

    revalidatePath("/purchase-vouchers");
    revalidatePath(`/purchase-vouchers/${id}`);
    return { id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "更新に失敗しました。" };
  }
}

export async function deletePurchaseVoucher(id: string): Promise<{ error?: string }> {
  const existing = await prisma.purchase_vouchers.findUnique({ where: { id: BigInt(id) } });
  if (!existing) return { error: "対象の伝票が見つかりません。" };

  // findUniqueでの事前チェックと削除の間に別端末が仕入支払更新を実行する可能性があるため、
  // 削除自体もis_settled: falseを条件に含めて原子的に行う（TOCTOU対策）。
  const result = await prisma.purchase_vouchers.deleteMany({ where: { id: BigInt(id), is_settled: false } });
  if (result.count === 0) {
    return { error: "支払更新済みの伝票は削除できません（他の端末で先に仕入支払更新された可能性があります）。" };
  }
  revalidatePath("/purchase-vouchers");
  return {};
}

export type PurchaseProductSearchResult = {
  code: string;
  name: string;
  spec: string | null;
  unit_code: string | null;
  standard_cost: string | null;
};

export async function searchPurchaseProducts(query: string): Promise<PurchaseProductSearchResult[]> {
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
    select: { code: true, name: true, spec: true, unit_code: true, standard_cost: true },
  });

  return products.map((p) => ({
    code: p.code,
    name: p.name,
    spec: p.spec,
    unit_code: p.unit_code,
    standard_cost: p.standard_cost != null ? p.standard_cost.toString() : null,
  }));
}
