import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SalesVoucherForm } from "../../SalesVoucherForm";

export default async function EditSalesVoucherPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [voucher, customers, staffRows, taxRateRows] = await Promise.all([
    prisma.sales_vouchers.findUnique({
      where: { id: BigInt(id) },
      include: { sales_voucher_lines: { orderBy: { line_no: "asc" } } },
    }),
    prisma.customers.findMany({
      where: { is_active: true },
      orderBy: { code: "asc" },
      select: { code: true, name1: true, staff_code: true, rounding_method: true },
    }),
    // 有効な担当者と、この伝票の担当者（無効にした担当者でも）を選択肢にする（無効な担当者には「（無効）」と付ける）
    prisma.staff.findMany({ orderBy: { code: "asc" } }),
    prisma.tax_rate_history.findMany({ orderBy: { starts_on: "asc" } }),
  ]);

  if (!voucher) notFound();
  const staffOptions = staffRows
    .filter((s) => s.is_active || s.code === voucher.staff_code)
    .map((s) => ({ code: s.code, name: s.is_active ? s.name : `${s.name}（無効）` }));
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
      note2: l.note2 ?? "",
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
