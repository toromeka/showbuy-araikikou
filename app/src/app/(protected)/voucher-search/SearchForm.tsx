"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";
import type { VoucherSearchParams } from "@/lib/voucher-search";
import { workColorFor } from "@/lib/work-colors";

const TYPES = [
  { value: "sales", label: "売上伝票", href: "/sales-vouchers" },
  { value: "purchase", label: "仕入伝票", href: "/purchase-vouchers" },
  { value: "receipt", label: "入金伝票", href: "/receipt-vouchers" },
  { value: "payment", label: "支払伝票", href: "/payment-vouchers" },
  { value: "quotation", label: "見積書", href: "/quotations" },
];

const OUTPUTS = [
  { value: "voucher", label: "画面に表示（伝票ごと）" },
  { value: "line", label: "画面に表示（明細ごと）" },
  { value: "csv", label: "CSVファイルに出力（Excelで開けます）" },
];

// 伝票検索の条件の入力欄。「検索」で条件をURLに入れて結果を表示する（CSVはファイルとしてダウンロードする）
export function SearchForm({ params, output }: { params: VoucherSearchParams; output: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const searched = params.types.length > 0;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (fd.getAll("type").length === 0) {
      alert("伝票の種類を1つ以上選んでください。");
      return;
    }
    const query = new URLSearchParams();
    for (const [k, v] of fd.entries()) if (typeof v === "string" && v.trim() !== "") query.append(k, v.trim());
    if (fd.get("view") === "csv") {
      // CSVはページの移動ではなく、ファイルとしてダウンロードする
      const a = document.createElement("a");
      a.href = `/voucher-search/export?${query.toString()}`;
      a.download = "";
      a.click();
      return;
    }
    router.push(`/voucher-search?${query.toString()}`);
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-5 rounded-lg border border-slate-200 bg-white p-5 sm:p-6">
      <fieldset>
        <legend className="mb-2 text-xs font-medium text-slate-600">伝票の種類（複数選べます）</legend>
        <div className="flex flex-wrap gap-2">
          {TYPES.map((t) => (
            <label
              key={t.value}
              className="flex cursor-pointer items-center gap-2 rounded border border-slate-300 px-3 py-2 text-sm"
              style={{ backgroundColor: workColorFor(t.href) ?? undefined }}
            >
              <input
                type="checkbox"
                name="type"
                value={t.value}
                defaultChecked={searched ? params.types.includes(t.value as VoucherSearchParams["types"][number]) : t.value !== "quotation"}
                className="h-4 w-4"
              />
              {t.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">得意先・仕入先（コード、または名前の一部）</span>
          <input name="partner" defaultValue={params.partner} placeholder="例: 0054 / 竹田" className="input" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">伝票番号（一部でも可）</span>
          <input name="no" defaultValue={params.voucherNo} inputMode="numeric" className="input" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">商品名（一部でも可。全角・半角カナどちらでも）</span>
          <input name="product" defaultValue={params.product} placeholder="例: フラットドリル" className="input" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">規格（一部でも可）</span>
          <input name="spec" defaultValue={params.spec} placeholder="例: XKDZ5" className="input" />
        </label>
        <div className="sm:col-span-2">
          <span className="mb-1 block text-xs font-medium text-slate-600">伝票日付（期間）</span>
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" name="from" defaultValue={params.from} className="input w-auto" />
            <span className="text-slate-500">〜</span>
            <input type="date" name="to" defaultValue={params.to} className="input w-auto" />
          </div>
        </div>
      </div>

      <fieldset>
        <legend className="mb-2 text-xs font-medium text-slate-600">出力方法</legend>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-5">
          {OUTPUTS.map((o) => (
            <label key={o.value} className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="radio" name="view" value={o.value} defaultChecked={output === o.value} className="h-4 w-4" />
              {o.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap gap-3">
        <button type="submit" className="rounded bg-blue-600 px-8 py-2 text-sm font-semibold text-white hover:bg-blue-700">
          検索
        </button>
        <button
          type="button"
          onClick={() => {
            formRef.current?.reset();
            router.push("/voucher-search");
          }}
          className="rounded border border-slate-300 bg-white px-5 py-2 text-sm text-slate-600 hover:bg-slate-50"
        >
          条件をクリア
        </button>
      </div>
    </form>
  );
}
