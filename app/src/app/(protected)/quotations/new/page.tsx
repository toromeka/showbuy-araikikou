import { prisma } from "@/lib/prisma";
import { QuotationForm } from "../QuotationForm";

export default async function NewQuotationPage() {
  const [customers, staffOptions] = await Promise.all([
    prisma.customers.findMany({
      where: { is_active: true },
      orderBy: { code: "asc" },
      select: { code: true, name1: true, staff_code: true },
    }),
    prisma.staff.findMany({ where: { is_active: true }, orderBy: { code: "asc" } }),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-lg font-bold text-slate-800">見積書 - 新規登録</h1>
      <QuotationForm mode="create" customers={customers} staffOptions={staffOptions} />
    </div>
  );
}
