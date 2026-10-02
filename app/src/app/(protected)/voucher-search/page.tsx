import { prisma } from "@/lib/prisma";
import { parseSearchParams, searchVouchers } from "@/lib/voucher-search";
import { SearchForm } from "./SearchForm";
import { SearchResults } from "./SearchResults";

export default async function VoucherSearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const params = parseSearchParams(sp);
  // 表示モードの既定は明細モード
  const view = sp.view === "voucher" ? "voucher" : "line";
  const searched = params.types.length > 0;
  const [result, staffOptions] = await Promise.all([
    searched ? searchVouchers(params) : null,
    // 担当者の一覧（入力欄から選べるように。退職などで無効にした担当者も、過去の伝票を探すため含める）
    prisma.staff.findMany({ select: { code: true, name: true }, orderBy: { code: "asc" } }),
  ]);
  // 検索のたびに入力欄と結果を今の条件で作り直す（「条件をクリア」で空に戻し、並べ替えも既定に戻すため）
  const key = JSON.stringify(sp);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-1 text-lg font-bold text-slate-800">伝票検索</h1>
        <p className="text-sm text-slate-600">
          売上・仕入・入金・支払伝票と見積書を、得意先・仕入先、担当者、商品名・規格、期間などでまとめて探せます。
        </p>
      </div>

      <SearchForm key={`f${key}`} params={params} view={view} staffOptions={staffOptions} />

      {result && (
        <SearchResults key={`r${key}`} result={result} view={view} lineFilter={!!(params.product || params.spec)} />
      )}
    </div>
  );
}
