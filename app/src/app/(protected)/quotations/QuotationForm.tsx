"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createQuotation,
  updateQuotation,
  type QuotationInput,
} from "@/lib/actions/quotations";
import { searchProducts, type ProductSearchResult } from "@/lib/actions/sales-vouchers";

type CustomerOption = { code: string; name1: string; staff_code: string | null };
type StaffOption = { code: string; name: string };

type LineState = {
  key: string;
  level: number; // 0=明細行, 1〜3=見出し行
  product_code: string;
  product_name: string;
  spec: string;
  unit: string;
  quantity: string;
  cost_price: string;
  quote_price: string;
};

function emptyLine(): LineState {
  return {
    key: Math.random().toString(36).slice(2),
    level: 0,
    product_code: "",
    product_name: "",
    spec: "",
    unit: "",
    quantity: "1",
    cost_price: "",
    quote_price: "",
  };
}

export function QuotationForm({
  mode,
  quotationId,
  customers,
  staffOptions,
  defaults,
}: {
  mode: "create" | "edit";
  quotationId?: string;
  customers: CustomerOption[];
  staffOptions: StaffOption[];
  defaults?: {
    customer_code: string;
    staff_code: string | null;
    quotation_date: string;
    reference_no: string | null;
    sub_no: string | null;
    counterpart_staff: string | null;
    project_name1: string | null;
    project_name2: string | null;
    delivery_terms: string | null;
    delivery_place: string | null;
    freight_terms: string | null;
    payment_terms: string | null;
    valid_until_text: string | null;
    remarks: string | null;
    is_hierarchical: boolean;
    tax_calculated: boolean;
    lines: LineState[];
  };
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [customerCode, setCustomerCode] = useState(defaults?.customer_code ?? "");
  const [staffCode, setStaffCode] = useState(defaults?.staff_code ?? "");
  const [quotationDate, setQuotationDate] = useState(
    defaults?.quotation_date ?? new Date().toISOString().slice(0, 10),
  );
  const [referenceNo, setReferenceNo] = useState(defaults?.reference_no ?? "");
  const [subNo, setSubNo] = useState(defaults?.sub_no ?? "");
  const [counterpartStaff, setCounterpartStaff] = useState(defaults?.counterpart_staff ?? "");
  const [projectName1, setProjectName1] = useState(defaults?.project_name1 ?? "");
  const [projectName2, setProjectName2] = useState(defaults?.project_name2 ?? "");
  const [deliveryTerms, setDeliveryTerms] = useState(defaults?.delivery_terms ?? "");
  const [deliveryPlace, setDeliveryPlace] = useState(defaults?.delivery_place ?? "");
  const [freightTerms, setFreightTerms] = useState(defaults?.freight_terms ?? "");
  const [paymentTerms, setPaymentTerms] = useState(defaults?.payment_terms ?? "");
  const [validUntilText, setValidUntilText] = useState(defaults?.valid_until_text ?? "");
  const [remarks, setRemarks] = useState(defaults?.remarks ?? "");
  const [isHierarchical, setIsHierarchical] = useState(defaults?.is_hierarchical ?? false);
  const [taxCalculated, setTaxCalculated] = useState(defaults?.tax_calculated ?? true);
  const [lines, setLines] = useState<LineState[]>(defaults?.lines?.length ? defaults.lines : [emptyLine()]);

  function handleCustomerChange(code: string) {
    setCustomerCode(code);
    const c = customers.find((x) => x.code === code);
    if (c?.staff_code && !staffCode) setStaffCode(c.staff_code);
  }

  const totals = useMemo(() => {
    let quote = 0;
    let cost = 0;
    for (const l of lines) {
      if (!l.product_name.trim() || (isHierarchical && l.level > 0)) continue;
      const qty = Number(l.quantity) || 0;
      const quotePrice = Number(l.quote_price) || 0;
      const costPrice = Number(l.cost_price) || 0;
      quote += qty * quotePrice;
      cost += qty * costPrice;
    }
    return { quote, cost, grossProfit: quote - cost };
  }, [lines, isHierarchical]);

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

    const input: QuotationInput = {
      customer_code: customerCode,
      staff_code: staffCode || null,
      quotation_date: quotationDate,
      reference_no: referenceNo || null,
      sub_no: subNo || null,
      counterpart_staff: counterpartStaff || null,
      project_name1: projectName1 || null,
      project_name2: projectName2 || null,
      delivery_terms: deliveryTerms || null,
      delivery_place: deliveryPlace || null,
      freight_terms: freightTerms || null,
      payment_terms: paymentTerms || null,
      valid_until_text: validUntilText || null,
      remarks: remarks || null,
      is_hierarchical: isHierarchical,
      tax_calculated: taxCalculated,
      lines: lines.map((l) => ({
        level: isHierarchical ? l.level : 0,
        product_code: l.product_code || null,
        product_name: l.product_name,
        spec: l.spec || null,
        unit: l.unit || null,
        quantity: l.quantity === "" ? null : Number(l.quantity),
        cost_price: l.cost_price === "" ? null : Number(l.cost_price),
        quote_price: l.quote_price === "" ? null : Number(l.quote_price),
      })),
    };

    startTransition(async () => {
      const result =
        mode === "create"
          ? await createQuotation(input)
          : await updateQuotation(quotationId!, input);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push(`/quotations/${result.id}`);
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
              onChange={(e) => handleCustomerChange(e.target.value)}
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
            <span className="mb-1 block text-xs font-medium text-slate-600">見積日</span>
            <input
              type="date"
              value={quotationDate}
              onChange={(e) => setQuotationDate(e.target.value)}
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
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">相手先担当</span>
            <input value={counterpartStaff} onChange={(e) => setCounterpartStaff(e.target.value)} className="input" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">参照番号</span>
            <input value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} className="input" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">補助番号</span>
            <input value={subNo} onChange={(e) => setSubNo(e.target.value)} className="input" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">納期</span>
            <input value={deliveryTerms} onChange={(e) => setDeliveryTerms(e.target.value)} className="input" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">受渡場所</span>
            <input value={deliveryPlace} onChange={(e) => setDeliveryPlace(e.target.value)} className="input" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">荷造運賃</span>
            <input value={freightTerms} onChange={(e) => setFreightTerms(e.target.value)} className="input" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">支払条件</span>
            <input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} className="input" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">有効期限</span>
            <input value={validUntilText} onChange={(e) => setValidUntilText(e.target.value)} className="input" />
          </label>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">案件名</span>
            <input
              value={projectName1}
              onChange={(e) => setProjectName1(e.target.value)}
              className="input mb-2"
              placeholder="案件名 1行目"
            />
            <input
              value={projectName2}
              onChange={(e) => setProjectName2(e.target.value)}
              className="input"
              placeholder="案件名 2行目（任意）"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">備考</span>
            <input value={remarks} onChange={(e) => setRemarks(e.target.value)} className="input" />
          </label>
        </div>
        <div className="mt-4 flex gap-6">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={isHierarchical}
              onChange={(e) => setIsHierarchical(e.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-sm text-slate-700">階層タイプ（見出し行を使用する）</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={taxCalculated}
              onChange={(e) => setTaxCalculated(e.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-sm text-slate-700">消費税を含めて計算する</span>
          </label>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-bold text-slate-600">明細</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                {isHierarchical && <th className="w-24 pb-2">行種別</th>}
                <th className="w-56 pb-2">品名（入力で候補検索）</th>
                <th className="w-28 pb-2">規格</th>
                <th className="w-16 pb-2">単位</th>
                <th className="w-20 pb-2">数量</th>
                <th className="w-24 pb-2">原価単価</th>
                <th className="w-24 pb-2">見積単価</th>
                <th className="w-28 pb-2 text-right">見積金額</th>
                <th className="w-8 pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <LineRow
                  key={line.key}
                  line={line}
                  isHierarchical={isHierarchical}
                  onChange={updateLine}
                  onRemove={removeLine}
                />
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
          <dt className="text-slate-500">見積金額</dt>
          <dd className="text-slate-800">{Math.round(totals.quote).toLocaleString()}</dd>
          <dt className="text-slate-500">原価金額</dt>
          <dd className="text-slate-800">{Math.round(totals.cost).toLocaleString()}</dd>
          <dt className="font-semibold text-slate-600">粗利額</dt>
          <dd className="font-semibold text-slate-900">{Math.round(totals.grossProfit).toLocaleString()}</dd>
        </dl>
        <p className="mt-2 text-xs text-slate-400">
          {taxCalculated ? "消費税を含めて計算しています。" : "消費税を含めずに計算しています。"}
          {isHierarchical && " 見出し行は金額の集計に含まれません。"}
        </p>
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
        <a href="/quotations" className="rounded px-6 py-2 text-sm text-slate-500 hover:bg-slate-100">
          キャンセル
        </a>
      </div>
    </form>
  );
}

const LEVEL_OPTIONS = [
  { value: 0, label: "明細行" },
  { value: 1, label: "見出し（大）" },
  { value: 2, label: "見出し（中）" },
  { value: 3, label: "見出し（小）" },
];

function LineRow({
  line,
  isHierarchical,
  onChange,
  onRemove,
}: {
  line: LineState;
  isHierarchical: boolean;
  onChange: (key: string, patch: Partial<LineState>) => void;
  onRemove: (key: string) => void;
}) {
  const isHeading = isHierarchical && line.level > 0;

  const [query, setQuery] = useState(line.product_name);
  const [results, setResults] = useState<ProductSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setQuery(line.product_name);
  }, [line.product_name]);

  function handleQueryChange(v: string) {
    setQuery(v);
    onChange(line.key, { product_name: v, product_code: "" });
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (isHeading || v.trim().length === 0) {
      setResults([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const r = await searchProducts(v);
      setResults(r);
      setOpen(r.length > 0);
    }, 300);
  }

  function selectProduct(p: ProductSearchResult) {
    onChange(line.key, {
      product_code: p.code,
      product_name: p.name,
      spec: p.spec ?? "",
      unit: p.unit_code ?? "",
      cost_price: p.standard_cost ?? "",
      quote_price: p.sale_price_1 ?? "",
    });
    setQuery(p.name);
    setOpen(false);
  }

  const qty = Number(line.quantity) || 0;
  const quotePrice = Number(line.quote_price) || 0;
  const quoteAmount = qty * quotePrice;
  const indent = isHierarchical ? Math.max(0, line.level) * 16 : 0;

  return (
    <tr className="border-t border-slate-100 align-top">
      {isHierarchical && (
        <td className="py-1 pr-2">
          <select
            value={line.level}
            onChange={(e) => onChange(line.key, { level: Number(e.target.value) })}
            className="input"
          >
            {LEVEL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </td>
      )}
      <td className="relative py-1 pr-2" style={{ paddingLeft: indent }}>
        {isHeading ? (
          <input
            value={line.product_name}
            onChange={(e) => onChange(line.key, { product_name: e.target.value })}
            placeholder="見出しテキスト"
            className="input font-semibold"
          />
        ) : (
          <>
            <input
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              onFocus={() => results.length > 0 && setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              placeholder="品名 or コードで検索"
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
          </>
        )}
      </td>
      {isHeading ? (
        <td className="py-2 pr-2 text-slate-300" colSpan={6}>
          （見出し行は数量・金額を持ちません）
        </td>
      ) : (
        <>
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
          <td className="py-1 pr-2">
            <input
              type="number"
              step="0.01"
              value={line.quote_price}
              onChange={(e) => onChange(line.key, { quote_price: e.target.value })}
              className="input"
            />
          </td>
          <td className="py-2 pr-2 text-right text-slate-700">{Math.round(quoteAmount).toLocaleString()}</td>
        </>
      )}
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
