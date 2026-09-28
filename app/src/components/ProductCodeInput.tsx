"use client";

import { useRef, useState } from "react";
import { findProductByCode, searchProducts, type ProductSearchResult } from "@/lib/actions/sales-vouchers";
import { SearchButton, SearchDialog, openOnF8 } from "@/components/SearchDialog";

/**
 * 伝票明細の「商品コード」欄。旧システムと同じく、コードを入力してEnter（または欄を移動）すると
 * 商品マスタから品名・規格・単位・単価を引き、F8キーで商品検索ダイアログを開く。
 * 手打ち用コード（"1"）の場合、品名は呼び出し側で自由入力させる。
 */
export function ProductCodeInput({
  code,
  onCodeChange,
  onResolved,
  priceColumn,
}: {
  code: string;
  onCodeChange: (code: string) => void;
  onResolved: (product: ProductSearchResult) => void;
  priceColumn: "sale" | "cost";
}) {
  const [notFound, setNotFound] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  // この欄に利用者が入力したときだけ商品を引き直す（品名欄から商品を選んだ後や、編集画面を開いた直後に
  // 欄を移動しただけで、手で直した品名・単価が上書きされないようにするため）
  const dirty = useRef(false);

  async function resolve() {
    if (!dirty.current) return;
    dirty.current = false;
    const c = code.trim();
    if (c === "") {
      setNotFound(false);
      return;
    }
    const product = await findProductByCode(c);
    if (product) {
      setNotFound(false);
      onResolved(product);
    } else {
      setNotFound(true);
    }
  }

  return (
    <>
      <div className="flex gap-1">
        <input
          value={code}
          onChange={(e) => {
            dirty.current = true;
            setNotFound(false);
            onCodeChange(e.target.value);
          }}
          onBlur={resolve}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              // フォーム送信を防ぎ、その場でコードを確定する
              e.preventDefault();
              void resolve();
              return;
            }
            openOnF8(() => setDialogOpen(true))(e);
          }}
          placeholder="F8キーで検索"
          aria-label="商品コード"
          className={`input min-w-0 flex-1 font-mono ${notFound ? "border-red-400" : ""}`}
        />
        <SearchButton onClick={() => setDialogOpen(true)} label="商品検索" />
      </div>
      {notFound && <span className="mt-1 block text-xs text-red-600">該当する商品なし</span>}
      <SearchDialog
        open={dialogOpen}
        title="商品検索"
        fetchResults={searchProducts}
        getKey={(p) => p.code}
        columns={[
          { header: "コード", render: (p) => p.code, className: "font-mono text-slate-500" },
          { header: "商品名", render: (p) => p.name },
          { header: "規格", render: (p) => p.spec ?? "" },
          priceColumn === "sale"
            ? { header: "売上単価1", render: (p) => p.sale_price_1 ?? "", className: "text-right" }
            : { header: "標準仕入単価", render: (p) => p.standard_cost ?? "", className: "text-right" },
        ]}
        onSelect={(p) => {
          dirty.current = false;
          setNotFound(false);
          setDialogOpen(false);
          onResolved(p);
        }}
        onClose={() => setDialogOpen(false)}
        placeholder="商品コード or 商品名で検索"
      />
    </>
  );
}
