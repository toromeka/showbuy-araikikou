"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { acquireClosingLock } from "@/lib/closing-lock";
import type { Prisma } from "@/generated/prisma/client";

type TxClient = Prisma.TransactionClient;

export type ClosingDayFilter = number | "all";

export type PaymentPreviewItem = {
  supplier_code: string;
  supplier_name: string;
  period_from: string | null;
  period_to: string;
  previous_balance: number;
  purchase_amount: number;
  tax_amount: number;
  payment_amount: number;
  payable_amount: number;
  voucher_count: number;
};

export type PaymentPreviewResult = {
  items: PaymentPreviewItem[];
  skippedZeroCount: number;
  error?: string;
};

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function toDateOnly(d: string): Date {
  return new Date(`${d}T00:00:00.000Z`);
}

async function computeItems(
  client: TxClient,
  closingDay: ClosingDayFilter,
  asOfDateStr: string,
): Promise<{ items: PaymentPreviewItem[]; skippedZeroCount: number }> {
  const asOfDate = toDateOnly(asOfDateStr);

  const companySettings = await client.company_settings.findUnique({ where: { id: 1 } });
  const defaultClosingDay = companySettings?.default_closing_day ?? 31;

  const suppliers = await client.suppliers.findMany({
    where: { is_active: true },
    orderBy: { code: "asc" },
  });

  const items: PaymentPreviewItem[] = [];
  let skippedZeroCount = 0;

  for (const supplier of suppliers) {
    const effectiveClosingDay = supplier.closing_day ?? defaultClosingDay;
    if (closingDay !== "all" && effectiveClosingDay !== closingDay) continue;

    const prevRecord = await client.payment_records.findFirst({
      where: { supplier_code: supplier.code, payment_closings: { is_reversed: false } },
      orderBy: { period_to: "desc" },
    });

    const periodFrom = prevRecord ? addDays(prevRecord.period_to, 1) : null;
    const periodTo = asOfDate;

    const purchaseAgg = await client.purchase_vouchers.aggregate({
      where: {
        supplier_code: supplier.code,
        is_settled: false,
        voucher_date: { lte: periodTo },
      },
      _sum: { subtotal_amount: true, tax_amount: true },
      _count: true,
    });

    const paymentAgg = await client.payment_vouchers.aggregate({
      where: {
        supplier_code: supplier.code,
        voucher_date: {
          lte: periodTo,
          ...(periodFrom ? { gte: periodFrom } : {}),
        },
      },
      _sum: { subtotal_amount: true },
    });

    const previousBalance = prevRecord ? Number(prevRecord.payable_amount) : Number(supplier.opening_balance ?? 0);
    const purchaseAmount = Number(purchaseAgg._sum.subtotal_amount ?? 0);
    const taxAmount = Number(purchaseAgg._sum.tax_amount ?? 0);
    const paymentAmount = Number(paymentAgg._sum.subtotal_amount ?? 0);
    const payableAmount = previousBalance + purchaseAmount + taxAmount - paymentAmount;

    if (previousBalance === 0 && purchaseAmount === 0 && taxAmount === 0 && paymentAmount === 0) {
      skippedZeroCount += 1;
      continue;
    }

    items.push({
      supplier_code: supplier.code,
      supplier_name: supplier.name1,
      period_from: periodFrom ? periodFrom.toISOString().slice(0, 10) : null,
      period_to: periodTo.toISOString().slice(0, 10),
      previous_balance: previousBalance,
      purchase_amount: purchaseAmount,
      tax_amount: taxAmount,
      payment_amount: paymentAmount,
      payable_amount: payableAmount,
      voucher_count: purchaseAgg._count,
    });
  }

  return { items, skippedZeroCount };
}

export async function previewPaymentClosing(
  closingDay: ClosingDayFilter,
  asOfDate: string,
): Promise<PaymentPreviewResult> {
  const session = await auth();
  if (!session?.user) return { items: [], skippedZeroCount: 0, error: "ログインが必要です。" };
  if (!asOfDate) return { items: [], skippedZeroCount: 0, error: "基準日を入力してください。" };

  const { items, skippedZeroCount } = await computeItems(prisma, closingDay, asOfDate);
  return { items, skippedZeroCount };
}

export type PaymentClosingActionResult = { id?: string; error?: string };

const PAYMENT_CLOSING_LOCK_KEY = "payment_closing";

export async function executePaymentClosing(
  closingDay: ClosingDayFilter,
  asOfDate: string,
): Promise<PaymentClosingActionResult> {
  const session = await auth();
  if (!session?.user) return { error: "ログインが必要です。" };
  const userId: string | null = session.user.id ?? null;
  if (!asOfDate) return { error: "基準日を入力してください。" };

  try {
    const closingId = await prisma.$transaction(async (tx) => {
      await acquireClosingLock(tx, PAYMENT_CLOSING_LOCK_KEY);
      const { items } = await computeItems(tx, closingDay, asOfDate);
      if (items.length === 0) {
        throw new Error("対象となる仕入先がありません（未払の仕入・残高がある仕入先が見つかりませんでした）。");
      }

      const closing = await tx.payment_closings.create({
        data: {
          closing_day: closingDay === "all" ? 0 : closingDay,
          as_of_date: toDateOnly(asOfDate),
          executed_by: userId,
        },
      });

      for (const item of items) {
        await tx.payment_records.create({
          data: {
            closing_id: closing.id,
            supplier_code: item.supplier_code,
            period_from: item.period_from ? toDateOnly(item.period_from) : null,
            period_to: toDateOnly(item.period_to),
            previous_balance: item.previous_balance,
            purchase_amount: item.purchase_amount,
            tax_amount: item.tax_amount,
            payment_amount: item.payment_amount,
            payable_amount: item.payable_amount,
          },
        });

        await tx.purchase_vouchers.updateMany({
          where: {
            supplier_code: item.supplier_code,
            is_settled: false,
            voucher_date: { lte: toDateOnly(item.period_to) },
          },
          data: { is_settled: true },
        });
      }

      return closing.id;
    });

    revalidatePath("/payment-closings");
    return { id: closingId.toString() };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "仕入支払更新の実行に失敗しました。" };
  }
}

export async function reversePaymentClosing(id: string): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user) return { error: "ログインが必要です。" };

  const closing = await prisma.payment_closings.findUnique({
    where: { id: BigInt(id) },
    include: { payment_records: true },
  });
  if (!closing) return { error: "対象の仕入支払更新履歴が見つかりません。" };
  if (closing.is_reversed) return { error: "この仕入支払更新はすでに取り消し済みです。" };

  try {
    await prisma.$transaction(async (tx) => {
      await acquireClosingLock(tx, PAYMENT_CLOSING_LOCK_KEY);
      for (const record of closing.payment_records) {
        await tx.purchase_vouchers.updateMany({
          where: {
            supplier_code: record.supplier_code,
            is_settled: true,
            voucher_date: {
              lte: record.period_to,
              ...(record.period_from ? { gte: record.period_from } : {}),
            },
          },
          data: { is_settled: false },
        });
      }

      await tx.payment_closings.update({
        where: { id: BigInt(id) },
        data: { is_reversed: true },
      });
    });

    revalidatePath("/payment-closings");
    revalidatePath(`/payment-closings/${id}`);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "取り消しに失敗しました。" };
  }
}
