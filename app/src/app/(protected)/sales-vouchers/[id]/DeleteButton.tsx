"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteSalesVoucher } from "@/lib/actions/sales-vouchers";

export function DeleteButton({ id }: { id: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (!confirm("この売上伝票を削除します。よろしいですか？（元に戻せません）")) return;
    startTransition(async () => {
      const result = await deleteSalesVoucher(id);
      if (result.error) {
        alert(result.error);
        return;
      }
      router.push("/sales-vouchers");
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="rounded border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
    >
      {isPending ? "削除中..." : "削除"}
    </button>
  );
}
