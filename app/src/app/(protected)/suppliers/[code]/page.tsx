import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updateSupplier } from "@/lib/actions/suppliers";
import { SupplierForm } from "../SupplierForm";

export default async function EditSupplierPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;

  const [supplier, staffOptions] = await Promise.all([
    prisma.suppliers.findUnique({ where: { code } }),
    prisma.staff.findMany({ where: { is_active: true }, orderBy: { code: "asc" } }),
  ]);

  if (!supplier) notFound();

  const updateWithCode = updateSupplier.bind(null, code);

  return (
    <div>
      <h1 className="mb-6 text-lg font-bold text-slate-800">仕入先マスタ - {supplier.name1} の編集</h1>
      <SupplierForm action={updateWithCode} defaults={supplier} staffOptions={staffOptions} isEdit />
    </div>
  );
}
