import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updateCustomer } from "@/lib/actions/customers";
import { CustomerForm } from "../CustomerForm";

export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;

  const [customer, staffOptions, regionOptions, category1Options, category2Options, category3Options] =
    await Promise.all([
      prisma.customers.findUnique({ where: { code } }),
      prisma.staff.findMany({ where: { is_active: true }, orderBy: { code: "asc" } }),
      prisma.regions.findMany({ orderBy: { code: "asc" } }),
      prisma.customer_category_1.findMany({ orderBy: { code: "asc" } }),
      prisma.customer_category_2.findMany({ orderBy: { code: "asc" } }),
      prisma.customer_category_3.findMany({ orderBy: { code: "asc" } }),
    ]);

  if (!customer) notFound();

  const updateWithCode = updateCustomer.bind(null, code);
  // 小数（Decimal）の項目は、そのままでは画面側（クライアント）に渡せないため、
  // 掛率は文字列にし、画面で使わない稼動時残高は渡さない
  const { opening_balance, ...customerFields } = customer;
  void opening_balance;

  return (
    <div>
      <h1 className="mb-6 text-lg font-bold text-slate-800">得意先マスタ - {customer.name1} の編集</h1>
      <CustomerForm
        action={updateWithCode}
        defaults={{ ...customerFields, markup_rate: customer.markup_rate?.toString() ?? null }}
        staffOptions={staffOptions}
        regionOptions={regionOptions}
        category1Options={category1Options}
        category2Options={category2Options}
        category3Options={category3Options}
        isEdit
      />
    </div>
  );
}
