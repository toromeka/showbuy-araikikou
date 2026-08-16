"use client";

import { useActionState } from "react";
import type { ImportResult } from "@/lib/csv";

export function ImportForm({
  action,
  title,
  headerHint,
  backHref,
}: {
  action: (state: ImportResult, formData: FormData) => Promise<ImportResult>;
  title: string;
  headerHint: string;
  backHref: string;
}) {
  const [state, formAction, isPending] = useActionState(action, {});

  return (
    <div className="max-w-2xl">
      <h1 className="mb-2 text-lg font-bold text-slate-800">{title}</h1>
      <p className="mb-6 text-sm text-slate-500">
        同じコードの行が既にある場合は上書き更新されます。新しいコードの行は新規登録されます。
      </p>

      <form action={formAction} className="rounded-lg border border-slate-200 bg-white p-6">
        <label className="mb-2 block text-sm font-medium text-slate-700">CSVファイル</label>
        <input
          type="file"
          name="file"
          accept=".csv,text/csv"
          required
          className="mb-2 block w-full text-sm text-slate-600 file:mr-4 file:rounded file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100"
        />
        <p className="mb-4 text-xs text-slate-400">1行目は見出し行。想定する列: {headerHint}</p>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={isPending}
            className="rounded bg-blue-600 px-6 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {isPending ? "取り込み中...（件数が多いと数分かかります）" : "取り込み"}
          </button>
          <a href={backHref} className="rounded px-6 py-2 text-sm text-slate-500 hover:bg-slate-100">
            一覧に戻る
          </a>
        </div>
      </form>

      {state.message && (
        <p className="mt-4 rounded bg-red-50 px-4 py-3 text-sm text-red-600">{state.message}</p>
      )}

      {state.total !== undefined && (
        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="mb-3 text-sm font-bold text-slate-600">取り込み結果</h2>
          <dl className="grid grid-cols-2 gap-y-2 text-sm sm:grid-cols-4">
            <dt className="text-slate-500">読み込んだ行数</dt>
            <dd className="text-slate-800">{state.total}</dd>
            <dt className="text-slate-500">新規登録</dt>
            <dd className="text-green-700">{state.created}</dd>
            <dt className="text-slate-500">更新</dt>
            <dd className="text-blue-700">{state.updated}</dd>
            <dt className="text-slate-500">失敗（スキップ）</dt>
            <dd className="text-red-700">{state.failed}</dd>
          </dl>
          {!!state.nulledRefs && (
            <p className="mt-3 text-xs text-amber-700">
              担当者・分類などのコードがマスタに見つからず、{state.nulledRefs}
              件の参照項目を空欄のまま登録しました。先にコード側のマスタを登録してから再取り込みすると解消します。
            </p>
          )}
          {state.errors && state.errors.length > 0 && (
            <div className="mt-4">
              <p className="mb-1 text-xs font-semibold text-red-600">
                エラー内容（最大{state.errors.length}件表示）
              </p>
              <ul className="max-h-64 space-y-1 overflow-y-auto rounded bg-red-50 p-3 text-xs text-red-700">
                {state.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
