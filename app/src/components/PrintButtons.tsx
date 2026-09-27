"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { getPrintJobStatus, requestPrint } from "@/lib/actions/print";

type Props = {
  docType: "delivery_note" | "quotation" | "invoice";
  targetId: string;
  previewHref: string;
  // 一覧表の行の中に置くときは小さく表示する
  compact?: boolean;
};

type View =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "waiting"; jobId: string; cassette: number; agentOnline: boolean; status: string }
  | { kind: "done"; cassette: number }
  | { kind: "error"; message: string };

const POLL_MS = 2000;

// 「プレビュー」（PDFを別タブで開く）と「印刷する」（事務所のプリンターの指定カセットへ直接印刷）のボタン。
// 印刷を依頼したあとは、印刷が終わるまで状況を表示する。
export function PrintButtons({ docType, targetId, previewHref, compact }: Props) {
  const [view, setView] = useState<View>({ kind: "idle" });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function poll(jobId: string, cassette: number) {
    timer.current = setTimeout(async () => {
      const s = await getPrintJobStatus(jobId);
      if (!s) return setView({ kind: "error", message: "印刷の状況を確認できませんでした。" });
      if (s.status === "done") return setView({ kind: "done", cassette });
      if (s.status === "error") return setView({ kind: "error", message: s.error || "印刷に失敗しました。" });
      if (s.status === "canceled") return setView({ kind: "error", message: "印刷の依頼は取り消されました。" });
      setView({ kind: "waiting", jobId, cassette, agentOnline: s.agentOnline, status: s.status });
      poll(jobId, cassette);
    }, POLL_MS);
  }

  async function handlePrint() {
    if (timer.current) clearTimeout(timer.current);
    setView({ kind: "sending" });
    const res = await requestPrint(docType, targetId);
    if (!res.ok) return setView({ kind: "error", message: res.message });
    setView({ kind: "waiting", jobId: res.jobId, cassette: res.cassette, agentOnline: res.agentOnline, status: "pending" });
    poll(res.jobId, res.cassette);
  }

  const busy = view.kind === "sending" || view.kind === "waiting";
  const btn = compact
    ? "rounded border border-slate-300 bg-white px-2 py-0.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
    : "rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50";
  const printBtn = compact
    ? "rounded bg-blue-600 px-2 py-0.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
    : "rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60";

  return (
    <div className={compact ? "inline-flex flex-col items-end gap-1" : "flex flex-col items-end gap-1"}>
      <div className="flex gap-2 whitespace-nowrap">
        <a href={previewHref} target="_blank" rel="noopener noreferrer" className={btn}>
          プレビュー
        </a>
        <button type="button" onClick={handlePrint} disabled={busy} className={printBtn}>
          {view.kind === "sending" ? "依頼中..." : "印刷する"}
        </button>
      </div>
      <StatusText view={view} compact={compact} />
    </div>
  );
}

function StatusText({ view, compact }: { view: View; compact?: boolean }) {
  // 案内文は折り返して、同じ行の他のボタンを押しつぶさないようにする
  const size = compact ? "max-w-[14rem] text-right text-[11px]" : "max-w-[16rem] text-right text-xs";
  if (view.kind === "waiting") {
    if (!view.agentOnline && view.status === "pending") {
      return (
        <p className={`${size} text-amber-700`}>
          印刷係のパソコンが接続されていないため、印刷待ちです。接続されると印刷されます（
          <Link href="/print-jobs" className="underline">
            印刷状況
          </Link>
          ）
        </p>
      );
    }
    return (
      <p className={`${size} text-slate-500`}>
        {view.status === "printing" ? "印刷中です" : "印刷を依頼しました"}（カセット{view.cassette}）...
      </p>
    );
  }
  if (view.kind === "done") return <p className={`${size} text-green-700`}>印刷しました（カセット{view.cassette}）</p>;
  if (view.kind === "error") return <p className={`${size} text-red-600`}>{view.message}</p>;
  return null;
}
