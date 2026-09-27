import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { ToggleActiveButton } from "./ToggleActiveButton";

const ROLE_LABEL: Record<string, string> = { admin: "管理者", staff: "一般" };

export default async function UsersPage() {
  const me = await getCurrentUser();
  if (!isAdmin(me)) return <p className="text-sm text-slate-500">この画面は管理者のみ利用できます。</p>;

  const users = await prisma.users.findMany({
    orderBy: [{ is_active: "desc" }, { login_id: "asc" }],
    include: { staff: true },
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-800">ユーザー管理（{users.length}件）</h1>
        <Link href="/users/new" className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
          + ユーザーを追加
        </Link>
      </div>
      <p className="mb-4 text-xs text-slate-500">
        システムにログインするアカウントの一覧です。使わなくなったアカウントは「無効化」してください（伝票の登録者の記録は残ります）。
      </p>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left text-slate-600">
            <tr>
              <th className="px-4 py-2">ログインID</th>
              <th className="px-4 py-2">表示名</th>
              <th className="px-4 py-2">権限</th>
              <th className="px-4 py-2">担当者</th>
              <th className="px-4 py-2">状態</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-2 font-mono">
                  <Link href={`/users/${u.id}`} className="text-blue-600 hover:underline">
                    {u.login_id}
                  </Link>
                  {u.id === me?.id && <span className="ml-2 text-xs text-slate-400">（自分）</span>}
                </td>
                <td className="px-4 py-2">{u.display_name}</td>
                <td className="px-4 py-2">{ROLE_LABEL[u.role] ?? u.role}</td>
                <td className="px-4 py-2 text-slate-500">{u.staff ? `${u.staff.code} - ${u.staff.name}` : ""}</td>
                <td className="px-4 py-2">
                  {u.is_active ? (
                    <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">有効</span>
                  ) : (
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">無効</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  <ToggleActiveButton id={u.id} isActive={u.is_active} name={u.display_name} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
