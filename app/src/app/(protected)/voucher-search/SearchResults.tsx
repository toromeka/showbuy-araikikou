"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { SearchLine, SearchResult, SearchRow, SearchType } from "@/lib/voucher-search";
import { workColorFor } from "@/lib/work-colors";

const TYPE_LABEL: Record<SearchType, string> = {
  sales: "売上伝票",
  purchase: "仕入伝票",
  receipt: "入金伝票",
  payment: "支払伝票",
  quotation: "見積書",
};
const TYPE_HREF: Record<SearchType, string> = {
  sales: "/sales-vouchers",
  purchase: "/purchase-vouchers",
  receipt: "/receipt-vouchers",
  payment: "/payment-vouchers",
  quotation: "/quotations",
};
const MAX_PER_TYPE_NOTE = 500;

const yen = (n: number | null) => (n === null ? "" : Math.round(n).toLocaleString());
const qty = (n: number | null) => (n === null ? "" : n.toLocaleString("ja-JP", { maximumFractionDigits: 3 }));
const price = (n: number | null) => (n === null ? "" : n.toLocaleString("ja-JP", { maximumFractionDigits: 2 }));
const slash = (iso: string) => iso.replace(/-/g, "/");

// ふりがな順の並べ替え用の読み。マスタの「ﾌﾘｶﾞﾅ」（半角カナ）を全角カナにそろえ、無ければ名前そのものを使う
// （ひらがなはカタカナにそろえる。漢字の名前はふりがなが無いと読みでは並ばないため、カナの後ろに並ぶ）
const reading = (kana: string, name: string) =>
  (kana || name).normalize("NFKC").replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
const collator = new Intl.Collator("ja");

type SortKey = "date" | "no" | "partner" | "product" | "quantity" | "amount";
type Sort = { key: SortKey; desc: boolean };
type LineItem = { r: SearchRow; l: SearchLine };

function TypeBadge({ type }: { type: SearchType }) {
  return (
    <span
      className="rounded border border-slate-300 px-2 py-0.5 text-xs whitespace-nowrap text-slate-700"
      style={{ backgroundColor: workColorFor(TYPE_HREF[type]) ?? "#f1f5f9" }}
    >
      {TYPE_LABEL[type]}
    </span>
  );
}

