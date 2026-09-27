"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { reversePaymentClosing } from "@/lib/actions/payment-closings";

export function ReverseButton({ id }: { id: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (
      !confirm(
        "この仕入支払更新を取り消します。対象の仕入伝票は「未払」に戻ります。\n\n締め日を過ぎた期間の支払更新です。伝票を修正したら仕入支払更新を実行し直してください。\n（取り消せるのは各仕入先の一番新しい仕入支払更新だけです）\n\nよろしいですか？（元に戻せません）",
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await reversePaymentClosing(id);
      if (result.error) {
        alert(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="rounded border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
    >
      {isPending ? "取り消し中..." : "この仕入支払更新を取り消す"}
    </button>
  );
}
