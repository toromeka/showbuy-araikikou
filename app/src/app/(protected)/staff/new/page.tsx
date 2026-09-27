import { prisma } from "@/lib/prisma";
import { createStaff } from "@/lib/actions/staff";
import { StaffForm } from "../StaffForm";

export default async function NewStaffPage() {
  const departmentOptions = await prisma.departments.findMany({ orderBy: { code: "asc" } });

  return (
    <div>
      <h1 className="mb-6 text-lg font-bold text-slate-800">担当者マスタ - 新規登録</h1>
      <StaffForm action={createStaff} departmentOptions={departmentOptions} isEdit={false} />
    </div>
  );
}
