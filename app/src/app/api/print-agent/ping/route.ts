import { agentJson, authenticateAgent } from "@/lib/print/jobs";

// 印刷係の設定の確認用（接続キーが正しいか）
export async function GET(req: Request) {
  const agent = await authenticateAgent(req);
  if (!agent) return agentJson({ error: "接続キーが正しくないか、無効になっています。" }, 401);
  return agentJson({ ok: true, name: agent.name });
}
