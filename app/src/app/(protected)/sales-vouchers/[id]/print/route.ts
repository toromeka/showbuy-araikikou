import { auth } from "@/auth";
import { pdfResponse } from "@/lib/pdf";
import { deliveryNotePdf } from "@/lib/print/delivery-note";

// 納品書PDF（プレビュー用）。レイアウトは src/lib/print/delivery-note.ts
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const result = await deliveryNotePdf(id);
  return result ? pdfResponse(result) : new Response("Not Found", { status: 404 });
}
