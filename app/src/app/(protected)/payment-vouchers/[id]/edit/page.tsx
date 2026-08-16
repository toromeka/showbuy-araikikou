import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PaymentVoucherForm } from "../../PaymentVoucherForm";

export default async function EditPaymentVoucherPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [voucher, suppliers, banks] = await Promise.all([
    prisma.payment_vouchers.findUnique({
      where: { id: BigInt(id) },
      include: { payment_voucher_lines: { orderBy: { line_no: "asc" } } },
    }),
    prisma.suppliers.findMany({
      where: { is_active: true },
      orderBy: { code: "asc" },
      select: { code: true, name1: true },
    }),
    prisma.banks.findMany({ orderBy: { code: "asc" }, select: { code: true, name: true } }),
  ]);

  if (!voucher) notFound();

  const defaults = {
    supplier_code: voucher.supplier_code,
    voucher_date: voucher.voucher_date.toISOString().slice(0, 10),
    period_from: voucher.period_from ? voucher.period_from.toISOString().slice(0, 10) : null,
    period_to: voucher.period_to ? voucher.period_to.toISOString().slice(0, 10) : null,
    billed_amount: voucher.billed_amount?.toString() ?? null,
    purchase_amount: voucher.purchase_amount?.toString() ?? null,
    tax_amount: voucher.tax_amount?.toString() ?? null,
    lines: voucher.payment_voucher_lines.map((l) => ({
      key: String(l.id),
      category: l.category ?? "現金",
      amount: l.amount.toString(),
      note: l.note ?? "",
      bank_code: l.bank_code ?? "",
      bill_due_date: l.bill_due_date ? l.bill_due_date.toISOString().slice(0, 10) : "",
    })),
  };

  return (
    <div>
      <h1 className="mb-6 text-lg font-bold text-slate-800">支払伝票 {voucher.voucher_no} - 編集</h1>
      <PaymentVoucherForm
        mode="edit"
        voucherId={id}
        suppliers={suppliers}
        banks={banks}
        defaults={defaults}
      />
    </div>
  );
}
