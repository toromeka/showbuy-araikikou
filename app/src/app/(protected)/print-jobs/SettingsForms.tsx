"use client";

import { useActionState } from "react";
import { issueAgentKey, updatePrintTrays } from "@/lib/actions/print";
import { CASSETTE_OPTIONS, DOC_TYPES } from "@/lib/print/labels";

export function PrintTraysForm({ defaults }: { defaults: Record<string, number> }) {
  const [state, formAction, isPending] = useActionState(updatePrintTrays, {});
  return (
    <form action={formAction} className="space-y-4">
      <div className="grid max-w-xl grid-cols-[6rem_1fr] items-center gap-3">
        {Object.entries(DOC_TYPES).map(([key, label]) => (
          <label key={key} className="contents">
            <span className="text-sm text-slate-700">{label}</span>
            <select name={key} defaultValue={defaults[key]} className="input">
              {CASSETTE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
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

export function AgentKeyForm() {
  const [state, formAction, isPending] = useActionState(issueAgentKey, {});
  return (
    <form action={formAction} className="space-y-3">
      <div className="flex max-w-xl items-end gap-3">
        <label className="block flex-1">
          <span className="mb-1 block text-xs font-medium text-slate-600">パソコンの名前</span>
          <input name="name" placeholder="例: 事務所の印刷用PC" className="input" />
        </label>
        <button
          type="submit"
          disabled={isPending}
          className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
        >
          接続キーを発行
        </button>
      </div>
      {state.message && <p className="text-sm text-red-600">{state.message}</p>}
      {state.key && (
        <div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm">
          <p className="mb-2 font-semibold text-amber-800">
            「{state.name}」の接続キーです。この画面を閉じると二度と表示されないので、印刷係の設定が終わるまで控えておいてください。
          </p>
          <code className="block rounded bg-white px-3 py-2 font-mono text-base break-all text-slate-800 select-all">
            {state.key}
          </code>
        </div>
      )}
    </form>
  );
}
