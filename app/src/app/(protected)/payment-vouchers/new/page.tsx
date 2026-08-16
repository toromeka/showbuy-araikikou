import { prisma } from "@/lib/prisma";
import { PaymentVoucherForm } from "../PaymentVoucherForm";

export default async function NewPaymentVoucherPage() {
  const [suppliers, banks] = await Promise.all([
    prisma.suppliers.findMany({
      where: { is_active: true },
      orderBy: { code: "asc" },
      select: { code: true, name1: true },
    }),
    prisma.banks.findMany({ orderBy: { code: "asc" }, select: { code: true, name: true } }),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-lg font-bold text-slate-800">支払伝票 - 新規登録</h1>
      <PaymentVoucherForm mode="create" suppliers={suppliers} banks={banks} />
    </div>
  );
}
