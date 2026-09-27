"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleUserActive } from "@/lib/actions/users";

export function ToggleActiveButton({ id, isActive, name }: { id: string; isActive: boolean; name: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    const msg = isActive
      ? `${name} さんのアカウントを無効化します。無効化するとログインできなくなります（ログイン中の場合も、次の画面操作から使えなくなります）。よろしいですか？`
      : `${name} さんのアカウントを有効に戻します。よろしいですか？`;
    if (!confirm(msg)) return;
    startTransition(async () => {
      const result = await toggleUserActive(id);
      if (result.error) {
        alert(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <button type="button" onClick={handleClick} disabled={isPending} className="text-xs text-slate-500 hover:text-red-600">
      {isActive ? "無効化" : "有効化"}
    </button>
  );
}
