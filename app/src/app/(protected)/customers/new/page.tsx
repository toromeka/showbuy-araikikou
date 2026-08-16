import { prisma } from "@/lib/prisma";
import { createCustomer } from "@/lib/actions/customers";
import { CustomerForm } from "../CustomerForm";

export default async function NewCustomerPage() {
  const [staffOptions, regionOptions, category1Options, category2Options, category3Options] = await Promise.all([
    prisma.staff.findMany({ where: { is_active: true }, orderBy: { code: "asc" } }),
    prisma.regions.findMany({ orderBy: { code: "asc" } }),
    prisma.customer_category_1.findMany({ orderBy: { code: "asc" } }),
    prisma.customer_category_2.findMany({ orderBy: { code: "asc" } }),
    prisma.customer_category_3.findMany({ orderBy: { code: "asc" } }),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-lg font-bold text-slate-800">得意先マスタ - 新規登録</h1>
      <CustomerForm
        action={createCustomer}
        staffOptions={staffOptions}
        regionOptions={regionOptions}
        category1Options={category1Options}
        category2Options={category2Options}
        category3Options={category3Options}
        isEdit={false}
      />
    </div>
  );
}
