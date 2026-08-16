"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  previewPaymentClosing,
  executePaymentClosing,
  type PaymentPreviewItem,
} from "@/lib/actions/payment-closings";

const CLOSING_DAY_OPTIONS = [
  { value: "all", label: "すべての締日" },
  { value: "5", label: "5日" },
  { value: "10", label: "10日" },
  { value: "15", label: "15日" },
  { value: "20", label: "20日" },
  { value: "25", label: "25日" },
  { value: "31", label: "月末" },
];

export function NewPaymentClosingForm() {
  const router = useRouter();
  const [isPreviewPending, startPreview] = useTransition();
  const [isExecutePending, startExecute] = useTransition();

  const [closingDay, setClosingDay] = useState("all");
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().slice(0, 10));
  const [preview, setPreview] = useState<{ items: PaymentPreviewItem[]; skippedZeroCount: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handlePreview(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPreview(null);
    startPreview(async () => {
      const result = await previewPaymentClosing(closingDay === "all" ? "all" : Number(closingDay), asOfDate);
      if (result.error) {
        setError(result.error);
        return;
      }
      setPreview({ items: result.items, skippedZeroCount: result.skippedZeroCount });
    });
  }

  function handleExecute() {
    if (!confirm("この内容で仕入支払更新を実行します。対象の仕入伝票は「支払更新済み」になり、編集・削除できなくなります。よろしいですか？")) {
      return;
    }
    setError(null);
    startExecute(async () => {
      const result = await executePaymentClosing(closingDay === "all" ? "all" : Number(closingDay), asOfDate);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push(`/payment-closings/${result.id}`);
    });
  }

  const totals = preview?.items.reduce(
    (acc, i) => ({
      previous_balance: acc.previous_balance + i.previous_balance,
      purchase_amount: acc.purchase_amount + i.purchase_amount,
      tax_amount: acc.tax_amount + i.tax_amount,
      payment_amount: acc.payment_amount + i.payment_amount,
      payable_amount: acc.payable_amount + i.payable_amount,
    }),
    { previous_balance: 0, purchase_amount: 0, tax_amount: 0, payment_amount: 0, payable_amount: 0 },
  );

  return (
    <div className="space-y-6">
      <form onSubmit={handlePreview} className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">締日</span>
            <select value={closingDay} onChange={(e) => setClosingDay(e.target.value)} className="input">
              {CLOSING_DAY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">基準日（この日までの伝票を集計）</span>
            <input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              required
              className="input"
            />
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={isPreviewPending}
              className="rounded border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-60"
            >
              {isPreviewPending ? "集計中..." : "プレビュー"}
            </button>
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          仕入先マスタの「締日」（未設定の場合は会社設定の既定締日）で絞り込みます。「すべての締日」を選ぶと締日に関わらず全仕入先が対象になります。
        </p>
      </form>

      {error && <p className="rounded bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

      {preview && (
        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-600">
              プレビュー結果（対象 {preview.items.length.toLocaleString()}件
              {preview.skippedZeroCount > 0 && ` / 残高・取引なしのため対象外 ${preview.skippedZeroCount}件`}）
            </h2>
            {preview.items.length > 0 && (
              <button
                type="button"
                onClick={handleExecute}
                disabled={isExecutePending}
                className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {isExecutePending ? "実行中..." : "この内容で仕入支払更新を実行する"}
              </button>
            )}
          </div>

          {preview.items.length === 0 ? (
            <p className="text-sm text-slate-400">対象となる仕入先がありません。</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-sm">
                <thead className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <tr>
                    <th className="pb-2">仕入先</th>
                    <th className="pb-2">対象期間</th>
                    <th className="pb-2 text-right">前回残高</th>
                    <th className="pb-2 text-right">仕入金額</th>
                    <th className="pb-2 text-right">消費税額</th>
                    <th className="pb-2 text-right">支払額</th>
                    <th className="pb-2 text-right">今回支払額</th>
                    <th className="pb-2 text-right">対象伝票数</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.items.map((i) => (
                    <tr key={i.supplier_code} className="border-b border-slate-50">
                      <td className="py-2">
                        {i.supplier_code} - {i.supplier_name}
                      </td>
                      <td className="py-2 text-slate-500">
                        {i.period_from || "〜"} 〜 {i.period_to}
                      </td>
                      <td className="py-2 text-right">{Math.round(i.previous_balance).toLocaleString()}</td>
                      <td className="py-2 text-right">{Math.round(i.purchase_amount).toLocaleString()}</td>
                      <td className="py-2 text-right">{Math.round(i.tax_amount).toLocaleString()}</td>
                      <td className="py-2 text-right">{Math.round(i.payment_amount).toLocaleString()}</td>
                      <td className="py-2 text-right font-semibold">{Math.round(i.payable_amount).toLocaleString()}</td>
                      <td className="py-2 text-right">{i.voucher_count.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
                {totals && (
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 font-semibold text-slate-800">
                      <td className="pt-2" colSpan={2}>
                        合計
                      </td>
                      <td className="pt-2 text-right">{Math.round(totals.previous_balance).toLocaleString()}</td>
                      <td className="pt-2 text-right">{Math.round(totals.purchase_amount).toLocaleString()}</td>
                      <td className="pt-2 text-right">{Math.round(totals.tax_amount).toLocaleString()}</td>
                      <td className="pt-2 text-right">{Math.round(totals.payment_amount).toLocaleString()}</td>
                      <td className="pt-2 text-right">{Math.round(totals.payable_amount).toLocaleString()}</td>
                      <td className="pt-2"></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
