import { prisma } from "@/lib/prisma";
import { createUser } from "@/lib/actions/users";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { UserForm } from "../UserForm";

export default async function NewUserPage() {
  if (!isAdmin(await getCurrentUser())) {
    return <p className="text-sm text-slate-500">この画面は管理者のみ利用できます。</p>;
  }
  const staffOptions = await prisma.staff.findMany({ where: { is_active: true }, orderBy: { code: "asc" } });

  return (
    <div>
      <h1 className="mb-6 text-lg font-bold text-slate-800">ユーザー管理 - ユーザーを追加</h1>
      <UserForm action={createUser} staffOptions={staffOptions} isEdit={false} />
    </div>
  );
}
