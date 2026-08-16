import { importProductsCsv } from "@/lib/actions/import";
import { ImportForm } from "../../_components/ImportForm";

export default function ImportProductsPage() {
  return (
    <ImportForm
      action={importProductsCsv}
      title="商品マスタ - CSV取り込み"
      headerHint="商品コード, 商品名, 規格, フリガナ, 単位, 消費税区分, 在庫区分, 原価区分, 大分類コード, 中分類コード, 小分類コード, 分類区分1〜3, 売上単価1〜5, 標準仕入単価, 最終仕入単価, 移動平均単価"
      backHref="/products"
    />
  );
}
