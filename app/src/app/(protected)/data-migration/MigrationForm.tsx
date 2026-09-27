"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import {
  executeMigrationAction,
  previewMigrationAction,
  type MigrationActionResult,
} from "@/lib/actions/migration";

const yen = (n: number) => Math.round(n).toLocaleString();
const slash = (iso: string) => iso.replaceAll("-", "/");

export function MigrationForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [result, setResult] = useState<MigrationActionResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(action: typeof previewMigrationAction) {
    if (!formRef.current) return;
    const formData = new FormData(formRef.current);
    startTransition(async () => {
      setResult(await action(formData));
    });
  }

  function handleExecute() {
    if (
      !confirm(
        "この内容で伝票データを取り込みます。\n過去の請求更新も再現されます。取り込んだ伝票・請求更新は元に戻せません。\n\nよろしいですか？",
      )
    ) {
      return;
    }
    run(executeMigrationAction);
  }

  const p = result?.preview;
  const canExecute = !!p && p.errors.length === 0 && !result?.executed;
  const mismatched = p?.balances.filter((b) => b.carried_over !== 0) ?? [];

  return (
    <div className="space-y-6">
      <form ref={formRef} onChange={() => setResult(null)} className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { name: "sales", label: "売上伝票のCSV（必須）" },
            { name: "purchase", label: "仕入伝票のCSV" },
            { name: "receipt", label: "入金伝票のCSV" },
          ].map((f) => (
            <label key={f.name} className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">{f.label}</span>
              <input type="file" name={f.name} accept=".csv,text/csv" className="block w-full text-sm" />
            </label>
          ))}
        </div>
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={() => run(previewMigrationAction)}
            disabled={isPending || !!result?.executed}
            className="rounded border border-slate-300 bg-white px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {isPending && !p ? "確認中..." : "内容を確認（プレビュー）"}
          </button>
          {canExecute && (
            <button
              type="button"
              onClick={handleExecute}
              disabled={isPending}
              className="rounded bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {isPending ? "取り込み中（数十秒かかります）..." : "この内容で取り込む"}
            </button>
          )}
        </div>
      </form>

      {result?.message && <p className="rounded bg-red-50 px-4 py-3 text-sm text-red-600">{result.message}</p>}

      {result?.executed && (
        <div className="rounded border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          取り込みが完了しました。
          <Link href="/billing-closings" className="ml-2 text-blue-600 hover:underline">
            請求更新の履歴を見る
          </Link>
          <Link href="/sales-vouchers" className="ml-4 text-blue-600 hover:underline">
            売上伝票を見る
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
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
              <dt className="text-slate-500">売上伝票</dt>
              <dd>
                {p.counts.salesVouchers.toLocaleString()}件（明細{p.counts.salesLines.toLocaleString()}行）
                <span className="block text-xs text-slate-500">うち請求確定済み {p.counts.salesBilled.toLocaleString()}件</span>
              </dd>
              <dt className="text-slate-500">仕入伝票</dt>
              <dd>
                {p.counts.purchaseVouchers.toLocaleString()}件（明細{p.counts.purchaseLines.toLocaleString()}行）
                <span className="block text-xs text-slate-500">うち支払更新済み {p.counts.purchaseSettled.toLocaleString()}件</span>
              </dd>
              <dt className="text-slate-500">入金伝票</dt>
              <dd>
                {p.counts.receiptVouchers.toLocaleString()}件（明細{p.counts.receiptLines.toLocaleString()}行）
              </dd>
              <dt className="text-slate-500">請求更新の再現</dt>
              <dd>
                {p.counts.billingClosings.toLocaleString()}回（請求実績{p.counts.billingRecords.toLocaleString()}件）
              </dd>
            </dl>
          </section>

          {p.warnings.length > 0 && (
            <section className="rounded-lg border border-amber-200 bg-amber-50 p-6">
              <h2 className="mb-2 text-sm font-bold text-amber-800">確認事項</h2>
              <ul className="list-disc space-y-1 pl-5 text-sm text-amber-800">
                {p.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </section>
          )}

          <section className="rounded-lg border border-slate-200 bg-white p-6">
            <h2 className="mb-2 text-sm font-bold text-slate-600">マスタに無いため、旧マスタ（無効）として自動登録するもの</h2>
            <p className="mb-3 text-xs text-slate-500">
              今も取引がある得意先・仕入先が含まれている場合は、取り込む前にマスタへ登録してください（無効のままだと伝票入力の検索に出ません）。
            </p>
            <div className="grid gap-4 text-sm sm:grid-cols-3">
              <div>
                <p className="mb-1 font-medium">得意先 {p.newCustomers.length}件</p>
                <ul className="max-h-40 overflow-y-auto text-slate-600">
                  {p.newCustomers.map((c) => (
                    <li key={c.code}>
                      <span className="font-mono">{c.code}</span> {c.name}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-1 font-medium">仕入先 {p.newSuppliers.length}件</p>
                <ul className="max-h-40 overflow-y-auto text-slate-600">
                  {p.newSuppliers.map((s) => (
                    <li key={s.code}>
                      <span className="font-mono">{s.code}</span> {s.name}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-1 font-medium">商品 {p.newProductCount.toLocaleString()}件</p>
                <ul className="max-h-40 overflow-y-auto text-slate-600">
                  {p.newProductSamples.map((s) => (
                    <li key={s.code}>
                      <span className="font-mono">{s.code}</span> {s.name}
                    </li>
                  ))}
                  {p.newProductCount > p.newProductSamples.length && <li>…ほか</li>}
                </ul>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-6">
            <h2 className="mb-1 text-sm font-bold text-slate-600">得意先ごとの直近の請求（再現結果）</h2>
            <p className="mb-3 text-xs text-slate-500">
              「繰越残」は、直近の請求の前回請求残から今回入金を引いた額です。毎回全額入金されていれば0になります。
              0でない得意先（{mismatched.length}件、黄色）は、支払い残し・払い過ぎ・データの抜けのいずれかです。旧システムの売掛残高と見比べてください。
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-slate-100 text-left text-xs text-slate-600">
                  <tr>
                    <th className="px-2 py-2">コード</th>
                    <th className="px-2 py-2">得意先</th>
                    <th className="px-2 py-2">締日</th>
                    <th className="px-2 py-2">請求の期間（回数）</th>
                    <th className="px-2 py-2 text-right">前回請求残</th>
                    <th className="px-2 py-2 text-right">今回入金</th>
                    <th className="px-2 py-2 text-right">繰越残</th>
                    <th className="px-2 py-2 text-right">今回売上（税込）</th>
                    <th className="px-2 py-2 text-right">今回請求額</th>
                  </tr>
                </thead>
                <tbody>
                  {p.balances.map((b) => (
                    <tr key={b.code} className={`border-t border-slate-100 ${b.carried_over !== 0 ? "bg-amber-50" : ""}`}>
                      <td className="px-2 py-1 font-mono">{b.code}</td>
                      <td className="px-2 py-1">{b.name}</td>
                      <td className="px-2 py-1">{b.closing_day >= 28 ? "末日" : `${b.closing_day}日`}</td>
                      <td className="px-2 py-1 text-xs text-slate-500">
                        {slash(b.first_period_to)}〜{slash(b.last_period_to)}（{b.periods}回）
                      </td>
                      <td className="px-2 py-1 text-right">{yen(b.previous_balance)}</td>
                      <td className="px-2 py-1 text-right">{yen(b.receipt_amount)}</td>
                      <td className={`px-2 py-1 text-right ${b.carried_over !== 0 ? "font-semibold text-amber-800" : ""}`}>
                        {yen(b.carried_over)}
                      </td>
                      <td className="px-2 py-1 text-right">{yen(b.sales_with_tax)}</td>
                      <td className="px-2 py-1 text-right font-semibold">{yen(b.billed_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
