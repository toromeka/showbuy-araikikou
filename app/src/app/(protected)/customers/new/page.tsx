import { prisma } from "@/lib/prisma";
import { createCustomer } from "@/lib/actions/customers";
import { CustomerForm } from "../CustomerForm";

export default async function NewCustomerPage() {
  const [staffOptions, regionOptions] = await Promise.all([
    prisma.staff.findMany({ where: { is_active: true }, orderBy: { code: "asc" } }),
    prisma.regions.findMany({ orderBy: { code: "asc" } }),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-lg font-bold text-slate-800">得意先マスタ - 新規登録</h1>
      <CustomerForm
        action={createCustomer}
        staffOptions={staffOptions}
        regionOptions={regionOptions}
        isEdit={false}
      />
    </div>
  );
}
