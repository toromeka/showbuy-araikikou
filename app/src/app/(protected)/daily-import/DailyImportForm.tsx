"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import {
  executeDailyImportAction,
  previewDailyImportAction,
  type DailyImportActionResult,
} from "@/lib/actions/daily-import";
import type { ImportedSide } from "@/lib/migration/daily-import";

const slash = (iso: string | null) => (iso ? iso.replaceAll("-", "/") : "");
const LIST_LIMIT = 30;

export function DailyImportForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [result, setResult] = useState<DailyImportActionResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(action: typeof previewDailyImportAction) {
    if (!formRef.current) return;
    const formData = new FormData(formRef.current);
    startTransition(async () => {
      setResult(await action(formData));
    });
  }

  const p = result?.preview;
  const nothingToImport = !!p && p.sales.toImport === 0 && p.purchases.toImport === 0;
  const canExecute = !!p && p.errors.length === 0 && !nothingToImport && !result?.executed;

  function handleExecute() {
    if (!p) return;
    if (!confirm(`売上伝票${p.sales.toImport}件・仕入伝票${p.purchases.toImport}件を取り込みます。よろしいですか？`)) return;
    run(executeDailyImportAction);
  }

  return (
    <div className="space-y-6">
      <form ref={formRef} onChange={() => setResult(null)} className="rounded-lg border border-slate-200 bg-white p-6">
        <label className="block max-w-md">
          <span className="mb-1 block text-xs font-medium text-slate-600">日計伝票のCSV</span>
          <input type="file" name="file" accept=".csv,text/csv" className="block w-full text-sm" />
        </label>
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={() => run(previewDailyImportAction)}
            disabled={isPending || !!result?.executed}
            className="rounded border border-slate-300 bg-white px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {isPending && !p ? "確認中..." : "内容を確認"}
          </button>
          {canExecute && (
            <button
              type="button"
              onClick={handleExecute}
              disabled={isPending}
              className="rounded bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {isPending ? "取り込み中..." : "この内容で取り込む"}
            </button>
          )}
        </div>
      </form>

      {result?.message && <p className="rounded bg-red-50 px-4 py-3 text-sm text-red-600">{result.message}</p>}

      {result?.executed && (
        <div className="rounded border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          取り込みが完了しました。
          <Link href="/sales-vouchers" className="ml-2 text-blue-600 hover:underline">
            売上伝票を見る
          </Link>
          <Link href="/purchase-vouchers" className="ml-4 text-blue-600 hover:underline">
            仕入伝票を見る
          </Link>
        </div>
      )}

      {p && (
        <>
          {p.errors.length > 0 && (
            <section className="rounded-lg border border-red-200 bg-red-50 p-6">
              <h2 className="mb-2 text-sm font-bold text-red-700">エラー（このままでは取り込めません）</h2>
              <ul className="list-disc space-y-1 pl-5 text-sm text-red-700">
                {p.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </section>
          )}

          <section className="rounded-lg border border-slate-200 bg-white p-6">
            <h2 className="mb-4 text-sm font-bold text-slate-600">{result?.executed ? "取り込んだ内容" : "取り込む内容"}</h2>
            {nothingToImport && !result?.executed && (
              <p className="mb-4 rounded bg-slate-50 px-3 py-2 text-sm text-slate-600">
                新しく取り込む伝票はありません（すべて取り込み済みか、内容が違うため取り込まない伝票です）。
              </p>
            )}
            <div className="grid gap-6 md:grid-cols-2">
              <SideSummary label="売上伝票" side={p.sales} closedNote="締め済みの期間の日付です。次回の請求更新で、その回の請求に含まれます。" />
              <SideSummary label="仕入伝票" side={p.purchases} closedNote="支払更新済みの期間の日付です。次回の仕入支払更新で、その回の支払に含まれます。" />
            </div>
          </section>

          {(p.warnings.length > 0 || p.newCustomers.length > 0 || p.newSuppliers.length > 0 || p.newProductCount > 0) && (
            <section className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
              <h2 className="mb-2 font-bold">確認してください</h2>
              <ul className="list-disc space-y-1 pl-5">
                {p.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
                {p.newCustomers.length > 0 && (
                  <li>
                    得意先マスタに無い得意先{p.newCustomers.length}件を旧マスタ（無効）として登録します:{" "}
                    {p.newCustomers.map((c) => `${c.code} ${c.name}`).join("、")}
                  </li>
                )}
                {p.newSuppliers.length > 0 && (
                  <li>
                    仕入先マスタに無い仕入先{p.newSuppliers.length}件を旧マスタ（無効）として登録します:{" "}
                    {p.newSuppliers.map((s) => `${s.code} ${s.name}`).join("、")}
                  </li>
                )}
                {p.newProductCount > 0 && (
                  <li>
                    商品マスタに無い商品{p.newProductCount}件を旧マスタ（無効）として登録します（例:{" "}
                    {p.newProductSamples
                      .slice(0, 5)
                      .map((x) => `${x.code} ${x.name}`)
                      .join("、")}
                    ）
                  </li>
                )}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function SideSummary({ label, side, closedNote }: { label: string; side: ImportedSide; closedNote: string }) {
  return (
    <div className="space-y-2 text-sm">
      <h3 className="font-semibold text-slate-700">{label}</h3>
      <dl className="grid grid-cols-[9rem_1fr] gap-y-1">
        <dt className="text-slate-500">取り込む伝票</dt>
        <dd>
          {side.toImport.toLocaleString()}件（明細{side.lines.toLocaleString()}行）
          {side.dateFrom && (
            <span className="block text-xs text-slate-500">
              {slash(side.dateFrom)} 〜 {slash(side.dateTo)}
            </span>
          )}
        </dd>
        <dt className="text-slate-500">取り込み済み</dt>
        <dd>{side.alreadyImported.toLocaleString()}件（取り込みません）</dd>
        <dt className="text-slate-500">内容が違う</dt>
        <dd className={side.conflicts.length ? "font-semibold text-red-700" : ""}>{side.conflicts.length}件（取り込みません）</dd>
      </dl>
      {side.conflicts.length > 0 && (
        <div className="rounded bg-red-50 p-3 text-xs text-red-800">
          <p className="mb-1">
            同じ伝票番号が既に登録されていて、内容が違います。旧システムで直した場合は、こちらの伝票を削除してから取り込み直してください。
          </p>
          <ul className="max-h-48 space-y-0.5 overflow-y-auto">
            {side.conflicts.slice(0, LIST_LIMIT).map((c) => (
              <li key={c.voucher_no}>
                {c.voucher_no}: {c.reason}
              </li>
            ))}
            {side.conflicts.length > LIST_LIMIT && <li>ほか{side.conflicts.length - LIST_LIMIT}件</li>}
          </ul>
        </div>
      )}
      {side.closedPeriod.length > 0 && (
        <div className="rounded bg-amber-50 p-3 text-xs text-amber-900">
          <p className="mb-1">
            {side.closedPeriod.length}件は{closedNote}
          </p>
          <ul className="max-h-32 space-y-0.5 overflow-y-auto">
            {side.closedPeriod.slice(0, LIST_LIMIT).map((c) => (
              <li key={c.voucher_no}>
                {c.voucher_no}（{slash(c.date)}・{c.partner}）
              </li>
            ))}
            {side.closedPeriod.length > LIST_LIMIT && <li>ほか{side.closedPeriod.length - LIST_LIMIT}件</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
