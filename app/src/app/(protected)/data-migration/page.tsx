import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { MigrationForm } from "./MigrationForm";

export default async function DataMigrationPage() {
  if (!isAdmin(await getCurrentUser())) {
    return <p className="text-sm text-slate-500">この画面は管理者のみ利用できます。</p>;
  }

  return (
    <div>
      <h1 className="mb-2 text-lg font-bold text-slate-800">データ移行（旧システムの伝票の取り込み）</h1>
      <div className="mb-6 space-y-1 text-sm text-slate-600">
        <p>旧システムから出力した売上・仕入・入金伝票のCSVを、まとめて取り込みます。取り込みは1回だけ行う作業です。</p>
        <ul className="list-disc pl-5 text-xs text-slate-500">
          <li>先に「内容を確認」で件数・自動登録されるマスタ・得意先ごとの請求を確認し、問題がなければ「この内容で取り込む」を押してください。</li>
          <li>売上は、各得意先の最初の売上がある締めから直近の締めまでの請求更新を再現します（前回請求残は0から）。直近の締めより後の伝票は未請求のまま取り込みます。</li>
          <li>仕入は、各仕入先の直近の締めまでを支払更新済みとして取り込みます。それより後の仕入は未払のまま取り込みます。</li>
          <li>マスタに無い得意先・仕入先・商品は、伝票に書かれた名前で旧マスタ（無効）として自動登録します。担当者マスタに無い担当者は空欄になります。</li>
          <li>途中でエラーが起きた場合は、何も登録されません。同じ伝票番号が既にある場合は取り込めません。</li>
        </ul>
      </div>
      <MigrationForm />
    </div>
  );
}
