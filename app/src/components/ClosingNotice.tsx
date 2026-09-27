"use client";

import { useEffect, useState } from "react";
import { getLastClosingDate } from "@/lib/actions/closing-info";

/**
 * 伝票日付が、得意先（仕入先）の直近の締め日以前のときに注意書きを出す。
 * 直近の締めは取り消して修正できる運用のため入力自体は止めず、締め日を過ぎた期間の伝票で
 * あることだけを知らせる。
 */
export function ClosingNotice({
  kind,
  code,
  voucherDate,
}: {
  kind: "customer" | "supplier";
  code: string;
  voucherDate: string;
}) {
  const [closing, setClosing] = useState<{ code: string; date: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getLastClosingDate(kind, code).then((date) => {
      if (!cancelled) setClosing({ code, date });
    });
    return () => {
      cancelled = true;
    };
  }, [kind, code]);

  const lastClosing = closing?.code === code ? closing.date : null;
  if (!lastClosing || !voucherDate || voucherDate > lastClosing) return null;

  const partner = kind === "customer" ? "得意先" : "仕入先";
  const target = kind === "customer" ? "請求書" : "仕入支払更新";
  const redo =
    kind === "customer"
      ? "請求書を発行済みの場合は、請求更新を取り消してから修正し、実行し直してください。"
      : "仕入支払更新を実行済みの場合は、取り消してから修正し、実行し直してください。";
  return (
    <p className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      この伝票の日付は、この{partner}の直近の締め日（{lastClosing.replaceAll("-", "/")}）以前です。
      締め日を過ぎた期間の伝票を登録・修正すると、{target}の内容と食い違うことがあります。{redo}
    </p>
  );
}
