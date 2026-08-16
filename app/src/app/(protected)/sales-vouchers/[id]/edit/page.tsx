import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SalesVoucherForm } from "../../SalesVoucherForm";

export default async function EditSalesVoucherPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [voucher, customers, staffOptions, taxRateRows] = await Promise.all([
    prisma.sales_vouchers.findUnique({
      where: { id: BigInt(id) },
      include: { sales_voucher_lines: { orderBy: { line_no: "asc" } } },
    }),
    prisma.customers.findMany({
      where: { is_active: true },
      orderBy: { code: "asc" },
      select: { code: true, name1: true, staff_code: true, rounding_method: true },
    }),
    prisma.staff.findMany({ where: { is_active: true }, orderBy: { code: "asc" } }),
    prisma.tax_rate_history.findMany({ orderBy: { starts_on: "asc" } }),
  ]);

  if (!voucher) notFound();
  if (voucher.is_billed) {
    return (
      <div>
        <h1 className="mb-4 text-lg font-bold text-slate-800">売上伝票 {voucher.voucher_no}</h1>
        <p className="rounded bg-amber-50 px-4 py-3 text-sm text-amber-700">
          この伝票は請求確定済みのため編集できません。
        </p>
      </div>
    );
  }

  const taxRates = taxRateRows.map((t) => ({
    starts_on: t.starts_on.toISOString().slice(0, 10),
    rate: t.rate.toString(),
  }));

  const defaults = {
    customer_code: voucher.customer_code,
    voucher_date: voucher.voucher_date.toISOString().slice(0, 10),
    staff_code: voucher.staff_code,
    is_cash_sale: voucher.is_cash_sale,
    remarks: voucher.remarks,
    lines: voucher.sales_voucher_lines.map((l) => ({
      key: String(l.id),
      product_code: l.product_code ?? "",
      product_name: l.product_name,
      spec: l.spec ?? "",
      unit: l.unit ?? "",
      quantity: l.quantity.toString(),
      cost_price: l.cost_price?.toString() ?? "",
      sale_price: l.sale_price?.toString() ?? "",
      note: l.note ?? "",
    })),
  };

  return (
    <div>
      <h1 className="mb-6 text-lg font-bold text-slate-800">売上伝票 {voucher.voucher_no} - 編集</h1>
      <SalesVoucherForm
        mode="edit"
        voucherId={id}
        customers={customers}
        staffOptions={staffOptions}
        taxRates={taxRates}
        defaults={defaults}
      />
    </div>
  );
}
