import { importCustomersCsv } from "@/lib/actions/import";
import { ImportForm } from "../../_components/ImportForm";

export default function ImportCustomersPage() {
  return (
    <ImportForm
      action={importCustomersCsv}
      title="得意先マスタ - CSV取り込み"
      headerHint="得意先コード, 得意先名称1, 得意先名称2, 得意先略称, フリガナ, 締日, 集金日, 集金区分, 集金備考, 担当者コード, 郵便番号, 地区コード, 住所1, 住所2, 電話番号, FAX番号, 携帯番号, 請求先コード, 分類区分1〜3, 売上単価ランク, 掛率, 備考, 敬称, 課税方式, 計算方式, 丸め方式"
      backHref="/customers"
    />
  );
}
