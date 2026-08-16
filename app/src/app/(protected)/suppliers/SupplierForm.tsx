"use client";

import { useActionState } from "react";
import type { SupplierFormState } from "@/lib/actions/suppliers";

type Option = { code: string; name: string };

type SupplierDefaults = {
  code?: string;
  name1?: string;
  name2?: string | null;
  short_name?: string | null;
  kana?: string | null;
  staff_code?: string | null;
  postal_code?: string | null;
  address1?: string | null;
  address2?: string | null;
  phone?: string | null;
  fax?: string | null;
  mobile?: string | null;
  closing_day?: number | null;
  payment_day?: number | null;
  tax_method?: number | null;
  calc_method?: number | null;
  rounding_method?: number | null;
  note?: string | null;
};

export function SupplierForm({
  action,
  defaults,
  staffOptions,
  isEdit,
}: {
  action: (state: SupplierFormState, formData: FormData) => Promise<SupplierFormState>;
  defaults?: SupplierDefaults;
  staffOptions: Option[];
  isEdit: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, {});

  return (
    <form action={formAction} className="max-w-3xl space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-bold text-slate-600">基本情報</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="仕入先コード" error={state.errors?.code}>
            <input name="code" defaultValue={defaults?.code} disabled={isEdit} required className="input" />
          </Field>
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
          <Field label="仕入先名称1" error={state.errors?.name1}>
            <input name="name1" defaultValue={defaults?.name1} required className="input" />
          </Field>
          <Field label="仕入先名称2">
            <input name="name2" defaultValue={defaults?.name2 ?? ""} className="input" />
          </Field>
          <Field label="仕入先略称">
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
        <h2 className="mb-4 text-sm font-bold text-slate-600">締め・支払・計算方式</h2>
        <div className="grid grid-cols-2 gap-4">
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
          <Field label="支払日">
            <input
              type="number"
              name="payment_day"
              min={1}
              max={31}
              defaultValue={defaults?.payment_day ?? ""}
              className="input"
            />
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
        <a href="/suppliers" className="rounded px-6 py-2 text-sm text-slate-500 hover:bg-slate-100">
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
