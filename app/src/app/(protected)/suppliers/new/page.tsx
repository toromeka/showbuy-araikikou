import { prisma } from "@/lib/prisma";
import { createSupplier } from "@/lib/actions/suppliers";
import { SupplierForm } from "../SupplierForm";

export default async function NewSupplierPage() {
  const staffOptions = await prisma.staff.findMany({ where: { is_active: true }, orderBy: { code: "asc" } });

  return (
    <div>
      <h1 className="mb-6 text-lg font-bold text-slate-800">仕入先マスタ - 新規登録</h1>
      <SupplierForm action={createSupplier} staffOptions={staffOptions} isEdit={false} />
    </div>
  );
}