export function SearchResults({
  result,
  view,
  lineFilter,
}: {
  result: SearchResult;
  view: "line" | "voucher";
  lineFilter: boolean;
}) {
  const { rows } = result;
  // 日付の新しい順が既定。見出しを押すと並べ替え、同じ見出しをもう一度押すと逆順
  const [sort, setSort] = useState<Sort>({ key: "date", desc: true });
  const [opened, setOpened] = useState<SearchRow | null>(null);

  const lineItems = useMemo(
    () => rows.flatMap((r) => (lineFilter ? r.lines.filter((l) => l.matched) : r.lines).map((l) => ({ r, l }))),
    [rows, lineFilter],
  );

  const sortedLines = useMemo(() => {
    // 同じ値の行は、日付・伝票番号・行の順に並べる（並べ替えの結果を毎回同じにし、逆順がきちんと逆になるように）
    const tie = (a: LineItem, b: LineItem) =>
      a.r.date.localeCompare(b.r.date) || a.r.voucherNo.localeCompare(b.r.voucherNo) || a.r.type.localeCompare(b.r.type) || a.l.lineNo - b.l.lineNo;
    const cmp = (a: LineItem, b: LineItem): number => main(a, b) || tie(a, b);
    const main = (a: LineItem, b: LineItem): number => {
      switch (sort.key) {
        case "date":
          return 0;
        case "no":
          return a.r.voucherNo.localeCompare(b.r.voucherNo);
        case "partner":
          return collator.compare(reading(a.r.partnerKana, a.r.partnerName), reading(b.r.partnerKana, b.r.partnerName));
        case "product":
          return collator.compare(reading(a.l.productKana, a.l.productName), reading(b.l.productKana, b.l.productName));
        case "quantity":
          return (a.l.quantity ?? 0) - (b.l.quantity ?? 0);
        case "amount":
          return (a.l.amount ?? 0) - (b.l.amount ?? 0);
      }
    };
    return [...lineItems].sort((a, b) => (sort.desc ? -cmp(a, b) : cmp(a, b)));
  }, [lineItems, sort]);

  const sortedVouchers = useMemo(() => {
    const tie = (a: SearchRow, b: SearchRow) =>
      a.date.localeCompare(b.date) || a.voucherNo.localeCompare(b.voucherNo) || a.type.localeCompare(b.type);
    const cmp = (a: SearchRow, b: SearchRow): number => main(a, b) || tie(a, b);
    const main = (a: SearchRow, b: SearchRow): number => {
      switch (sort.key) {
        case "no":
          return a.voucherNo.localeCompare(b.voucherNo);
        case "partner":
          return collator.compare(reading(a.partnerKana, a.partnerName), reading(b.partnerKana, b.partnerName));
        case "amount":
          return a.amount - b.amount;
        default:
          return 0;
      }
    };
    return [...rows].sort((a, b) => (sort.desc ? -cmp(a, b) : cmp(a, b)));
  }, [rows, sort]);

  const byType = (Object.keys(TYPE_LABEL) as SearchType[])
    .map((t) => {
      const list = rows.filter((r) => r.type === t);
      return { type: t, count: list.length, amount: list.reduce((a, r) => a + r.amount, 0) };
    })
    .filter((s) => s.count > 0);

  const header = (key: SortKey, label: string, align: "left" | "right" = "left") => (
    <th className={`px-3 py-2 whitespace-nowrap ${align === "right" ? "text-right" : ""}`}>
      <button
        type="button"
        onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key === "date" }))}
        className={`inline-flex items-center gap-1 hover:text-blue-600 ${sort.key === key ? "font-bold text-slate-800" : ""}`}
        title="押すと並べ替え（もう一度押すと逆順）"
      >
        {label}
        <span className="text-xs text-slate-400">{sort.key === key ? (sort.desc ? "▼" : "▲") : "⇅"}</span>
      </button>
    </th>
  );

  return (
    <section className="space-y-3">
      <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
        <p className="font-semibold text-slate-700">
          検索結果: {rows.length.toLocaleString()}件
          {view === "line" && `（明細 ${lineItems.length.toLocaleString()}行）`}
          <span className="ml-3 text-xs font-normal text-slate-500">
            見出しを押すと並べ替えます。{view === "line" ? "明細" : "伝票"}の行を押すと、その伝票を表示します。
          </span>
        </p>
        {byType.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-slate-600">
            {byType.map((s) => (
              <li key={s.type} className="flex items-center gap-2">
                <TypeBadge type={s.type} />
                {s.count.toLocaleString()}件・合計 {yen(s.amount)}円
              </li>
            ))}
          </ul>
        )}
        {result.truncated.length > 0 && (
          <p className="mt-2 text-xs text-amber-700">
            {result.truncated.map((t) => TYPE_LABEL[t]).join("・")}は、該当が多いため新しい順に{MAX_PER_TYPE_NOTE}
            件までを表示しています。期間などで絞り込んでください。
          </p>
        )}
        {result.skippedForStaff.length > 0 && (
          <p className="mt-2 text-xs text-slate-500">
            {result.skippedForStaff.map((t) => TYPE_LABEL[t]).join("・")}には担当者が無いため、担当者で探すときは対象外です。
          </p>
        )}
        {result.skippedForProduct.length > 0 && (
          <p className="mt-2 text-xs text-slate-500">
            {result.skippedForProduct.map((t) => TYPE_LABEL[t]).join("・")}には商品の明細が無いため、商品名・規格で探すときは対象外です。
          </p>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-400">
          条件に合う伝票はありません。
        </p>
      ) : view === "line" ? (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-left whitespace-nowrap text-slate-600">
              <tr>
                <th className="px-3 py-2">種類</th>
                {header("no", "伝票番号")}
                {header("date", "日付")}
                {header("partner", "得意先・仕入先")}
                {header("product", "商品名（ふりがな順）")}
                <th className="px-3 py-2">規格</th>
                {header("quantity", "数量", "right")}
                <th className="px-3 py-2">単位</th>
                <th className="px-3 py-2 text-right">単価</th>
                {header("amount", "金額", "right")}
              </tr>
            </thead>
            <tbody>
              {sortedLines.map(({ r, l }) => (
                <tr
                  key={`${r.type}${r.id}-${l.lineNo}`}
                  onClick={() => setOpened(r)}
                  className="cursor-pointer border-t border-slate-100 hover:bg-blue-50 active:bg-blue-100"
                >
                  <td className="px-3 py-2">
                    <TypeBadge type={r.type} />
                  </td>
                  <td className="px-3 py-2 font-mono text-blue-600">{r.voucherNo}</td>
                  <td className="px-3 py-2">{slash(r.date)}</td>
                  <td className="px-3 py-2">
                    <span className="font-mono text-slate-500">{r.partnerCode}</span> {r.partnerName}
                  </td>
                  <td className="px-3 py-2">{l.productName}</td>
                  <td className="px-3 py-2 text-slate-600">{l.spec}</td>
                  <td className="px-3 py-2 text-right">{qty(l.quantity)}</td>
                  <td className="px-3 py-2">{l.unit}</td>
                  <td className="px-3 py-2 text-right">{price(l.price)}</td>
                  <td className="px-3 py-2 text-right">{yen(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-left whitespace-nowrap text-slate-600">
              <tr>
                <th className="px-3 py-2">種類</th>
                {header("no", "伝票番号")}
                {header("date", "日付")}
                {header("partner", "得意先・仕入先")}
                <th className="px-3 py-2">担当者</th>
                {header("amount", "金額", "right")}
                <th className="px-3 py-2">明細</th>
              </tr>
            </thead>
            <tbody>
              {sortedVouchers.map((r) => {
                const shown = lineFilter ? r.lines.filter((l) => l.matched) : r.lines;
                const first = shown[0];
                return (
                  <tr
                    key={`${r.type}${r.id}`}
                    onClick={() => setOpened(r)}
                    className="cursor-pointer border-t border-slate-100 hover:bg-blue-50 active:bg-blue-100"
                  >
                    <td className="px-3 py-2">
                      <TypeBadge type={r.type} />
                    </td>
                    <td className="px-3 py-2 font-mono text-blue-600">{r.voucherNo}</td>
                    <td className="px-3 py-2">{slash(r.date)}</td>
                    <td className="px-3 py-2">
                      <span className="font-mono text-slate-500">{r.partnerCode}</span> {r.partnerName}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{r.staffName ?? ""}</td>
                    <td className="px-3 py-2 text-right">{yen(r.amount)}</td>
                    <td className="px-3 py-2 text-slate-600">
                      {first && (
                        <>
                          {first.productName}
                          {first.spec ? `（${first.spec}）` : ""}
                          {r.lines.length > 1 && <span className="ml-1 text-xs text-slate-400">ほか{r.lines.length - 1}行</span>}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {opened && <VoucherPanel row={opened} lineFilter={lineFilter} onClose={() => setOpened(null)} />}
    </section>
  );
}

// 行を押したときに、検索結果の上に重ねて表示する伝票の内容（閉じると検索結果に戻る）
function VoucherPanel({ row, lineFilter, onClose }: { row: SearchRow; lineFilter: boolean; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const hasProducts = row.type === "sales" || row.type === "purchase" || row.type === "quotation";
  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/40 sm:items-start sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-label={`${TYPE_LABEL[row.type]} ${row.voucherNo}`}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden bg-white shadow-xl sm:rounded-lg"
        style={{ borderTop: `6px solid ${workColorFor(TYPE_HREF[row.type]) ?? "#e2e8f0"}` }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <TypeBadge type={row.type} />
            <span className="font-mono text-lg font-bold text-slate-800">{row.voucherNo}</span>
            <span className="text-sm text-slate-500">{slash(row.date)}</span>
          </div>
          <div className="flex gap-2">
            <Link
              href={row.href}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              詳細画面を開く
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="rounded bg-slate-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              閉じる
            </button>
          </div>
        </div>
        <div className="overflow-y-auto px-5 py-4">
          <dl className="mb-4 grid grid-cols-[6rem_1fr] gap-y-1 text-sm">
            <dt className="text-slate-500">{row.type === "purchase" || row.type === "payment" ? "仕入先" : "得意先"}</dt>
            <dd>
              <span className="font-mono text-slate-500">{row.partnerCode}</span> {row.partnerName}
            </dd>
            {row.staffCode && (
              <>
                <dt className="text-slate-500">担当者</dt>
                <dd>
                  <span className="font-mono text-slate-500">{row.staffCode}</span> {row.staffName}
                </dd>
              </>
            )}
            {row.remarks && (
              <>
                <dt className="text-slate-500">{row.type === "quotation" ? "件名・備考" : "摘要"}</dt>
                <dd>{row.remarks}</dd>
              </>
            )}
          </dl>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-xs text-slate-500">
                <tr>
                  <th className="py-1.5 pr-3">行</th>
                  <th className="py-1.5 pr-3">{hasProducts ? "商品名" : "区分"}</th>
                  {hasProducts && <th className="py-1.5 pr-3">規格</th>}
                  {hasProducts && <th className="py-1.5 pr-3 text-right">数量</th>}
                  {hasProducts && <th className="py-1.5 pr-3">単位</th>}
                  {hasProducts && <th className="py-1.5 pr-3 text-right">単価</th>}
                  <th className="py-1.5 pr-3 text-right">金額</th>
                  <th className="py-1.5">備考</th>
                </tr>
              </thead>
              <tbody>
                {row.lines.map((l) => (
                  <tr
                    key={l.lineNo}
                    className={`border-b border-slate-100 ${lineFilter && l.matched ? "bg-yellow-50 font-semibold" : ""}`}
                  >
                    <td className="py-1.5 pr-3 text-slate-400">{l.lineNo}</td>
                    <td className="py-1.5 pr-3">{l.productName}</td>
                    {hasProducts && <td className="py-1.5 pr-3 text-slate-600">{l.spec}</td>}
                    {hasProducts && <td className="py-1.5 pr-3 text-right">{qty(l.quantity)}</td>}
                    {hasProducts && <td className="py-1.5 pr-3">{l.unit}</td>}
                    {hasProducts && <td className="py-1.5 pr-3 text-right">{price(l.price)}</td>}
                    <td className="py-1.5 pr-3 text-right">{yen(l.amount)}</td>
                    <td className="py-1.5 text-slate-500">{l.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="mt-4 ml-auto grid max-w-xs grid-cols-2 gap-y-1 text-sm">
            <dt className="text-slate-500">{row.type === "quotation" ? "見積金額" : row.type === "sales" || row.type === "purchase" ? "金額（税抜）" : "金額"}</dt>
            <dd className="text-right">{yen(row.amount)}</dd>
            {row.tax !== null && (
              <>
                <dt className="text-slate-500">消費税</dt>
                <dd className="text-right">{yen(row.tax)}</dd>
                <dt className="font-semibold text-slate-700">合計</dt>
                <dd className="text-right font-semibold">{yen(row.amount + row.tax)}</dd>
              </>
            )}
          </dl>
          {lineFilter && <p className="mt-3 text-xs text-slate-500">黄色の行が、検索した商品名・規格に当てはまった明細です。</p>}
        </div>
      </div>
    </div>
  );
}
