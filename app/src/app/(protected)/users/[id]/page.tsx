import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { resetUserPassword, updateUser } from "@/lib/actions/users";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { UserForm } from "../UserForm";
import { PasswordForm } from "../PasswordForm";

export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  if (!isAdmin(await getCurrentUser())) {
    return <p className="text-sm text-slate-500">この画面は管理者のみ利用できます。</p>;
  }
  const { id } = await params;
  // idはUUID。形式が違うURLはDBに問い合わせる前に「見つからない」扱いにする
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [user, staffOptions] = await Promise.all([
    prisma.users.findUnique({ where: { id } }),
    prisma.staff.findMany({ where: { is_active: true }, orderBy: { code: "asc" } }),
  ]);
  if (!user) notFound();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-6 text-lg font-bold text-slate-800">ユーザー管理 - {user.display_name} の編集</h1>
        <UserForm
          action={updateUser.bind(null, id)}
          defaults={{ login_id: user.login_id, display_name: user.display_name, role: user.role, staff_code: user.staff_code }}
          staffOptions={staffOptions}
          isEdit
        />
      </div>
      <section className="max-w-2xl rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-1 text-sm font-bold text-slate-600">パスワードの再設定</h2>
        <p className="mb-4 text-xs text-slate-500">
          本人がパスワードを忘れたときに使います。新しいパスワードを本人に伝え、ログイン後に自分で変えてもらってください。
        </p>
        <PasswordForm action={resetUserPassword.bind(null, id)} askCurrent={false} submitLabel="パスワードを再設定" />
      </section>
    </div>
  );
}
