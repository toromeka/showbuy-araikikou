import { agentJson, authenticateAgent, claimedJob, finishJob, renderPrintPdf } from "@/lib/print/jobs";

// 印刷係が取り出した依頼の帳票PDF
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const agent = await authenticateAgent(req);
  if (!agent) return agentJson({ error: "接続キーが正しくないか、無効になっています。" }, 401);

  const { id } = await params;
  const job = await claimedJob(agent.id, id);
  if (!job) return agentJson({ error: "この依頼は印刷中ではありません。" }, 404);

  const result = await renderPrintPdf(job.doc_type, job.target_id);
  if (!result) {
    await finishJob(agent.id, id, false, "印刷する帳票が見つかりません（削除された可能性があります）。");
    return agentJson({ error: "帳票が見つかりません。" }, 404);
  }
  return new Response(new Uint8Array(result.pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${result.filename}"` },
  });
}
