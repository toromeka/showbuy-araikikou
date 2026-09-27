import { DailyImportForm } from "./DailyImportForm";

export default function DailyImportPage() {
  return (
    <div>
      <h1 className="mb-2 text-lg font-bold text-slate-800">日計伝票のCSV取り込み</h1>
      <div className="mb-6 space-y-1 text-sm text-slate-600">
        <p>旧システムで入力した売上・仕入の伝票を、日計伝票のCSVから取り込みます。何度でも取り込めます。</p>
        <ul className="list-disc pl-5 text-xs text-slate-500">
          <li>
            CSVの形式はデータ移行と同じです（伝票日付, 伝票番号, 区分, 得意先/仕入先コード, 得意先/仕入先名, 商品コード, 商品名,
            規格, 数量, 単位, 単価, 金額, 備考, 担当者コード, 担当者名, 摘要名）。売上と仕入が1つのファイルに混ざっていて構いません。
          </li>
          <li>区分「売上」の行は売上伝票、「仕入」の行は仕入伝票になります。「摘要」などの行は、同じ伝票番号の伝票に入ります。</li>
          <li>
            既に登録されている伝票番号は取り込みません。前回と期間が重なったCSVでも、新しい伝票だけが取り込まれます。
            同じ番号で内容が違う伝票は一覧に表示するので、どちらが正しいか確認してください。
          </li>
          <li>取り込んだ売上は未請求、仕入は未払として登録され、次回の請求更新・仕入支払更新の対象になります。</li>
          <li>マスタに無い得意先・仕入先・商品は、伝票に書かれた名前で旧マスタ（無効）として自動で登録します。</li>
          <li>先に「内容を確認」で取り込む件数を確認し、問題がなければ「この内容で取り込む」を押してください。</li>
        </ul>
      </div>
      <DailyImportForm />
    </div>
  );
}
