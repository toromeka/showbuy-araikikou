"use client";

import { useActionState } from "react";
import type { CustomerFormState } from "@/lib/actions/customers";

type Option = { code: string; name: string };

type CustomerDefaults = {
  code?: string;
  name1?: string;
  name2?: string | null;
  short_name?: string | null;
  kana?: string | null;
  honorific?: string | null;
  staff_code?: string | null;
  region_code?: string | null;
  postal_code?: string | null;
  address1?: string | null;
  address2?: string | null;
  phone?: string | null;
  fax?: string | null;
  mobile?: string | null;
  closing_day?: number | null;
  collection_day?: number | null;
  collection_type?: string | null;
  collection_note?: string | null;
  billing_customer_code?: string | null;
  category1_code?: string | null;
  category2_code?: string | null;
  category3_code?: string | null;
  price_rank?: number | null;
  markup_rate?: unknown;
  tax_method?: number | null;
  calc_method?: number | null;
  rounding_method?: number | null;
  note?: string | null;
};

export function CustomerForm({
  action,
  defaults,
  staffOptions,
  regionOptions,
  category1Options,
  category2Options,
  category3Options,
  isEdit,
}: {
  action: (state: CustomerFormState, formData: FormData) => Promise<CustomerFormState>;
  defaults?: CustomerDefaults;
  staffOptions: Option[];
  regionOptions: Option[];
  category1Options: Option[];
  category2Options: Option[];
  category3Options: Option[];
  isEdit: boolean;
}) {
  const dec = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  const [state, formAction, isPending] = useActionState(action, {});

  return (
    <form action={formAction} className="max-w-3xl space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-bold text-slate-600">基本情報</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="得意先コード" error={state.errors?.code}>
            <input
              name="code"
              defaultValue={defaults?.code}
              disabled={isEdit}
              required
              className="input"
            />
          </Field>
          <Field label="敬称">
            <input name="honorific" defaultValue={defaults?.honorific ?? ""} className="input" placeholder="御中" />
          </Field>
          <Field label="得意先名称1" error={state.errors?.name1}>
            <input name="name1" defaultValue={defaults?.name1} required className="input" />
          </Field>
          <Field label="得意先名称2">
            <input name="name2" defaultValue={defaults?.name2 ?? ""} className="input" />
          </Field>
          <Field label="得意先略称">
            <input name="short_name" defaultValue={defaults?.short_name ?? ""} className="input" />
          </Field>
          <Field label="フリガナ">
            <input name="kana" defaultValue={defaults?.kana ?? ""} className="input" />
          </Field>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-bold text-slate-600">連絡先</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="郵便番号">
            <input name="postal_code" defaultValue={defaults?.postal_code ?? ""} className="input" />
          </Field>
          <div />
          <Field label="住所1">
            <input name="address1" defaultValue={defaults?.address1 ?? ""} className="input" />
          </Field>
          <Field label="住所2">
            <input name="address2" defaultValue={defaults?.address2 ?? ""} className="input" />
          </Field>
          <Field label="電話番号">
            <input name="phone" defaultValue={defaults?.phone ?? ""} className="input" />
          </Field>
          <Field label="FAX番号">
            <input name="fax" defaultValue={defaults?.fax ?? ""} className="input" />
          </Field>
          <Field label="携帯番号">
            <input name="mobile" defaultValue={defaults?.mobile ?? ""} className="input" />
          </Field>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-bold text-slate-600">担当・請求・締め</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="担当者">
            <select name="staff_code" defaultValue={defaults?.staff_code ?? ""} className="input">
              <option value="">（未設定）</option>
              {staffOptions.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.code} - {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="地区">
            <select name="region_code" defaultValue={defaults?.region_code ?? ""} className="input">
              <option value="">（未設定）</option>
              {regionOptions.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.code} - {r.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="締日">
            <input
              type="number"
              name="closing_day"
              min={1}
              max={31}
              defaultValue={defaults?.closing_day ?? ""}
              className="input"
            />
          </Field>
          <Field label="集金日">
            <input
              type="number"
              name="collection_day"
              min={1}
              max={31}
              defaultValue={defaults?.collection_day ?? ""}
              className="input"
            />
          </Field>
          <Field label="請求先コード（グループ請求先）">
            <input
              name="billing_customer_code"
              defaultValue={defaults?.billing_customer_code ?? ""}
              placeholder="請求をまとめる先の得意先コード"
              className="input"
            />
          </Field>
          <Field label="集金区分">
            <input name="collection_type" defaultValue={defaults?.collection_type ?? ""} className="input" />
          </Field>
          <Field label="集金備考">
            <input name="collection_note" defaultValue={defaults?.collection_note ?? ""} className="input" />
          </Field>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-bold text-slate-600">分類・単価・計算方式</h2>
        <div className="grid grid-cols-2 gap-4">
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
          <Field label="売上単価ランク">
            <input
              type="number"
              name="price_rank"
              min={1}
              max={5}
              defaultValue={defaults?.price_rank ?? ""}
              className="input"
            />
          </Field>
          <Field label="掛率">
            <input type="number" step="0.001" name="markup_rate" defaultValue={dec(defaults?.markup_rate)} className="input" />
          </Field>
          <Field label="課税方式">
            <select name="tax_method" defaultValue={defaults?.tax_method ?? 0} className="input">
              <option value={0}>外税</option>
              <option value={1}>内税</option>
            </select>
          </Field>
          <Field label="計算方式">
            <select name="calc_method" defaultValue={defaults?.calc_method ?? 0} className="input">
              <option value={0}>請求単位</option>
              <option value={1}>明細単位</option>
            </select>
          </Field>
          <Field label="丸め方式">
            <select name="rounding_method" defaultValue={defaults?.rounding_method ?? 0} className="input">
              <option value={0}>四捨五入</option>
              <option value={1}>切捨て</option>
              <option value={2}>切上げ</option>
            </select>
          </Field>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-bold text-slate-600">備考</h2>
        <textarea name="note" defaultValue={defaults?.note ?? ""} rows={3} className="input" />
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
        <a href="/customers" className="rounded px-6 py-2 text-sm text-slate-500 hover:bg-slate-100">
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
