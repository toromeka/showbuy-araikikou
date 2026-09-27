import { agentJson, authenticateAgent, finishJob } from "@/lib/print/jobs";

// 印刷係からの印刷結果の報告（{ ok: true } または { ok: false, error: "..." }）
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const agent = await authenticateAgent(req);
  if (!agent) return agentJson({ error: "接続キーが正しくないか、無効になっています。" }, 401);

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { ok?: unknown; error?: unknown };
  const done = await finishJob(agent.id, id, body.ok === true, typeof body.error === "string" ? body.error : null);
  if (!done) return agentJson({ error: "この依頼は印刷中ではありません。" }, 404);
  return agentJson({ ok: true });
}
