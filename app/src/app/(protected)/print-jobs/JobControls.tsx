"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { cancelPrintJob, deactivateAgent } from "@/lib/actions/print";

// 印刷状況を数秒ごとに最新にする
export function AutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [router]);
  return null;
}

export function CancelJobButton({ id }: { id: string }) {
  return (
    <button
      type="button"
      onClick={async () => {
        if (!confirm("この印刷の依頼を取り消しますか？")) return;
        const res = await cancelPrintJob(id);
        if (res.message) alert(res.message);
      }}
      className="text-xs text-red-600 hover:underline"
    >
      取り消す
    </button>
  );
}

export function DeactivateAgentButton({ id, name }: { id: number; name: string }) {
  return (
    <button
      type="button"
      onClick={async () => {
        if (!confirm(`「${name}」を無効にしますか？ このパソコンからは印刷できなくなります。`)) return;
        const res = await deactivateAgent(id);
        if (res.message) alert(res.message);
      }}
      className="text-xs text-red-600 hover:underline"
    >
      無効にする
    </button>
  );
}
