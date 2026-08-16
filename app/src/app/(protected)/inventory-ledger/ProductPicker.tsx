"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { searchProducts, type ProductSearchResult } from "@/lib/actions/sales-vouchers";

export function ProductPicker() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function handleQueryChange(v: string) {
    setQuery(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (v.trim().length === 0) {
      setResults([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const r = await searchProducts(v);
      setResults(r);
      setOpen(r.length > 0);
    }, 300);
  }

  function selectProduct(p: ProductSearchResult) {
    router.push(`/inventory-ledger?product=${encodeURIComponent(p.code)}`);
  }

  return (
    <div className="relative max-w-lg">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">商品コード・商品名で検索</span>
        <input
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="商品コード or 商品名で検索"
          className="input"
          autoFocus
        />
      </label>
      {open && (
        <ul className="absolute z-10 mt-1 max-h-72 w-full overflow-y-auto rounded border border-slate-200 bg-white shadow-lg">
          {results.map((p) => (
            <li key={p.code}>
              <button
                type="button"
                onMouseDown={() => selectProduct(p)}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-blue-50"
              >
                <span className="font-mono text-slate-400">{p.code}</span> {p.name}
                {p.spec ? ` (${p.spec})` : ""}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
