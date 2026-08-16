import { importSuppliersCsv } from "@/lib/actions/import";
import { ImportForm } from "../../_components/ImportForm";

export default function ImportSuppliersPage() {
  return (
    <ImportForm
      action={importSuppliersCsv}
      title="仕入先マスタ - CSV取り込み"
      headerHint="仕入先コード, 仕入先名称1, 仕入先名称2, 仕入先略称, フリガナ, 締日, 支払日, 担当者コード, 郵便番号, 住所1, 住所2, 電話番号, FAX番号, 携帯番号, 備考, 課税方式, 計算方式, 丸め方式"
      backHref="/suppliers"
    />
  );
}
