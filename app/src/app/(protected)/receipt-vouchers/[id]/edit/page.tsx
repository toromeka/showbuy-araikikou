import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ReceiptVoucherForm } from "../../ReceiptVoucherForm";

export default async function EditReceiptVoucherPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [voucher, customers, banks] = await Promise.all([
    prisma.receipt_vouchers.findUnique({
      where: { id: BigInt(id) },
      include: { receipt_voucher_lines: { orderBy: { line_no: "asc" } } },
    }),
    prisma.customers.findMany({
      where: { is_active: true },
      orderBy: { code: "asc" },
      select: { code: true, name1: true },
    }),
    prisma.banks.findMany({ orderBy: { code: "asc" }, select: { code: true, name: true } }),
  ]);

  if (!voucher) notFound();

  const defaults = {
    customer_code: voucher.customer_code,
    voucher_date: voucher.voucher_date.toISOString().slice(0, 10),
    period_from: voucher.period_from ? voucher.period_from.toISOString().slice(0, 10) : null,
    period_to: voucher.period_to ? voucher.period_to.toISOString().slice(0, 10) : null,
    billed_amount: voucher.billed_amount?.toString() ?? null,
    sales_amount: voucher.sales_amount?.toString() ?? null,
    tax_amount: voucher.tax_amount?.toString() ?? null,
    print_receipt: voucher.print_receipt,
    lines: voucher.receipt_voucher_lines.map((l) => ({
      key: String(l.id),
      category: l.category ?? "現金",
      amount: l.amount.toString(),
      note: l.note ?? "",
      bank_code: l.bank_code ?? "",
      bill_due_date: l.bill_due_date ? l.bill_due_date.toISOString().slice(0, 10) : "",
      bill_no: l.bill_no ?? "",
    })),
  };

  return (
    <div>
      <h1 className="mb-6 text-lg font-bold text-slate-800">入金伝票 {voucher.voucher_no} - 編集</h1>
      <ReceiptVoucherForm
        mode="edit"
        voucherId={id}
        customers={customers}
        banks={banks}
        defaults={defaults}
      />
    </div>
  );
}
