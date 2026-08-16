"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withVoucherNoRetry } from "@/lib/voucher-number";

export type PaymentVoucherLineInput = {
  category: string; // 現金・振込・手形・その他
  amount: number;
  note?: string | null;
  bank_code?: string | null;
  bill_due_date?: string | null; // YYYY-MM-DD（手形決済日）
};

export type PaymentVoucherInput = {
  supplier_code: string;
  voucher_date: string; // YYYY-MM-DD
  period_from?: string | null;
  period_to?: string | null;
  billed_amount?: number | null;
  purchase_amount?: number | null;
  tax_amount?: number | null;
  lines: PaymentVoucherLineInput[];
};

export type PaymentVoucherActionResult = { id?: string; error?: string };

const CATEGORIES = ["現金", "振込", "手形", "その他"];

function computeLines(lines: PaymentVoucherLineInput[]) {
  const validLines = lines.filter((l) => Number(l.amount) !== 0);
  let subtotalAmount = 0;

  const lineData = validLines.map((l, idx) => {
    const amount = Number(l.amount) || 0;
    subtotalAmount += amount;
    return {
      line_no: idx + 1,
      category: l.category || null,
      amount,
      note: l.note || null,
      bank_code: l.bank_code || null,
      bill_due_date: l.bill_due_date ? new Date(l.bill_due_date) : null,
    };
  });

  return { lineData, subtotalAmount };
}

async function validateInput(input: PaymentVoucherInput): Promise<string | null> {
  if (!input.supplier_code) return "仕入先を選択してください。";
  if (!input.voucher_date) return "伝票日付を入力してください。";
  const validLines = input.lines.filter((l) => Number(l.amount) !== 0);
  if (validLines.length === 0) return "支払明細を1行以上入力してください（金額が必要です）。";
  for (const l of validLines) {
    if (l.category && !CATEGORIES.includes(l.category)) {
      return `区分「${l.category}」は不正な値です。`;
    }
  }
  const supplier = await prisma.suppliers.findUnique({ where: { code: input.supplier_code } });
  if (!supplier) return "指定された仕入先が見つかりません。";
  return null;
}

export async function createPaymentVoucher(
  input: PaymentVoucherInput,
): Promise<PaymentVoucherActionResult> {
  const session = await auth();
  if (!session?.user) return { error: "ログインが必要です。" };
  const userId: string | null = session.user.id ?? null;

  const validationError = await validateInput(input);
  if (validationError) return { error: validationError };

  const voucherDate = new Date(input.voucher_date);
  const { lineData, subtotalAmount } = computeLines(input.lines);

  try {
    const voucher = await withVoucherNoRetry("payment", (voucherNo) =>
      prisma.$transaction(async (tx) => {
        const created = await tx.payment_vouchers.create({
          data: {
            voucher_no: voucherNo,
            supplier_code: input.supplier_code,
            voucher_date: voucherDate,
            period_from: input.period_from ? new Date(input.period_from) : null,
            period_to: input.period_to ? new Date(input.period_to) : null,
            billed_amount: input.billed_amount ?? null,
            purchase_amount: input.purchase_amount ?? null,
            tax_amount: input.tax_amount ?? null,
            subtotal_amount: subtotalAmount,
            created_by: userId,
          },
        });

        await tx.payment_voucher_lines.createMany({
          data: lineData.map((l) => ({ ...l, voucher_id: created.id })),
        });

        return created;
      }),
    );

    revalidatePath("/payment-vouchers");
    return { id: voucher.id.toString() };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "登録に失敗しました。" };
  }
}

export async function updatePaymentVoucher(
  id: string,
  input: PaymentVoucherInput,
): Promise<PaymentVoucherActionResult> {
  const session = await auth();
  if (!session?.user) return { error: "ログインが必要です。" };

  const existing = await prisma.payment_vouchers.findUnique({ where: { id: BigInt(id) } });
  if (!existing) return { error: "対象の伝票が見つかりません。" };

  const validationError = await validateInput(input);
  if (validationError) return { error: validationError };

  const voucherDate = new Date(input.voucher_date);
  const { lineData, subtotalAmount } = computeLines(input.lines);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.payment_vouchers.update({
        where: { id: BigInt(id) },
        data: {
          supplier_code: input.supplier_code,
          voucher_date: voucherDate,
          period_from: input.period_from ? new Date(input.period_from) : null,
          period_to: input.period_to ? new Date(input.period_to) : null,
          billed_amount: input.billed_amount ?? null,
          purchase_amount: input.purchase_amount ?? null,
          tax_amount: input.tax_amount ?? null,
          subtotal_amount: subtotalAmount,
          updated_at: new Date(),
        },
      });
      await tx.payment_voucher_lines.deleteMany({ where: { voucher_id: BigInt(id) } });
      await tx.payment_voucher_lines.createMany({
        data: lineData.map((l) => ({ ...l, voucher_id: BigInt(id) })),
      });
    });

    revalidatePath("/payment-vouchers");
    revalidatePath(`/payment-vouchers/${id}`);
    return { id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "更新に失敗しました。" };
  }
}

export async function deletePaymentVoucher(id: string): Promise<{ error?: string }> {
  const existing = await prisma.payment_vouchers.findUnique({ where: { id: BigInt(id) } });
  if (!existing) return { error: "対象の伝票が見つかりません。" };

  await prisma.payment_vouchers.delete({ where: { id: BigInt(id) } });
  revalidatePath("/payment-vouchers");
  return {};
}
