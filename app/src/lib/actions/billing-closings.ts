"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { acquireClosingLock } from "@/lib/closing-lock";
import type { Prisma } from "@/generated/prisma/client";

type TxClient = Prisma.TransactionClient;

export type ClosingDayFilter = number | "all";

export type BillingPreviewItem = {
  customer_code: string;
  customer_name: string;
  group_codes: string[];
  period_from: string | null;
  period_to: string;
  previous_balance: number;
  sales_amount: number;
  tax_amount: number;
  receipt_amount: number;
  billed_amount: number;
  voucher_count: number;
};

export type BillingPreviewResult = {
  items: BillingPreviewItem[];
  skippedZeroCount: number;
  error?: string;
};

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function toDateOnly(d: string): Date {
  // YYYY-MM-DD をUTC日付として扱う（タイムゾーンのずれで前日/翌日にならないようにする）
  return new Date(`${d}T00:00:00.000Z`);
}

async function computeItems(
  client: TxClient,
  closingDay: ClosingDayFilter,
  asOfDateStr: string,
): Promise<{ items: BillingPreviewItem[]; skippedZeroCount: number }> {
  const asOfDate = toDateOnly(asOfDateStr);

  const companySettings = await client.company_settings.findUnique({ where: { id: 1 } });
  const defaultClosingDay = companySettings?.default_closing_day ?? 31;

  const rootCustomers = await client.customers.findMany({
    where: { is_active: true, billing_customer_code: null },
    include: { other_customers: { where: { is_active: true }, select: { code: true } } },
    orderBy: { code: "asc" },
  });

  const items: BillingPreviewItem[] = [];
  let skippedZeroCount = 0;

  for (const root of rootCustomers) {
    const effectiveClosingDay = root.closing_day ?? defaultClosingDay;
    if (closingDay !== "all" && effectiveClosingDay !== closingDay) continue;

    const groupCodes = [root.code, ...root.other_customers.map((c) => c.code)];

    const prevRecord = await client.billing_records.findFirst({
      where: { customer_code: root.code, billing_closings: { is_reversed: false } },
      orderBy: { period_to: "desc" },
    });

    const periodFrom = prevRecord ? addDays(prevRecord.period_to, 1) : null;
    const periodTo = asOfDate;

    const salesAgg = await client.sales_vouchers.aggregate({
      where: {
        customer_code: { in: groupCodes },
        is_billed: false,
        voucher_date: { lte: periodTo },
      },
      _sum: { sales_amount: true, tax_amount: true },
      _count: true,
    });

    const receiptAgg = await client.receipt_vouchers.aggregate({
      where: {
        customer_code: { in: groupCodes },
        voucher_date: {
          lte: periodTo,
          ...(periodFrom ? { gte: periodFrom } : {}),
        },
      },
      _sum: { subtotal_amount: true },
    });

    const previousBalance = prevRecord ? Number(prevRecord.billed_amount) : Number(root.opening_balance ?? 0);
    const salesAmount = Number(salesAgg._sum.sales_amount ?? 0);
    const taxAmount = Number(salesAgg._sum.tax_amount ?? 0);
    const receiptAmount = Number(receiptAgg._sum.subtotal_amount ?? 0);
    const billedAmount = previousBalance + salesAmount + taxAmount - receiptAmount;

    if (previousBalance === 0 && salesAmount === 0 && taxAmount === 0 && receiptAmount === 0) {
      skippedZeroCount += 1;
      continue;
    }

    items.push({
      customer_code: root.code,
      customer_name: root.name1,
      group_codes: groupCodes,
      period_from: periodFrom ? periodFrom.toISOString().slice(0, 10) : null,
      period_to: periodTo.toISOString().slice(0, 10),
      previous_balance: previousBalance,
      sales_amount: salesAmount,
      tax_amount: taxAmount,
      receipt_amount: receiptAmount,
      billed_amount: billedAmount,
      voucher_count: salesAgg._count,
    });
  }

  return { items, skippedZeroCount };
}

