import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updateStaff } from "@/lib/actions/staff";
import { StaffForm } from "../StaffForm";

export default async function EditStaffPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;

  const [staff, departmentOptions] = await Promise.all([
    prisma.staff.findUnique({ where: { code } }),
    prisma.departments.findMany({ orderBy: { code: "asc" } }),
  ]);

  if (!staff) notFound();

  const updateWithCode = updateStaff.bind(null, code);

  return (
    <div>
      <h1 className="mb-6 text-lg font-bold text-slate-800">担当者マスタ - {staff.name} の編集</h1>
      <StaffForm action={updateWithCode} defaults={staff} departmentOptions={departmentOptions} isEdit />
    </div>
  );
}
