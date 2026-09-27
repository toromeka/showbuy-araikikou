"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { UserFormState } from "@/lib/actions/users";

type Option = { code: string; name: string };

export function UserForm({
  action,
  defaults,
  staffOptions,
  isEdit,
}: {
  action: (state: UserFormState, formData: FormData) => Promise<UserFormState>;
  defaults?: { login_id: string; display_name: string; role: string; staff_code: string | null };
  staffOptions: Option[];
  isEdit: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, {});

  return (
    <form action={formAction} className="max-w-2xl space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="grid grid-cols-2 gap-4">
          <Field label="ログインID" error={state.errors?.login_id}>
            <input
              name="login_id"
              defaultValue={defaults?.login_id}
              disabled={isEdit}
              required
              autoComplete="off"
              className="input font-mono"
            />
          </Field>
          <Field label="表示名（画面右上に出る名前）" error={state.errors?.display_name}>
            <input name="display_name" defaultValue={defaults?.display_name} required className="input" />
          </Field>
          <Field label="権限" error={state.errors?.role}>
            <select name="role" defaultValue={defaults?.role ?? "staff"} className="input">
              <option value="staff">一般（普段の業務）</option>
              <option value="admin">管理者（ユーザー管理・データ移行も可）</option>
            </select>
          </Field>
          <Field label="担当者（担当者マスタとのひも付け）" error={state.errors?.staff_code}>
            <select name="staff_code" defaultValue={defaults?.staff_code ?? ""} className="input">
              <option value="">（なし）</option>
              {staffOptions.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.code} - {s.name}
                </option>
              ))}
            </select>
          </Field>
          {!isEdit && (
            <>
              <Field label="パスワード（8文字以上）" error={state.errors?.password}>
                <input type="password" name="password" required autoComplete="new-password" className="input" />
              </Field>
              <Field label="パスワード（確認）" error={state.errors?.password_confirm}>
                <input type="password" name="password_confirm" required autoComplete="new-password" className="input" />
              </Field>
            </>
          )}
        </div>
        {!isEdit && (
          <p className="mt-4 text-xs text-slate-400">
            ログインIDは登録後に変更できません。パスワードは本人に伝え、ログイン後に「パスワード変更」から自分で変えてもらってください。
          </p>
        )}
      </section>

      {state.message && <p className="text-sm text-red-600">{state.message}</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-blue-600 px-6 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {isPending ? "保存中..." : "保存"}
        </button>
        <Link href="/users" className="rounded px-6 py-2 text-sm text-slate-500 hover:bg-slate-100">
          キャンセル
        </Link>
      </div>
    </form>
  );
}

export function Field({ label, error, children }: { label: string; error?: string[]; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs text-red-600">{error.join(", ")}</span>}
    </label>
  );
}
