import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { QuotationForm } from "../../QuotationForm";

export default async function EditQuotationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [quotation, customers, staffOptions] = await Promise.all([
    prisma.quotations.findUnique({
      where: { id: BigInt(id) },
      include: { quotation_lines: { orderBy: { line_no: "asc" } } },
    }),
    prisma.customers.findMany({
      where: { is_active: true },
      orderBy: { code: "asc" },
      select: { code: true, name1: true, staff_code: true },
    }),
    prisma.staff.findMany({ where: { is_active: true }, orderBy: { code: "asc" } }),
  ]);

  if (!quotation) notFound();

  const defaults = {
    customer_code: quotation.customer_code,
    staff_code: quotation.staff_code,
    quotation_date: quotation.quotation_date.toISOString().slice(0, 10),
    reference_no: quotation.reference_no,
    sub_no: quotation.sub_no,
    counterpart_staff: quotation.counterpart_staff,
    project_name1: quotation.project_name1,
    project_name2: quotation.project_name2,
    delivery_terms: quotation.delivery_terms,
    delivery_place: quotation.delivery_place,
    freight_terms: quotation.freight_terms,
    payment_terms: quotation.payment_terms,
    valid_until_text: quotation.valid_until_text,
    remarks: quotation.remarks,
    is_hierarchical: quotation.is_hierarchical,
    tax_calculated: quotation.tax_calculated,
    lines: quotation.quotation_lines.map((l) => ({
      key: String(l.id),
      level: l.level,
      product_code: l.product_code ?? "",
      product_name: l.product_name ?? "",
      spec: l.spec ?? "",
      unit: l.unit ?? "",
      quantity: l.quantity?.toString() ?? "",
      cost_price: l.cost_price?.toString() ?? "",
      quote_price: l.quote_price?.toString() ?? "",
    })),
  };

  return (
    <div>
      <h1 className="mb-6 text-lg font-bold text-slate-800">見積書 {quotation.voucher_no} - 編集</h1>
      <QuotationForm
        mode="edit"
        quotationId={id}
        customers={customers}
        staffOptions={staffOptions}
        defaults={defaults}
      />
    </div>
  );
}