export async function previewBillingClosing(
  closingDay: ClosingDayFilter,
  asOfDate: string,
): Promise<BillingPreviewResult> {
  const session = await auth();
  if (!session?.user) return { items: [], skippedZeroCount: 0, error: "ログインが必要です。" };
  if (!asOfDate) return { items: [], skippedZeroCount: 0, error: "基準日を入力してください。" };

  const { items, skippedZeroCount } = await computeItems(prisma, closingDay, asOfDate);
  return { items, skippedZeroCount };
}

export type BillingClosingActionResult = { id?: string; error?: string };

const BILLING_CLOSING_LOCK_KEY = "billing_closing";

export async function executeBillingClosing(
  closingDay: ClosingDayFilter,
  asOfDate: string,
): Promise<BillingClosingActionResult> {
  const session = await auth();
  if (!session?.user) return { error: "ログインが必要です。" };
  const userId: string | null = session.user.id ?? null;
  if (!asOfDate) return { error: "基準日を入力してください。" };

  try {
    const closingId = await prisma.$transaction(async (tx) => {
      await acquireClosingLock(tx, BILLING_CLOSING_LOCK_KEY);
      const { items } = await computeItems(tx, closingDay, asOfDate);
      if (items.length === 0) {
        throw new Error("対象となる得意先がありません（未請求の売上・残高がある得意先が見つかりませんでした）。");
      }

      const closing = await tx.billing_closings.create({
        data: {
          closing_day: closingDay === "all" ? 0 : closingDay,
          as_of_date: toDateOnly(asOfDate),
          executed_by: userId,
        },
      });

      for (const item of items) {
        await tx.billing_records.create({
          data: {
            closing_id: closing.id,
            customer_code: item.customer_code,
            period_from: item.period_from ? toDateOnly(item.period_from) : null,
            period_to: toDateOnly(item.period_to),
            previous_balance: item.previous_balance,
            sales_amount: item.sales_amount,
            tax_amount: item.tax_amount,
            receipt_amount: item.receipt_amount,
            billed_amount: item.billed_amount,
          },
        });

        await tx.sales_vouchers.updateMany({
          where: {
            customer_code: { in: item.group_codes },
            is_billed: false,
            voucher_date: { lte: toDateOnly(item.period_to) },
          },
          data: { is_billed: true },
        });
      }

      return closing.id;
    });

    revalidatePath("/billing-closings");
    return { id: closingId.toString() };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "請求更新の実行に失敗しました。" };
  }
}

export async function reverseBillingClosing(id: string): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user) return { error: "ログインが必要です。" };

  const closing = await prisma.billing_closings.findUnique({
    where: { id: BigInt(id) },
    include: { billing_records: true },
  });
  if (!closing) return { error: "対象の請求更新履歴が見つかりません。" };
  if (closing.is_reversed) return { error: "この請求更新はすでに取り消し済みです。" };

  try {
    await prisma.$transaction(async (tx) => {
      await acquireClosingLock(tx, BILLING_CLOSING_LOCK_KEY);
      for (const record of closing.billing_records) {
        const root = await tx.customers.findUnique({
          where: { code: record.customer_code },
          include: { other_customers: { select: { code: true } } },
        });
        const groupCodes = root ? [root.code, ...root.other_customers.map((c) => c.code)] : [record.customer_code];

        await tx.sales_vouchers.updateMany({
          where: {
            customer_code: { in: groupCodes },
            is_billed: true,
            voucher_date: {
              lte: record.period_to,
              ...(record.period_from ? { gte: record.period_from } : {}),
            },
          },
          data: { is_billed: false },
        });
      }

      await tx.billing_closings.update({
        where: { id: BigInt(id) },
        data: { is_reversed: true },
      });
    });

    revalidatePath("/billing-closings");
    revalidatePath(`/billing-closings/${id}`);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "取り消しに失敗しました。" };
  }
}
