import { prisma } from "@/lib/prisma";
import { ReceiptVoucherForm } from "../ReceiptVoucherForm";

export default async function NewReceiptVoucherPage() {
  const [customers, banks] = await Promise.all([
    prisma.customers.findMany({
      where: { is_active: true },
      orderBy: { code: "asc" },
      select: { code: true, name1: true },
    }),
    prisma.banks.findMany({ orderBy: { code: "asc" }, select: { code: true, name: true } }),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-lg font-bold text-slate-800">入金伝票 - 新規登録</h1>
      <ReceiptVoucherForm mode="create" customers={customers} banks={banks} />
    </div>
  );
}
