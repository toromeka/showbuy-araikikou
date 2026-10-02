"use client";

import { useRef, useState, useTransition } from "react";
import {
  executeNoteRepairAction,
  previewNoteRepairAction,
  type NoteRepairActionResult,
} from "@/lib/actions/migration";

// 取り込み済みの売上伝票の備考を、備考1・備考2に分け直す
export function NoteRepairForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [result, setResult] = useState<NoteRepairActionResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(action: typeof previewNoteRepairAction) {
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    startTransition(async () => setResult(await action(fd)));
  }

  const p = result?.preview;
  const canExecute = !!p && p.errors.length === 0 && p.toUpdate > 0 && !result?.executed;

  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
      <div>
        <h2 className="font-bold text-slate-800">売上伝票の備考を、備考1・備考2に分け直す</h2>
        <p className="mt-1 text-sm text-slate-600">
          以前の取り込みでは、旧システムのCSVの「備考」（備考1と備考2を半角スペースでつなげたもの）を、そのまま備考1に入れていました。
          取り込んだ売上伝票のCSV（データ移行・日計伝票取込で使ったもの）をもう一度選ぶと、取り込んだあとに備考が書き換えられていない明細だけを、
          備考1・備考2に分け直します（例:「3/7特機生 川端様」→ 備考1「3/7特機生」・備考2「川端様」）。
        </p>
      </div>
      <form ref={formRef} onChange={() => setResult(null)} className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">売上伝票のCSV</span>
          <input type="file" name="sales" accept=".csv,text/csv" className="block text-sm" />
        </label>
        <button
          type="button"
          onClick={() => run(previewNoteRepairAction)}
          disabled={isPending || !!result?.executed}
          className="rounded border border-slate-300 bg-white px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          {isPending && !p ? "確認中..." : "内容を確認"}
        </button>
        {canExecute && (
          <button
            type="button"
            onClick={() => {
              if (confirm(`${p!.toUpdate}行の備考を、備考1・備考2に分け直します。よろしいですか？`)) run(executeNoteRepairAction);
            }}
            disabled={isPending}
            className="rounded bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {isPending ? "分け直し中..." : "分け直す"}
          </button>
        )}
      </form>

      {result?.message && <p className="rounded bg-red-50 px-4 py-3 text-sm text-red-600">{result.message}</p>}
      {result?.executed && (
        <p className="rounded border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {p!.toUpdate.toLocaleString()}行の備考を分け直しました。
        </p>
      )}
      {p && p.errors.length > 0 && (
        <ul className="list-disc rounded bg-red-50 py-3 pr-4 pl-8 text-sm text-red-700">
          {p.errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
      {p && p.errors.length === 0 && (
        <div className="space-y-3 text-sm">
          <dl className="grid grid-cols-2 gap-y-1 sm:grid-cols-4">
            <dt className="text-slate-500">CSVの売上伝票</dt>
            <dd>{p.vouchers.toLocaleString()}件</dd>
            <dt className="text-slate-500">分け直す明細</dt>
            <dd className="font-semibold">{p.toUpdate.toLocaleString()}行</dd>
            <dt className="text-slate-500">分け直し済み・不要</dt>
            <dd>{p.alreadySplit.toLocaleString()}行</dd>
            <dt className="text-slate-500">画面で直したためそのまま</dt>
            <dd>{p.changed.toLocaleString()}行</dd>
            <dt className="text-slate-500">登録されていない伝票</dt>
            <dd>{p.notFound.toLocaleString()}件</dd>
          </dl>
          {p.samples.length > 0 && (
            <div className="overflow-x-auto">
              <p className="mb-1 text-xs text-slate-500">分け直しの例（最大15行）</p>
              <table className="w-full text-xs">
                <thead className="border-b border-slate-200 text-left text-slate-500">
                  <tr>
                    <th className="py-1 pr-3">伝票番号</th>
                    <th className="py-1 pr-3">行</th>
                    <th className="py-1 pr-3">今の備考</th>
                    <th className="py-1 pr-3">備考1</th>
                    <th className="py-1">備考2</th>
                  </tr>
                </thead>
                <tbody>
                  {p.samples.map((s) => (
                    <tr key={`${s.voucherNo}-${s.lineNo}`} className="border-b border-slate-100">
                      <td className="py-1 pr-3 font-mono">{s.voucherNo}</td>
                      <td className="py-1 pr-3">{s.lineNo}</td>
                      <td className="py-1 pr-3 text-slate-500">{s.before}</td>
                      <td className="py-1 pr-3">{s.note}</td>
                      <td className="py-1">{s.note2}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
