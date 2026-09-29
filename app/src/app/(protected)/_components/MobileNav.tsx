"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { workColorFor } from "@/lib/work-colors";

type NavItem = { href: string; label: string };

// スマホ・タブレット（幅768px未満）用のメニュー。画面上部に会社名と「メニュー」ボタンだけを出し、
// ボタンで開いたときに、各画面へのリンクを押しやすい大きさで並べる。パソコンでは表示しない。
export function MobileNav({
  items,
  userName,
  logout,
}: {
  items: NavItem[];
  userName: string | null | undefined;
  logout: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const isCurrent = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));
  const close = () => setOpen(false);

  return (
    <div className="md:hidden">
      <div className="flex items-center justify-between px-4 py-2.5">
        <Link href="/" onClick={close} className="text-base font-bold text-slate-800">
          荒井機工 販売管理
        </Link>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex items-center gap-1.5 rounded border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 active:bg-slate-100"
        >
          <span aria-hidden className="text-lg leading-none">
            {open ? "×" : "≡"}
          </span>
          {open ? "閉じる" : "メニュー"}
        </button>
      </div>
      {open && (
        <nav className="max-h-[calc(100dvh-3.5rem)] overflow-y-auto border-t border-slate-200 px-4 pt-3 pb-4">
          <div className="grid grid-cols-2 gap-2">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={close}
                // 作業ごとの背景色と同じ色を付けて、色と作業の対応を覚えやすくする
                style={workColorFor(item.href) && !isCurrent(item.href) ? { backgroundColor: workColorFor(item.href)! } : undefined}
                className={`rounded border px-3 py-3 text-sm ${
                  isCurrent(item.href)
                    ? "border-blue-600 bg-blue-50 font-semibold text-blue-700"
                    : "border-slate-200 text-slate-700 active:bg-slate-100"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3 text-sm text-slate-500">
            <span>{userName} さん</span>
            <div className="flex gap-2">
              <Link href="/account/password" onClick={close} className="rounded border border-slate-200 px-3 py-2 active:bg-slate-100">
                パスワード変更
              </Link>
              <form action={logout}>
                <button type="submit" className="rounded border border-slate-200 px-3 py-2 text-red-600 active:bg-slate-100">
                  ログアウト
                </button>
              </form>
            </div>
          </div>
        </nav>
      )}
    </div>
  );
}
