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
  tax_category?: number | null;
  stock_managed?: boolean;
  cost_category?: number | null;
  major_class_code?: string | null;
  middle_class_code?: string | null;
  minor_class_code?: string | null;
  category1_code?: string | null;
  category2_code?: string | null;
  category3_code?: string | null;
  sale_price_1?: unknown;
  sale_price_2?: unknown;
  sale_price_3?: unknown;
  sale_price_4?: unknown;
  sale_price_5?: unknown;
  standard_cost?: unknown;
  last_cost?: unknown;
  moving_avg_cost?: unknown;
};

export function ProductForm({
  action,
  defaults,
  unitOptions,
  majorClassOptions,
  middleClassOptions,
  minorClassOptions,
  category1Options,
  category2Options,
  category3Options,
  isEdit,
}: {
  action: (state: ProductFormState, formData: FormData) => Promise<ProductFormState>;
  defaults?: ProductDefaults;
  unitOptions: Option[];
  majorClassOptions: Option[];
  middleClassOptions: Option[];
  minorClassOptions: Option[];
  category1Options: Option[];
  category2Options: Option[];
  category3Options: Option[];
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
          <Field label="消費税区分">
            <input
              type="number"
              name="tax_category"
              defaultValue={defaults?.tax_category ?? 0}
              className="input"
            />
          </Field>
          <Field label="原価区分">
            <input
              type="number"
              name="cost_category"
              defaultValue={defaults?.cost_category ?? 0}
              className="input"
            />
          </Field>
          <label className="flex items-center gap-2 pt-6">
            <input
              type="checkbox"
              name="stock_managed"
              defaultChecked={defaults?.stock_managed ?? true}
              className="h-4 w-4"
            />
            <span className="text-sm text-slate-700">在庫管理する</span>
          </label>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-bold text-slate-600">分類</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="大分類コード">
            <select name="major_class_code" defaultValue={defaults?.major_class_code ?? ""} className="input">
              <option value="">（未設定）</option>
              {majorClassOptions.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} - {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="中分類コード">
            <select name="middle_class_code" defaultValue={defaults?.middle_class_code ?? ""} className="input">
              <option value="">（未設定）</option>
              {middleClassOptions.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} - {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="小分類コード">
            <select name="minor_class_code" defaultValue={defaults?.minor_class_code ?? ""} className="input">
              <option value="">（未設定）</option>
              {minorClassOptions.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} - {c.name}
                </option>
              ))}
            </select>
          </Field>
          <div />
          <Field label="分類区分1">
            <select name="category1_code" defaultValue={defaults?.category1_code ?? ""} className="input">
              <option value="">（未設定）</option>
              {category1Options.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} - {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="分類区分2">
            <select name="category2_code" defaultValue={defaults?.category2_code ?? ""} className="input">
              <option value="">（未設定）</option>
              {category2Options.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} - {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="分類区分3">
            <select name="category3_code" defaultValue={defaults?.category3_code ?? ""} className="input">
              <option value="">（未設定）</option>
              {category3Options.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} - {c.name}
                </option>
              ))}
            </select>
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
          <Field label="売上単価4">
            <input
              type="number"
              step="0.01"
              name="sale_price_4"
              defaultValue={dec(defaults?.sale_price_4)}
              className="input"
            />
          </Field>
          <Field label="売上単価5">
            <input
              type="number"
              step="0.01"
              name="sale_price_5"
              defaultValue={dec(defaults?.sale_price_5)}
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
          <Field label="最終仕入単価">
            <input
              type="number"
              step="0.01"
              name="last_cost"
              defaultValue={dec(defaults?.last_cost)}
              className="input"
            />
          </Field>
          <Field label="移動平均単価">
            <input
              type="number"
              step="0.0001"
              name="moving_avg_cost"
              defaultValue={dec(defaults?.moving_avg_cost)}
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
