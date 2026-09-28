"use client";

import { useTransition } from "react";
import { resetUserPasswordToInitial } from "@/lib/actions/users";
import { INITIAL_PASSWORD } from "@/lib/initial-password";

// パスワードを忘れたユーザーのパスワードを、初期パスワードに戻す（管理者のみ）
export function ResetPasswordButton({ id, name }: { id: string; name: string }) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (
      !confirm(
        `${name} さんのパスワードを初期パスワード（${INITIAL_PASSWORD}）に戻します。\n本人はこのパスワードでログインし、すぐに新しいパスワードに変更してください。\n\nよろしいですか？`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await resetUserPasswordToInitial(id);
      alert(result.error ?? result.message);
    });
  }

  return (
    <button type="button" onClick={handleClick} disabled={isPending} className="text-xs text-slate-500 hover:text-blue-600">
      パスワードを初期値に戻す
    </button>
  );
}
