import { auth } from "@/auth";
import { pdfResponse } from "@/lib/pdf";
import { invoicePdf } from "@/lib/print/invoice";

// 請求書PDF（プレビュー用）。レイアウトは src/lib/print/invoice.ts
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; recordId: string }> },
) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const { id, recordId } = await params;
  const result = await invoicePdf(recordId, id);
  return result ? pdfResponse(result) : new Response("Not Found", { status: 404 });
}
