"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withVoucherNoRetry } from "@/lib/voucher-number";

export type QuotationLineInput = {
  level: number; // 0=明細行, 1以上=見出し行（階層タイプの場合のみ有効）
  product_code?: string | null;
  product_name: string;
  spec?: string | null;
  unit?: string | null;
  quantity?: number | null;
  cost_price?: number | null;
  quote_price?: number | null;
};

export type QuotationInput = {
  customer_code: string;
  staff_code?: string | null;
  quotation_date: string; // YYYY-MM-DD
  reference_no?: string | null;
  sub_no?: string | null;
  counterpart_staff?: string | null;
  project_name1?: string | null;
  project_name2?: string | null;
  delivery_terms?: string | null;
  delivery_place?: string | null;
  freight_terms?: string | null;
  payment_terms?: string | null;
  valid_until_text?: string | null;
  remarks?: string | null;
  is_hierarchical: boolean;
  tax_calculated: boolean;
  lines: QuotationLineInput[];
};

export type QuotationActionResult = { id?: string; error?: string };

function computeLines(lines: QuotationLineInput[], isHierarchical: boolean) {
  const named = lines.filter((l) => l.product_name?.trim());
  let quoteAmount = 0;
  let costAmount = 0;

  const lineData = named.map((l, idx) => {
    const level = isHierarchical ? Math.max(0, Number(l.level) || 0) : 0;
    if (level > 0) {
      return {
        line_no: idx + 1,
        level,
        product_code: null,
        product_name: l.product_name.trim(),
        spec: null,
        unit: null,
        quantity: null,
        cost_price: null,
        cost_amount: null,
        quote_price: null,
        quote_amount: null,
        gross_profit: null,
      };
    }
    const qty = Number(l.quantity) || 0;
    const costPrice = Number(l.cost_price) || 0;
    const quotePrice = Number(l.quote_price) || 0;
    const costAmt = Math.round(qty * costPrice * 100) / 100;
    const quoteAmt = Math.round(qty * quotePrice * 100) / 100;
    costAmount += costAmt;
    quoteAmount += quoteAmt;
    return {
      line_no: idx + 1,
      level: 0,
      product_code: l.product_code || null,
      product_name: l.product_name.trim(),
      spec: l.spec || null,
      unit: l.unit || null,
      quantity: qty,
      cost_price: l.cost_price != null ? costPrice : null,
      cost_amount: costAmt,
      quote_price: l.quote_price != null ? quotePrice : null,
      quote_amount: quoteAmt,
      gross_profit: quoteAmt - costAmt,
    };
  });

  return { lineData, quoteAmount, costAmount, grossProfit: quoteAmount - costAmount };
}

async function validateInput(input: QuotationInput): Promise<string | null> {
  if (!input.customer_code) return "得意先を選択してください。";
  if (!input.quotation_date) return "見積日を入力してください。";
  const namedLines = input.lines.filter((l) => l.product_name?.trim());
  if (namedLines.length === 0) return "明細を1行以上入力してください（品名が必要です）。";
  const customer = await prisma.customers.findUnique({ where: { code: input.customer_code } });
  if (!customer) return "指定された得意先が見つかりません。";
  return null;
}

export async function createQuotation(input: QuotationInput): Promise<QuotationActionResult> {
  const session = await auth();
  if (!session?.user) return { error: "ログインが必要です。" };
  const userId: string | null = session.user.id ?? null;

  const validationError = await validateInput(input);
  if (validationError) return { error: validationError };

  const quotationDate = new Date(input.quotation_date);
  const { lineData, quoteAmount, costAmount, grossProfit } = computeLines(
    input.lines,
    input.is_hierarchical,
  );

  try {
    const quotation = await withVoucherNoRetry("quotation", (voucherNo) =>
      prisma.$transaction(async (tx) => {
        const created = await tx.quotations.create({
          data: {
            voucher_no: voucherNo,
            reference_no: input.reference_no || null,
            customer_code: input.customer_code,
            staff_code: input.staff_code || null,
            sub_no: input.sub_no || null,
            quotation_date: quotationDate,
            counterpart_staff: input.counterpart_staff || null,
            project_name1: input.project_name1 || null,
            project_name2: input.project_name2 || null,
            delivery_terms: input.delivery_terms || null,
            delivery_place: input.delivery_place || null,
            freight_terms: input.freight_terms || null,
            payment_terms: input.payment_terms || null,
            valid_until_text: input.valid_until_text || null,
            remarks: input.remarks || null,
            is_hierarchical: input.is_hierarchical,
            tax_calculated: input.tax_calculated,
            quote_amount: quoteAmount,
            cost_amount: costAmount,
            gross_profit: grossProfit,
            created_by: userId,
          },
        });

        await tx.quotation_lines.createMany({
          data: lineData.map((l) => ({ ...l, quotation_id: created.id })),
        });

        return created;
      }),
    );

    revalidatePath("/quotations");
    return { id: quotation.id.toString() };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "登録に失敗しました。" };
  }
}

export async function updateQuotation(
  id: string,
  input: QuotationInput,
): Promise<QuotationActionResult> {
  const session = await auth();
  if (!session?.user) return { error: "ログインが必要です。" };

  const existing = await prisma.quotations.findUnique({ where: { id: BigInt(id) } });
  if (!existing) return { error: "対象の見積書が見つかりません。" };

  const validationError = await validateInput(input);
  if (validationError) return { error: validationError };

  const quotationDate = new Date(input.quotation_date);
  const { lineData, quoteAmount, costAmount, grossProfit } = computeLines(
    input.lines,
    input.is_hierarchical,
  );

  try {
    await prisma.$transaction(async (tx) => {
      await tx.quotations.update({
        where: { id: BigInt(id) },
        data: {
          reference_no: input.reference_no || null,
          customer_code: input.customer_code,
          staff_code: input.staff_code || null,
          sub_no: input.sub_no || null,
          quotation_date: quotationDate,
          counterpart_staff: input.counterpart_staff || null,
          project_name1: input.project_name1 || null,
          project_name2: input.project_name2 || null,
          delivery_terms: input.delivery_terms || null,
          delivery_place: input.delivery_place || null,
          freight_terms: input.freight_terms || null,
          payment_terms: input.payment_terms || null,
          valid_until_text: input.valid_until_text || null,
          remarks: input.remarks || null,
          is_hierarchical: input.is_hierarchical,
          tax_calculated: input.tax_calculated,
          quote_amount: quoteAmount,
          cost_amount: costAmount,
          gross_profit: grossProfit,
          updated_at: new Date(),
        },
      });
      await tx.quotation_lines.deleteMany({ where: { quotation_id: BigInt(id) } });
      await tx.quotation_lines.createMany({
        data: lineData.map((l) => ({ ...l, quotation_id: BigInt(id) })),
      });
    });

    revalidatePath("/quotations");
    revalidatePath(`/quotations/${id}`);
    return { id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "更新に失敗しました。" };
  }
}

export async function deleteQuotation(id: string): Promise<{ error?: string }> {
  const existing = await prisma.quotations.findUnique({ where: { id: BigInt(id) } });
  if (!existing) return { error: "対象の見積書が見つかりません。" };

  await prisma.quotations.delete({ where: { id: BigInt(id) } });
  revalidatePath("/quotations");
  return {};
}
