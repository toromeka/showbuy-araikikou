import Link from "next/link";

// 一覧のページ送り。ページ数が多くても横にはみ出さないよう、先頭・末尾と今のページの前後だけを表示する
// （例: ‹ 前へ  1 … 4 5 [6] 7 8 … 58  次へ ›）。
export function Pagination({
  currentPage,
  totalPages,
  href,
}: {
  currentPage: number;
  totalPages: number;
  href: (page: number) => string;
}) {
  if (totalPages <= 1) return null;
  const pages = new Set<number>([1, totalPages]);
  for (let p = currentPage - 2; p <= currentPage + 2; p++) if (p >= 1 && p <= totalPages) pages.add(p);
  const sorted = [...pages].sort((a, b) => a - b);
  const items: (number | "gap")[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) items.push("gap");
    items.push(p);
  });

  const base = "rounded px-3 py-1.5";
  return (
    <nav className="mt-4 flex flex-wrap items-center gap-1.5 text-sm">
      {currentPage > 1 && (
        <Link href={href(currentPage - 1)} className={`${base} bg-white text-slate-600 hover:bg-slate-100`}>
          ‹ 前へ
        </Link>
      )}
      {items.map((it, i) =>
        it === "gap" ? (
          <span key={`gap${i}`} className="px-1 text-slate-400">
            …
          </span>
        ) : (
          <Link
            key={it}
            href={href(it)}
            className={`${base} ${it === currentPage ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-100"}`}
          >
            {it}
          </Link>
        ),
      )}
      {currentPage < totalPages && (
        <Link href={href(currentPage + 1)} className={`${base} bg-white text-slate-600 hover:bg-slate-100`}>
          次へ ›
        </Link>
      )}
    </nav>
  );
}
