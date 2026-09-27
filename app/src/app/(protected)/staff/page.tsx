import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { toggleStaffActive } from "@/lib/actions/staff";

export default async function StaffPage() {
  // 担当者は数名〜数十名程度のため、ページ分けせず全件表示する
  const staff = await prisma.staff.findMany({
    orderBy: { code: "asc" },
    include: { departments: true },
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-800">担当者マスタ（{staff.length.toLocaleString()}件）</h1>
        <Link
          href="/staff/new"
          className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          + 新規登録
        </Link>
      </div>

      <p className="mb-4 text-xs text-slate-500">
        退職などで使わなくなった担当者は「無効化」してください。過去の伝票・得意先には残ったまま、入力画面の担当者の選択肢から外れます。
      </p>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left text-slate-600">
            <tr>
              <th className="px-4 py-2">コード</th>
              <th className="px-4 py-2">担当者名</th>
              <th className="px-4 py-2">部門</th>
              <th className="px-4 py-2">状態</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.code} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-2 font-mono">{s.code}</td>
                <td className="px-4 py-2">
                  <Link href={`/staff/${encodeURIComponent(s.code)}`} className="text-blue-600 hover:underline">
                    {s.name}
                  </Link>
                </td>
                <td className="px-4 py-2 text-slate-500">{s.departments?.name}</td>
                <td className="px-4 py-2">
                  {s.is_active ? (
                    <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">有効</span>
                  ) : (
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">無効</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  <form
                    action={async () => {
                      "use server";
                      await toggleStaffActive(s.code, s.is_active);
                    }}
                  >
                    <button type="submit" className="text-xs text-slate-500 hover:text-red-600">
                      {s.is_active ? "無効化" : "有効化"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {staff.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  担当者が登録されていません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
