"use client";

import { useActionState } from "react";
import type { UserFormState } from "@/lib/actions/users";
import { Field } from "./UserForm";

// パスワードの設定フォーム。管理者による再設定（askCurrent=false）と、本人による変更（askCurrent=true）で共通。
export function PasswordForm({
  action,
  askCurrent,
  submitLabel,
}: {
  action: (state: UserFormState, formData: FormData) => Promise<UserFormState>;
  askCurrent: boolean;
  submitLabel: string;
}) {
  const [state, formAction, isPending] = useActionState(action, {});

  return (
    <form action={formAction} className="max-w-2xl space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {askCurrent && (
          <div className="col-span-2 sm:col-span-1">
            <Field label="今のパスワード" error={state.errors?.current_password}>
              <input type="password" name="current_password" required autoComplete="current-password" className="input" />
            </Field>
          </div>
        )}
        {askCurrent && <div className="hidden sm:block" />}
        <Field label="新しいパスワード（8文字以上）" error={state.errors?.password}>
          <input type="password" name="password" required autoComplete="new-password" className="input" />
        </Field>
        <Field label="新しいパスワード（確認）" error={state.errors?.password_confirm}>
          <input type="password" name="password_confirm" required autoComplete="new-password" className="input" />
        </Field>
      </div>
      {state.message && (
        <p className={`text-sm ${state.done ? "text-green-700" : "text-red-600"}`}>{state.message}</p>
      )}
      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-blue-600 px-6 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {isPending ? "変更中..." : submitLabel}
      </button>
    </form>
  );
}
