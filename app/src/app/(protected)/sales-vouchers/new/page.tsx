import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { SalesVoucherForm } from "../SalesVoucherForm";

export default async function NewSalesVoucherPage() {
  const [me, customers, staffOptions, taxRateRows] = await Promise.all([
    getCurrentUser(),
    prisma.customers.findMany({
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
      <h1 className="mb-6 text-lg font-bold text-slate-800">売上伝票 - 新規登録</h1>
      {/* 担当者は、ログインしているユーザーに紐付いた担当者（ユーザー管理で設定）を最初から入れておく */}
      <SalesVoucherForm
        mode="create"
        customers={customers}
        staffOptions={staffOptions}
        taxRates={taxRates}
        initialStaffCode={staffOptions.some((s) => s.code === me?.staffCode) ? me?.staffCode : null}
      />
    </div>
  );
}
