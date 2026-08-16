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

  const [customer, staffOptions, regionOptions] = await Promise.all([
    prisma.customers.findUnique({ where: { code } }),
    prisma.staff.findMany({ where: { is_active: true }, orderBy: { code: "asc" } }),
    prisma.regions.findMany({ orderBy: { code: "asc" } }),
  ]);

  if (!customer) notFound();

  const updateWithCode = updateCustomer.bind(null, code);

  return (
    <div>
      <h1 className="mb-6 text-lg font-bold text-slate-800">得意先マスタ - {customer.name1} の編集</h1>
      <CustomerForm
        action={updateWithCode}
        defaults={customer}
        staffOptions={staffOptions}
        regionOptions={regionOptions}
        isEdit
      />
    </div>
  );
}
