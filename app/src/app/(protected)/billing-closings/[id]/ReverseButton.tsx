"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { reverseBillingClosing } from "@/lib/actions/billing-closings";

export function ReverseButton({ id }: { id: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (
      !confirm(
        "この請求更新を取り消します。対象の売上伝票は「未請求」に戻ります。\n\n締め日を過ぎた期間の請求です。伝票を修正したら請求更新を実行し直し、発行済みの請求書は差し替えてください。\n（取り消せるのは各得意先の一番新しい請求更新だけです）\n\nよろしいですか？（元に戻せません）",
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await reverseBillingClosing(id);
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
      {isPending ? "取り消し中..." : "この請求更新を取り消す"}
    </button>
  );
}
