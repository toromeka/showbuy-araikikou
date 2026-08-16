"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createReceiptVoucher,
  updateReceiptVoucher,
  type ReceiptVoucherInput,
} from "@/lib/actions/receipt-vouchers";

type CustomerOption = { code: string; name1: string };
type BankOption = { code: string; name: string };

const CATEGORIES = ["現金", "振込", "手形", "その他"];

type LineState = {
  key: string;
  category: string;
  amount: string;
  note: string;
  bank_code: string;
  bill_due_date: string;
  bill_no: string;
};

function emptyLine(): LineState {
  return {
    key: Math.random().toString(36).slice(2),
    category: "現金",
    amount: "",
    note: "",
    bank_code: "",
    bill_due_date: "",
    bill_no: "",
  };
}

export function ReceiptVoucherForm({
  mode,
  voucherId,
  customers,
  banks,
  defaults,
}: {
  mode: "create" | "edit";
  voucherId?: string;
  customers: CustomerOption[];
  banks: BankOption[];
  defaults?: {
    customer_code: string;
    voucher_date: string;
    period_from: string | null;
    period_to: string | null;
    billed_amount: string | null;
    sales_amount: string | null;
    tax_amount: string | null;
    print_receipt: boolean;
    lines: LineState[];
  };
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [customerCode, setCustomerCode] = useState(defaults?.customer_code ?? "");
  const [voucherDate, setVoucherDate] = useState(
    defaults?.voucher_date ?? new Date().toISOString().slice(0, 10),
  );
  const [periodFrom, setPeriodFrom] = useState(defaults?.period_from ?? "");
  const [periodTo, setPeriodTo] = useState(defaults?.period_to ?? "");
  const [billedAmount, setBilledAmount] = useState(defaults?.billed_amount ?? "");
  const [salesAmount, setSalesAmount] = useState(defaults?.sales_amount ?? "");
  const [taxAmount, setTaxAmount] = useState(defaults?.tax_amount ?? "");
  const [printReceipt, setPrintReceipt] = useState(defaults?.print_receipt ?? false);
  const [lines, setLines] = useState<LineState[]>(defaults?.lines?.length ? defaults.lines : [emptyLine()]);

  const totalAmount = useMemo(
    () => lines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0),
    [lines],
  );

  function updateLine(key: string, patch: Partial<LineState>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const input: ReceiptVoucherInput = {
      customer_code: customerCode,
      voucher_date: voucherDate,
      period_from: periodFrom || null,
      period_to: periodTo || null,
      billed_amount: billedAmount === "" ? null : Number(billedAmount),
      sales_amount: salesAmount === "" ? null : Number(salesAmount),
      tax_amount: taxAmount === "" ? null : Number(taxAmount),
      print_receipt: printReceipt,
      lines: lines.map((l) => ({
        category: l.category,
        amount: Number(l.amount) || 0,
        note: l.note || null,
        bank_code: l.bank_code || null,
        bill_due_date: l.bill_due_date || null,
        bill_no: l.bill_no || null,
      })),
    };

    startTransition(async () => {
      const result =
        mode === "create"
          ? await createReceiptVoucher(input)
          : await updateReceiptVoucher(voucherId!, input);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push(`/receipt-vouchers/${result.id}`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">得意先</span>
            <select
              value={customerCode}
              onChange={(e) => setCustomerCode(e.target.value)}
              required
              className="input"
            >
              <option value="">選択してください</option>
              {customers.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} - {c.name1}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">伝票日付</span>
            <input
              type="date"
              value={voucherDate}
              onChange={(e) => setVoucherDate(e.target.value)}
              required
              className="input"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">対象期間（From）</span>
            <input
              type="date"
              value={periodFrom}
              onChange={(e) => setPeriodFrom(e.target.value)}
              className="input"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">対象期間（To）</span>
            <input
              type="date"
              value={periodTo}
              onChange={(e) => setPeriodTo(e.target.value)}
              className="input"
            />
          </label>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">請求金額（参考）</span>
            <input
              type="number"
              step="0.01"
              value={billedAmount}
              onChange={(e) => setBilledAmount(e.target.value)}
              className="input"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">売上金額（参考）</span>
            <input
              type="number"
              step="0.01"
              value={salesAmount}
              onChange={(e) => setSalesAmount(e.target.value)}
              className="input"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">消費税額（参考）</span>
            <input
              type="number"
              step="0.01"
              value={taxAmount}
              onChange={(e) => setTaxAmount(e.target.value)}
              className="input"
            />
          </label>
          <label className="mt-6 flex items-center gap-2">
            <input
              type="checkbox"
              checked={printReceipt}
              onChange={(e) => setPrintReceipt(e.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-sm text-slate-700">領収書印刷</span>
          </label>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          請求金額・売上金額・消費税額は、請求処理（未実装）の代わりに手入力で記録する参考項目です。
        </p>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-bold text-slate-600">入金明細</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="w-24 pb-2">区分</th>
                <th className="w-28 pb-2">金額</th>
                <th className="w-40 pb-2">振込先銀行</th>
                <th className="w-28 pb-2">手形決済日</th>
                <th className="w-32 pb-2">手形No</th>
                <th className="w-40 pb-2">備考</th>
                <th className="w-8 pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <LineRow key={line.key} line={line} banks={banks} onChange={updateLine} onRemove={removeLine} />
              ))}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          onClick={addLine}
          className="mt-3 rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          + 明細行を追加
        </button>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <dl className="grid grid-cols-2 gap-y-2 text-sm sm:grid-cols-4">
          <dt className="font-semibold text-slate-600">入金合計</dt>
          <dd className="font-semibold text-slate-900">{Math.round(totalAmount).toLocaleString()}</dd>
        </dl>
      </section>

      {error && <p className="rounded bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-blue-600 px-6 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {isPending ? "保存中..." : "保存"}
        </button>
        <a href="/receipt-vouchers" className="rounded px-6 py-2 text-sm text-slate-500 hover:bg-slate-100">
          キャンセル
        </a>
      </div>
    </form>
  );
}

function LineRow({
  line,
  banks,
  onChange,
  onRemove,
}: {
  line: LineState;
  banks: BankOption[];
  onChange: (key: string, patch: Partial<LineState>) => void;
  onRemove: (key: string) => void;
}) {
  const showBank = line.category === "振込" || line.category === "手形";
  const showBill = line.category === "手形";

  return (
    <tr className="border-t border-slate-100 align-top">
      <td className="py-1 pr-2">
        <select
          value={line.category}
          onChange={(e) => onChange(line.key, { category: e.target.value })}
          className="input"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </td>
      <td className="py-1 pr-2">
        <input
          type="number"
          step="0.01"
          value={line.amount}
          onChange={(e) => onChange(line.key, { amount: e.target.value })}
          className="input"
        />
      </td>
      <td className="py-1 pr-2">
        {showBank ? (
          <select
            value={line.bank_code}
            onChange={(e) => onChange(line.key, { bank_code: e.target.value })}
            className="input"
          >
            <option value="">（未設定）</option>
            {banks.map((b) => (
              <option key={b.code} value={b.code}>
                {b.code} - {b.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-xs text-slate-300">-</span>
        )}
      </td>
      <td className="py-1 pr-2">
        {showBill ? (
          <input
            type="date"
            value={line.bill_due_date}
            onChange={(e) => onChange(line.key, { bill_due_date: e.target.value })}
            className="input"
          />
        ) : (
          <span className="text-xs text-slate-300">-</span>
        )}
      </td>
      <td className="py-1 pr-2">
        {showBill ? (
          <input
            value={line.bill_no}
            onChange={(e) => onChange(line.key, { bill_no: e.target.value })}
            className="input"
          />
        ) : (
          <span className="text-xs text-slate-300">-</span>
        )}
      </td>
      <td className="py-1 pr-2">
        <input
          value={line.note}
          onChange={(e) => onChange(line.key, { note: e.target.value })}
          className="input"
        />
      </td>
      <td className="py-1 text-center">
        <button
          type="button"
          onClick={() => onRemove(line.key)}
          className="text-slate-400 hover:text-red-600"
          title="この行を削除"
        >
          ×
        </button>
      </td>
    </tr>
  );
}
