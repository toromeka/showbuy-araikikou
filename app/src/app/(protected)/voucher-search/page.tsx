import Link from "next/link";
import {
  MAX_PER_TYPE,
  SEARCH_TYPES,
  parseSearchParams,
  searchVouchers,
  type SearchResult,
  type SearchRow,
  type SearchType,
} from "@/lib/voucher-search";
import { workColorFor } from "@/lib/work-colors";
import { SearchForm } from "./SearchForm";

const yen = (n: number | null) => (n === null ? "" : Math.round(n).toLocaleString());
const qty = (n: number | null) => (n === null ? "" : n.toLocaleString("ja-JP", { maximumFractionDigits: 3 }));
const price = (n: number | null) =>
  n === null ? "" : n.toLocaleString("ja-JP", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const slash = (iso: string) => iso.replace(/-/g, "/");

const TYPE_HREF: Record<SearchType, string> = {
  sales: "/sales-vouchers",
  purchase: "/purchase-vouchers",
  receipt: "/receipt-vouchers",
  payment: "/payment-vouchers",
  quotation: "/quotations",
};

function TypeBadge({ type }: { type: SearchType }) {
  return (
    <span
      className="rounded border border-slate-300 px-2 py-0.5 text-xs whitespace-nowrap text-slate-700"
      style={{ backgroundColor: workColorFor(TYPE_HREF[type]) ?? "#f1f5f9" }}
    >
      {SEARCH_TYPES[type].label}
    </span>
  );
}

export default async function VoucherSearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const params = parseSearchParams(sp);
  const view = sp.view === "line" ? "line" : "voucher";
  const searched = params.types.length > 0;
  const result = searched ? await searchVouchers(params) : null;
  // 検索のたびに入力欄を今の条件で作り直す（「条件をクリア」で空に戻すため）
  const formKey = JSON.stringify(sp);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-1 text-lg font-bold text-slate-800">伝票検索</h1>
        <p className="text-sm text-slate-600">
          売上・仕入・入金・支払伝票と見積書を、得意先・仕入先、商品名・規格、期間などでまとめて探せます。
        </p>
      </div>

      <SearchForm key={formKey} params={params} output={view} />

      {result && <Results result={result} view={view} lineFilter={!!(params.product || params.spec)} />}
    </div>
  );
}

function Results({ result, view, lineFilter }: { result: SearchResult; view: "voucher" | "line"; lineFilter: boolean }) {
  const { rows } = result;
  const byType = (Object.keys(SEARCH_TYPES) as SearchType[])
    .map((t) => {
      const list = rows.filter((r) => r.type === t);
      return { type: t, count: list.length, amount: list.reduce((a, r) => a + r.amount, 0) };
    })
    .filter((s) => s.count > 0);
  const lineRows = rows.flatMap((r) => (lineFilter ? r.lines.filter((l) => l.matched) : r.lines).map((l) => ({ r, l })));

  return (
    <section className="space-y-3">
      <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
        <p className="font-semibold text-slate-700">
          検索結果: {rows.length.toLocaleString()}件
          {view === "line" && `（明細 ${lineRows.length.toLocaleString()}行）`}
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
            {result.truncated.map((t) => SEARCH_TYPES[t].label).join("・")}は、該当が多いため新しい順に{MAX_PER_TYPE}件までを表示しています。期間などで絞り込んでください。
          </p>
        )}
        {result.skippedForProduct.length > 0 && (
          <p className="mt-2 text-xs text-slate-500">
            {result.skippedForProduct.map((t) => SEARCH_TYPES[t].label).join("・")}には商品の明細が無いため、商品名・規格で探すときは対象外です。
          </p>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-400">
          条件に合う伝票はありません。
        </p>
      ) : view === "voucher" ? (
        <VoucherTable rows={rows} lineFilter={lineFilter} />
      ) : (
        <LineTable lineRows={lineRows} />
      )}
    </section>
  );
}

function VoucherTable({ rows, lineFilter }: { rows: SearchRow[]; lineFilter: boolean }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-100 text-left text-slate-600">
          <tr>
            <th className="px-3 py-2">種類</th>
            <th className="px-3 py-2">伝票番号</th>
            <th className="px-3 py-2">日付</th>
            <th className="px-3 py-2">得意先・仕入先</th>
            <th className="px-3 py-2 text-right">金額</th>
            <th className="px-3 py-2">明細</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const shown = lineFilter ? r.lines.filter((l) => l.matched) : r.lines;
            const first = shown[0];
            const rest = r.lines.length - 1;
            return (
              <tr key={`${r.type}${r.id}`} className="border-t border-slate-100 align-top hover:bg-slate-50">
                <td className="px-3 py-2">
                  <TypeBadge type={r.type} />
                </td>
                <td className="px-3 py-2 font-mono">
                  <Link href={r.href} className="text-blue-600 hover:underline">
                    {r.voucherNo}
                  </Link>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{slash(r.date)}</td>
                <td className="px-3 py-2">
                  <span className="font-mono text-slate-500">{r.partnerCode}</span> {r.partnerName}
                </td>
                <td className="px-3 py-2 text-right">{yen(r.amount)}</td>
                <td className="px-3 py-2 text-slate-600">
                  {first ? (
                    <>
                      {first.productName}
                      {first.spec ? `（${first.spec}）` : ""}
                      {rest > 0 && <span className="ml-1 text-xs text-slate-400">ほか{rest}行</span>}
                    </>
                  ) : (
                    ""
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function LineTable({ lineRows }: { lineRows: { r: SearchRow; l: SearchRow["lines"][number] }[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-100 text-left text-slate-600">
          <tr>
            <th className="px-3 py-2">種類</th>
            <th className="px-3 py-2">伝票番号</th>
            <th className="px-3 py-2">日付</th>
            <th className="px-3 py-2">得意先・仕入先</th>
            <th className="px-3 py-2">商品名・区分</th>
            <th className="px-3 py-2">規格</th>
            <th className="px-3 py-2 text-right">数量</th>
            <th className="px-3 py-2">単位</th>
            <th className="px-3 py-2 text-right">単価</th>
            <th className="px-3 py-2 text-right">金額</th>
          </tr>
        </thead>
        <tbody>
          {lineRows.map(({ r, l }) => (
            <tr key={`${r.type}${r.id}-${l.lineNo}`} className="border-t border-slate-100 hover:bg-slate-50">
              <td className="px-3 py-2">
                <TypeBadge type={r.type} />
              </td>
              <td className="px-3 py-2 font-mono">
                <Link href={r.href} className="text-blue-600 hover:underline">
                  {r.voucherNo}
                </Link>
              </td>
              <td className="px-3 py-2 whitespace-nowrap">{slash(r.date)}</td>
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
  );
}
