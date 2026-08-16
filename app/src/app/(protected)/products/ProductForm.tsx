"use client";

import { useActionState } from "react";
import type { ProductFormState } from "@/lib/actions/products";

type Option = { code: string; name: string };

type ProductDefaults = {
  code?: string;
  name?: string;
  spec?: string | null;
  kana?: string | null;
  unit_code?: string | null;
  sale_price_1?: unknown;
  sale_price_2?: unknown;
  sale_price_3?: unknown;
  standard_cost?: unknown;
};

export function ProductForm({
  action,
  defaults,
  unitOptions,
  isEdit,
}: {
  action: (state: ProductFormState, formData: FormData) => Promise<ProductFormState>;
  defaults?: ProductDefaults;
  unitOptions: Option[];
  isEdit: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, {});

  const dec = (v: unknown) => (v === null || v === undefined ? "" : String(v));

  return (
    <form action={formAction} className="max-w-2xl space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-bold text-slate-600">基本情報</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="商品コード" error={state.errors?.code}>
            <input name="code" defaultValue={defaults?.code} disabled={isEdit} required className="input" />
          </Field>
          <Field label="単位">
            <select name="unit_code" defaultValue={defaults?.unit_code ?? ""} className="input">
              <option value="">（未設定）</option>
              {unitOptions.map((u) => (
                <option key={u.code} value={u.code}>
                  {u.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="商品名" error={state.errors?.name}>
            <input name="name" defaultValue={defaults?.name} required className="input" />
          </Field>
          <Field label="規格">
            <input name="spec" defaultValue={defaults?.spec ?? ""} className="input" />
          </Field>
          <Field label="フリガナ">
            <input name="kana" defaultValue={defaults?.kana ?? ""} className="input" />
          </Field>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-bold text-slate-600">単価</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="売上単価1">
            <input
              type="number"
              step="0.01"
              name="sale_price_1"
              defaultValue={dec(defaults?.sale_price_1)}
              className="input"
            />
          </Field>
          <Field label="売上単価2">
            <input
              type="number"
              step="0.01"
              name="sale_price_2"
              defaultValue={dec(defaults?.sale_price_2)}
              className="input"
            />
          </Field>
          <Field label="売上単価3">
            <input
              type="number"
              step="0.01"
              name="sale_price_3"
              defaultValue={dec(defaults?.sale_price_3)}
              className="input"
            />
          </Field>
          <Field label="標準仕入単価">
            <input
              type="number"
              step="0.01"
              name="standard_cost"
              defaultValue={dec(defaults?.standard_cost)}
              className="input"
            />
          </Field>
        </div>
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
        <a href="/products" className="rounded px-6 py-2 text-sm text-slate-500 hover:bg-slate-100">
          キャンセル
        </a>
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
