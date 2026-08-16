"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteReceiptVoucher } from "@/lib/actions/receipt-vouchers";

export function DeleteButton({ id }: { id: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (!confirm("この入金伝票を削除します。よろしいですか？（元に戻せません）")) return;
    startTransition(async () => {
      const result = await deleteReceiptVoucher(id);
      if (result.error) {
        alert(result.error);
        return;
      }
      router.push("/receipt-vouchers");
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
