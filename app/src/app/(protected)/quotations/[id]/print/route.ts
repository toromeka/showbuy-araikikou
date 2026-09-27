import { auth } from "@/auth";
import { pdfResponse } from "@/lib/pdf";
import { quotationPdf } from "@/lib/print/quotation";

// 見積書PDF（プレビュー用）。レイアウトは src/lib/print/quotation.ts
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const result = await quotationPdf(id);
  return result ? pdfResponse(result) : new Response("Not Found", { status: 404 });
}
