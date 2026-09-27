import Link from "next/link";
import { signOut } from "@/auth";
import { getCurrentUser, isAdmin } from "@/lib/current-user";

const NAV_ITEMS = [
  { href: "/", label: "ホーム" },
  { href: "/sales-vouchers", label: "売上伝票" },
  { href: "/purchase-vouchers", label: "仕入伝票" },
  { href: "/receipt-vouchers", label: "入金伝票" },
  { href: "/payment-vouchers", label: "支払伝票" },
  { href: "/quotations", label: "見積書" },
  { href: "/billing-closings", label: "請求更新" },
  { href: "/payment-closings", label: "仕入支払更新" },
  { href: "/inventory-ledger", label: "商品受払台帳" },
  { href: "/customers", label: "得意先マスタ" },
  { href: "/suppliers", label: "仕入先マスタ" },
  { href: "/products", label: "商品マスタ" },
  { href: "/staff", label: "担当者マスタ" },
];

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  // ログイン時の情報ではなくDBの最新の状態を見る（無効化・権限変更をすぐ反映するため）
  const user = await getCurrentUser();
  // 自社情報・ユーザー管理・データ移行（旧システムの伝票の取り込み）は管理者だけに表示する
  const navItems = isAdmin(user)
    ? [
        ...NAV_ITEMS,
        { href: "/company-settings", label: "自社情報" },
        { href: "/users", label: "ユーザー管理" },
        { href: "/data-migration", label: "データ移行" },
      ]
    : NAV_ITEMS;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <div className="flex items-center gap-8">
          <span className="text-base font-bold text-slate-800">荒井機工 販売管理システム</span>
          <nav className="flex flex-wrap gap-5">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-sm text-slate-600 hover:text-blue-600"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-500">{user?.name} さん</span>
          {user && (
            <Link href="/account/password" className="text-sm text-slate-500 hover:text-blue-600">
              パスワード変更
            </Link>
          )}
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button type="submit" className="text-sm text-slate-500 hover:text-red-600">
              ログアウト
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        {user ? (
          children
        ) : (
          <p className="rounded bg-red-50 px-4 py-3 text-sm text-red-700">
            このアカウントは無効化されているため、利用できません。ログアウトして、管理者に確認してください。
          </p>
        )}
      </main>
    </div>
  );
}
