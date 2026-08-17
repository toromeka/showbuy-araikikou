"use client";

import { useEffect, useRef, useState } from "react";

export type SearchDialogColumn<T> = {
  header: string;
  render: (item: T) => React.ReactNode;
  className?: string;
};

type SearchDialogBaseProps<T> = {
  open: boolean;
  title: string;
  columns: SearchDialogColumn<T>[];
  getKey: (item: T) => string;
  onSelect: (item: T) => void;
  onClose: () => void;
  placeholder?: string;
};

type SearchDialogProps<T> =
  | (SearchDialogBaseProps<T> & {
      // 得意先・仕入先マスタなど、あらかじめ全件取得済みの配列をクライアント側で絞り込む場合
      items: T[];
      filterFn: (item: T, query: string) => boolean;
      fetchResults?: never;
    })
  | (SearchDialogBaseProps<T> & {
      // 商品マスタなど件数が多く、サーバーアクションで都度検索する場合
      items?: never;
      filterFn?: never;
      fetchResults: (query: string) => Promise<T[]>;
    });

/**
 * F8キーで開く検索ダイアログ。呼び出し元（商品・得意先・仕入先など）によって
 * columns / 検索方法（クライアント側絞り込み or サーバー検索）を渡し分けて使う。
 */
export function SearchDialog<T>(props: SearchDialogProps<T>) {
  const { open, title, columns, getKey, onSelect, onClose, placeholder } = props;
  const [query, setQuery] = useState("");
  const [wasOpen, setWasOpen] = useState(false);
  const [serverResults, setServerResults] = useState<T[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ダイアログが開いた直後は検索語をリセットする（レンダー中に検知して反映する。
  // useEffect内でのsetStateは避け、Reactが推奨する「レンダー中の状態調整」パターンを使う）
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open && query !== "") setQuery("");
  }

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open || props.items) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q === "") return; // 空欄の表示結果はresults算出側で処理する
    debounceRef.current = setTimeout(async () => {
      setServerResults(await props.fetchResults(q));
    }, 300);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open]);

  const results = props.items
    ? query.trim() === ""
      ? props.items
      : props.items.filter((i) => props.filterFn(i, query.trim()))
    : query.trim() === ""
      ? []
      : serverResults;

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-24"
      onMouseDown={onClose}
      data-testid="search-dialog"
    >
      <div
        className="w-full max-w-2xl rounded-lg bg-white shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-200 p-4">
          <div className="mb-2 text-sm font-bold text-slate-700">{title}</div>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            data-testid="search-dialog-input"
            onKeyDown={(e) => {
              // ダイアログはフォームの中に描画されることがあるため、Enterでの誤送信を防ぎつつ
              // 先頭候補を選択できるようにする
              if (e.key === "Enter") {
                e.preventDefault();
                if (results.length > 0) onSelect(results[0]);
              }
            }}
            placeholder={placeholder ?? "コード or 名称で検索"}
            className="input"
          />
        </div>
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500">
              <tr>
                {columns.map((c, i) => (
                  <th key={i} className={`px-3 py-2 font-medium ${c.className ?? ""}`}>
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.map((item) => (
                <tr
                  key={getKey(item)}
                  className="cursor-pointer border-t border-slate-100 hover:bg-blue-50"
                  onClick={() => onSelect(item)}
                >
                  {columns.map((c, i) => (
                    <td key={i} className={`px-3 py-2 ${c.className ?? ""}`}>
                      {c.render(item)}
                    </td>
                  ))}
                </tr>
              ))}
              {results.length === 0 && (
                <tr>
                  <td colSpan={columns.length} className="px-3 py-6 text-center text-xs text-slate-400">
                    {query.trim() ? "該当なし" : "キーワードを入力してください"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 p-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-4 py-1.5 text-sm text-slate-500 hover:bg-slate-100"
          >
            閉じる（Esc）
          </button>
        </div>
      </div>
    </div>
  );
}

/** テキスト入力の onKeyDown に渡す。F8キーでダイアログを開く。 */
export function openOnF8(open: () => void) {
  return (e: React.KeyboardEvent) => {
    if (e.key === "F8") {
      e.preventDefault();
      open();
    }
  };
}
