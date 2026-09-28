"use client";

import { useActionState } from "react";
import { updateCompanySettings } from "@/lib/actions/company-settings";

type Defaults = {
  company_name: string;
  postal_code: string;
  address1: string;
  address2: string;
  phone: string;
  fax: string;
  invoice_registration_no: string;
};

export function CompanySettingsForm({ defaults }: { defaults: Defaults }) {
  const [state, formAction, isPending] = useActionState(updateCompanySettings, {});

  return (
    <form action={formAction} className="max-w-2xl space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="会社名" error={state.errors?.company_name} note="例: 有限会社荒井機工（「有限会社」は小さく、社名は字間を空けて印刷されます）">
            <input name="company_name" defaultValue={defaults.company_name} required className="input" />
          </Field>
          <Field label="郵便番号" error={state.errors?.postal_code} note="例: 920-0106（〒は自動で付きます）">
            <input name="postal_code" defaultValue={defaults.postal_code} className="input" />
          </Field>
          <Field label="住所1" error={state.errors?.address1} note="例: 金沢市今町ホ19-1">
            <input name="address1" defaultValue={defaults.address1} className="input" />
          </Field>
          <Field label="住所2" error={state.errors?.address2}>
            <input name="address2" defaultValue={defaults.address2} className="input" />
          </Field>
          <Field label="TEL" error={state.errors?.phone} note="例: (076)257-0811(代)">
            <input name="phone" defaultValue={defaults.phone} className="input" />
          </Field>
          <Field label="FAX" error={state.errors?.fax} note="例: (076)257-5331">
            <input name="fax" defaultValue={defaults.fax} className="input" />
          </Field>
          <Field label="適格請求書発行事業者の登録番号" error={state.errors?.invoice_registration_no} note="請求書に印刷されます（例: T1234567890123）">
            <input name="invoice_registration_no" defaultValue={defaults.invoice_registration_no} className="input" />
          </Field>
        </div>
      </section>

      {state.message && <p className="text-sm text-red-600">{state.message}</p>}
      {state.done && <p className="text-sm text-green-700">保存しました。</p>}

      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-blue-600 px-6 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {isPending ? "保存中..." : "保存"}
      </button>
    </form>
  );
}

function Field({
  label,
  error,
  note,
  children,
}: {
  label: string;
  error?: string[];
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
      {note && <span className="mt-1 block text-xs text-slate-400">{note}</span>}
      {error && <span className="mt-1 block text-xs text-red-600">{error.join(", ")}</span>}
    </label>
  );
}
