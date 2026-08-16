import { prisma } from "@/lib/prisma";
import { PurchaseVoucherForm } from "../PurchaseVoucherForm";

export default async function NewPurchaseVoucherPage() {
  const [suppliers, staffOptions, taxRateRows] = await Promise.all([
    prisma.suppliers.findMany({
      where: { is_active: true },
      orderBy: { code: "asc" },
      select: { code: true, name1: true, staff_code: true, rounding_method: true },
    }),
    prisma.staff.findMany({ where: { is_active: true }, orderBy: { code: "asc" } }),
    prisma.tax_rate_history.findMany({ orderBy: { starts_on: "asc" } }),
  ]);

  const taxRates = taxRateRows.map((t) => ({
    starts_on: t.starts_on.toISOString().slice(0, 10),
    rate: t.rate.toString(),
  }));

  return (
    <div>
      <h1 className="mb-6 text-lg font-bold text-slate-800">仕入伝票 - 新規登録</h1>
      <PurchaseVoucherForm mode="create" suppliers={suppliers} staffOptions={staffOptions} taxRates={taxRates} />
    </div>
  );
}
