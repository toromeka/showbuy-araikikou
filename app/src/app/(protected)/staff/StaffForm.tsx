"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { StaffFormState } from "@/lib/actions/staff";

type Option = { code: string; name: string };

type StaffDefaults = {
  code?: string;
  name?: string;
  department_code?: string | null;
};

export function StaffForm({
  action,
  defaults,
  departmentOptions,
  isEdit,
}: {
  action: (state: StaffFormState, formData: FormData) => Promise<StaffFormState>;
  defaults?: StaffDefaults;
  departmentOptions: Option[];
  isEdit: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, {});

  return (
    <form action={formAction} className="max-w-2xl space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="担当者コード" error={state.errors?.code}>
            <input name="code" defaultValue={defaults?.code} disabled={isEdit} required className="input" />
          </Field>
          <Field label="担当者名" error={state.errors?.name}>
            <input name="name" defaultValue={defaults?.name} required className="input" />
          </Field>
          <Field label="部門">
            <select name="department_code" defaultValue={defaults?.department_code ?? ""} className="input">
              <option value="">（未設定）</option>
              {departmentOptions.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.code} - {d.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {!isEdit && (
          <p className="mt-4 text-xs text-slate-400">
            担当者コードは、伝票・得意先マスタのCSVに書かれているコードと同じ書き方（例: 旧システムが「1」なら「1」）で登録してください。
            登録後はコードを変更できません。
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
        <Link href="/staff" className="rounded px-6 py-2 text-sm text-slate-500 hover:bg-slate-100">
          キャンセル
        </Link>
      </div>
    </form>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string[];
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs text-red-600">{error.join(", ")}</span>}
    </label>
  );
}
