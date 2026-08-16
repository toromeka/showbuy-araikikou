"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createPurchaseVoucher,
  updatePurchaseVoucher,
  searchPurchaseProducts,
  type PurchaseProductSearchResult,
  type PurchaseVoucherInput,
} from "@/lib/actions/purchase-vouchers";

type SupplierOption = { code: string; name1: string; staff_code: string | null; rounding_method: number | null };
type StaffOption = { code: string; name: string };
type TaxRateRow = { starts_on: string; rate: string };

type LineState = {
  key: string;
  product_code: string;
  product_name: string;
  spec: string;
  unit: string;
  category: string;
  quantity: string;
  cost_price: string;
  note: string;
};

function emptyLine(): LineState {
  return {
    key: Math.random().toString(36).slice(2),
    product_code: "",
    product_name: "",
    spec: "",
    unit: "",
    category: "",
    quantity: "1",
    cost_price: "",
    note: "",
  };
}

export function PurchaseVoucherForm({
  mode,
  voucherId,
  suppliers,
  staffOptions,
  taxRates,
  defaults,
}: {
  mode: "create" | "edit";
  voucherId?: string;
  suppliers: SupplierOption[];
  staffOptions: StaffOption[];
  taxRates: TaxRateRow[];
  defaults?: {
    supplier_code: string;
    voucher_date: string;
    staff_code: string | null;
    remarks: string | null;
    lines: LineState[];
  };
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [supplierCode, setSupplierCode] = useState(defaults?.supplier_code ?? "");
  const [voucherDate, setVoucherDate] = useState(
    defaults?.voucher_date ?? new Date().toISOString().slice(0, 10),
  );
  const [staffCode, setStaffCode] = useState(defaults?.staff_code ?? "");
  const [remarks, setRemarks] = useState(defaults?.remarks ?? "");
  const [lines, setLines] = useState<LineState[]>(defaults?.lines?.length ? defaults.lines : [emptyLine()]);

  const selectedSupplier = suppliers.find((s) => s.code === supplierCode);

  // 仕入先を選んだら、担当者が未設定なら仕入先の既定担当者を自動セット
  function handleSupplierChange(code: string) {
    setSupplierCode(code);
    const s = suppliers.find((x) => x.code === code);
    if (s?.staff_code && !staffCode) setStaffCode(s.staff_code);
  }

  const effectiveTaxRate = useMemo(() => {
    const sorted = [...taxRates].sort((a, b) => (a.starts_on < b.starts_on ? 1 : -1));
    const applicable = sorted.find((t) => t.starts_on <= voucherDate);
    return applicable ? Number(applicable.rate) : 10;
  }, [taxRates, voucherDate]);

  const roundingMethod = selectedSupplier?.rounding_method ?? 0;

  function roundByMethod(v: number): number {
    if (roundingMethod === 1) return Math.floor(v);
    if (roundingMethod === 2) return Math.ceil(v);
    return Math.round(v);
  }

  const totals = useMemo(() => {
    let subtotal = 0;
    for (const l of lines) {
      if (!l.product_name.trim() || !Number(l.quantity)) continue;
      const qty = Number(l.quantity) || 0;
      const costPrice = Number(l.cost_price) || 0;
      subtotal += qty * costPrice;
    }
    const tax = roundByMethod(subtotal * (effectiveTaxRate / 100));
    return { subtotal, tax, total: subtotal + tax };
  }, [lines, effectiveTaxRate, roundingMethod]);

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

    const input: PurchaseVoucherInput = {
      supplier_code: supplierCode,
      voucher_date: voucherDate,
      staff_code: staffCode || null,
      remarks: remarks || null,
      lines: lines.map((l) => ({
        product_code: l.product_code || null,
        product_name: l.product_name,
        spec: l.spec || null,
        unit: l.unit || null,
        category: l.category || null,
        quantity: Number(l.quantity) || 0,
        cost_price: l.cost_price === "" ? null : Number(l.cost_price),
        note: l.note || null,
      })),
    };

    startTransition(async () => {
      const result =
        mode === "create"
          ? await createPurchaseVoucher(input)
          : await updatePurchaseVoucher(voucherId!, input);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push(`/purchase-vouchers/${result.id}`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">仕入先</span>
            <select
              value={supplierCode}
              onChange={(e) => handleSupplierChange(e.target.value)}
              required
              className="input"
            >
              <option value="">選択してください</option>
              {suppliers.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.code} - {s.name1}
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
            <span className="mb-1 block text-xs font-medium text-slate-600">担当者</span>
            <select value={staffCode} onChange={(e) => setStaffCode(e.target.value)} className="input">
              <option value="">（未設定）</option>
              {staffOptions.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.code} - {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="mt-4 block">
          <span className="mb-1 block text-xs font-medium text-slate-600">摘要</span>
          <input value={remarks} onChange={(e) => setRemarks(e.target.value)} className="input" />
        </label>
        <p className="mt-2 text-xs text-slate-400">
          適用消費税率: {effectiveTaxRate}%（伝票日付に応じて自動判定されます）
        </p>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-bold text-slate-600">明細</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="w-56 pb-2">商品名（入力で候補検索）</th>
                <th className="w-32 pb-2">規格</th>
                <th className="w-16 pb-2">単位</th>
                <th className="w-20 pb-2">数量</th>
                <th className="w-24 pb-2">仕入単価</th>
                <th className="w-28 pb-2 text-right">仕入金額</th>
                <th className="w-32 pb-2">備考</th>
                <th className="w-8 pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <LineRow key={line.key} line={line} onChange={updateLine} onRemove={removeLine} />
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
          <dt className="text-slate-500">仕入金額</dt>
          <dd className="text-slate-800">{Math.round(totals.subtotal).toLocaleString()}</dd>
          <dt className="text-slate-500">消費税額</dt>
          <dd className="text-slate-800">{Math.round(totals.tax).toLocaleString()}</dd>
          <dt className="font-semibold text-slate-600">合計</dt>
          <dd className="font-semibold text-slate-900">{Math.round(totals.total).toLocaleString()}</dd>
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
        <a href="/purchase-vouchers" className="rounded px-6 py-2 text-sm text-slate-500 hover:bg-slate-100">
          キャンセル
        </a>
      </div>
    </form>
  );
}

function LineRow({
  line,
  onChange,
  onRemove,
}: {
  line: LineState;
  onChange: (key: string, patch: Partial<LineState>) => void;
  onRemove: (key: string) => void;
}) {
  const [query, setQuery] = useState(line.product_name);
  const [results, setResults] = useState<PurchaseProductSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setQuery(line.product_name);
  }, [line.product_name]);

  function handleQueryChange(v: string) {
    setQuery(v);
    onChange(line.key, { product_name: v, product_code: "" });
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (v.trim().length === 0) {
      setResults([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const r = await searchPurchaseProducts(v);
      setResults(r);
      setOpen(r.length > 0);
    }, 300);
  }

  function selectProduct(p: PurchaseProductSearchResult) {
    onChange(line.key, {
      product_code: p.code,
      product_name: p.name,
      spec: p.spec ?? "",
      unit: p.unit_code ?? "",
      cost_price: p.standard_cost ?? "",
    });
    setQuery(p.name);
    setOpen(false);
  }

  const qty = Number(line.quantity) || 0;
  const costPrice = Number(line.cost_price) || 0;
  const costAmount = qty * costPrice;

  return (
    <tr className="border-t border-slate-100 align-top">
      <td className="relative py-1 pr-2">
        <input
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="商品名 or コードで検索"
          className="input"
        />
        {open && (
          <ul className="absolute z-10 mt-1 max-h-56 w-80 overflow-y-auto rounded border border-slate-200 bg-white shadow-lg">
            {results.map((p) => (
              <li key={p.code}>
                <button
                  type="button"
                  onMouseDown={() => selectProduct(p)}
                  className="block w-full px-3 py-2 text-left text-xs hover:bg-blue-50"
                >
                  <span className="font-mono text-slate-400">{p.code}</span> {p.name}
                  {p.spec ? ` (${p.spec})` : ""}
                </button>
              </li>
            ))}
          </ul>
        )}
      </td>
      <td className="py-1 pr-2">
        <input
          value={line.spec}
          onChange={(e) => onChange(line.key, { spec: e.target.value })}
          className="input"
        />
      </td>
      <td className="py-1 pr-2">
        <input
          value={line.unit}
          onChange={(e) => onChange(line.key, { unit: e.target.value })}
          className="input"
        />
      </td>
      <td className="py-1 pr-2">
        <input
          type="number"
          step="0.001"
          value={line.quantity}
          onChange={(e) => onChange(line.key, { quantity: e.target.value })}
          className="input"
        />
      </td>
      <td className="py-1 pr-2">
        <input
          type="number"
          step="0.01"
          value={line.cost_price}
          onChange={(e) => onChange(line.key, { cost_price: e.target.value })}
          className="input"
        />
      </td>
      <td className="py-2 pr-2 text-right text-slate-700">{Math.round(costAmount).toLocaleString()}</td>
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
