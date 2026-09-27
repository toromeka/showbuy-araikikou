import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export type CurrentUser = {
  id: string;
  loginId: string;
  name: string;
  role: string;
  staffCode: string | null;
};

// ログイン中のユーザーを、ログイン時の情報（セッション）ではなくDBの最新の状態で返す。
// 管理者がユーザーを無効化したり権限を変えたりしたとき、本人が再ログインするまで待たずに反映させるため。
// 無効化されたユーザー・削除されたユーザーは null。
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const user = await prisma.users.findUnique({
    where: { id },
    select: { id: true, login_id: true, display_name: true, role: true, staff_code: true, is_active: true },
  });
  if (!user || !user.is_active) return null;
  return { id: user.id, loginId: user.login_id, name: user.display_name, role: user.role, staffCode: user.staff_code };
}

export const isAdmin = (user: CurrentUser | null) => user?.role === "admin";
