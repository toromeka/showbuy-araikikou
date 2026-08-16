"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withVoucherNoRetry } from "@/lib/voucher-number";

export type ReceiptVoucherLineInput = {
  category: string; // 現金・振込・手形・その他
  amount: number;
  note?: string | null;
  bank_code?: string | null;
  bill_due_date?: string | null; // YYYY-MM-DD（手形決済日）
  bill_no?: string | null;
};

export type ReceiptVoucherInput = {
  customer_code: string;
  voucher_date: string; // YYYY-MM-DD
  period_from?: string | null;
  period_to?: string | null;
  billed_amount?: number | null;
  sales_amount?: number | null;
  tax_amount?: number | null;
  print_receipt: boolean;
  lines: ReceiptVoucherLineInput[];
};

export type ReceiptVoucherActionResult = { id?: string; error?: string };

const CATEGORIES = ["現金", "振込", "手形", "その他"];

function computeLines(lines: ReceiptVoucherLineInput[]) {
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
      bill_no: l.bill_no || null,
    };
  });

  return { lineData, subtotalAmount };
}

async function validateInput(input: ReceiptVoucherInput): Promise<string | null> {
  if (!input.customer_code) return "得意先を選択してください。";
  if (!input.voucher_date) return "伝票日付を入力してください。";
  const validLines = input.lines.filter((l) => Number(l.amount) !== 0);
  if (validLines.length === 0) return "入金明細を1行以上入力してください（金額が必要です）。";
  for (const l of validLines) {
    if (l.category && !CATEGORIES.includes(l.category)) {
      return `区分「${l.category}」は不正な値です。`;
    }
  }
  const customer = await prisma.customers.findUnique({ where: { code: input.customer_code } });
  if (!customer) return "指定された得意先が見つかりません。";
  return null;
}

export async function createReceiptVoucher(
  input: ReceiptVoucherInput,
): Promise<ReceiptVoucherActionResult> {
  const session = await auth();
  if (!session?.user) return { error: "ログインが必要です。" };
  const userId: string | null = session.user.id ?? null;

  const validationError = await validateInput(input);
  if (validationError) return { error: validationError };

  const voucherDate = new Date(input.voucher_date);
  const { lineData, subtotalAmount } = computeLines(input.lines);

  try {
    const voucher = await withVoucherNoRetry("receipt", (voucherNo) =>
      prisma.$transaction(async (tx) => {
        const created = await tx.receipt_vouchers.create({
          data: {
            voucher_no: voucherNo,
            customer_code: input.customer_code,
            voucher_date: voucherDate,
            period_from: input.period_from ? new Date(input.period_from) : null,
            period_to: input.period_to ? new Date(input.period_to) : null,
            billed_amount: input.billed_amount ?? null,
            sales_amount: input.sales_amount ?? null,
            tax_amount: input.tax_amount ?? null,
            subtotal_amount: subtotalAmount,
            print_receipt: input.print_receipt,
            created_by: userId,
          },
        });

        await tx.receipt_voucher_lines.createMany({
          data: lineData.map((l) => ({ ...l, voucher_id: created.id })),
        });

        return created;
      }),
    );

    revalidatePath("/receipt-vouchers");
    return { id: voucher.id.toString() };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "登録に失敗しました。" };
  }
}

export async function updateReceiptVoucher(
  id: string,
  input: ReceiptVoucherInput,
): Promise<ReceiptVoucherActionResult> {
  const session = await auth();
  if (!session?.user) return { error: "ログインが必要です。" };

  const existing = await prisma.receipt_vouchers.findUnique({ where: { id: BigInt(id) } });
  if (!existing) return { error: "対象の伝票が見つかりません。" };

  const validationError = await validateInput(input);
  if (validationError) return { error: validationError };

  const voucherDate = new Date(input.voucher_date);
  const { lineData, subtotalAmount } = computeLines(input.lines);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.receipt_vouchers.update({
        where: { id: BigInt(id) },
        data: {
          customer_code: input.customer_code,
          voucher_date: voucherDate,
          period_from: input.period_from ? new Date(input.period_from) : null,
          period_to: input.period_to ? new Date(input.period_to) : null,
          billed_amount: input.billed_amount ?? null,
          sales_amount: input.sales_amount ?? null,
          tax_amount: input.tax_amount ?? null,
          subtotal_amount: subtotalAmount,
          print_receipt: input.print_receipt,
          updated_at: new Date(),
        },
      });
      await tx.receipt_voucher_lines.deleteMany({ where: { voucher_id: BigInt(id) } });
      await tx.receipt_voucher_lines.createMany({
        data: lineData.map((l) => ({ ...l, voucher_id: BigInt(id) })),
      });
    });

    revalidatePath("/receipt-vouchers");
    revalidatePath(`/receipt-vouchers/${id}`);
    return { id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "更新に失敗しました。" };
  }
}

export async function deleteReceiptVoucher(id: string): Promise<{ error?: string }> {
  const existing = await prisma.receipt_vouchers.findUnique({ where: { id: BigInt(id) } });
  if (!existing) return { error: "対象の伝票が見つかりません。" };

  await prisma.receipt_vouchers.delete({ where: { id: BigInt(id) } });
  revalidatePath("/receipt-vouchers");
  return {};
}
