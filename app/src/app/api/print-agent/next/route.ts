import { agentJson, authenticateAgent, claimNextJob } from "@/lib/print/jobs";

// 印刷係が数秒おきに呼ぶ。印刷待ちの依頼があれば1件を「印刷中」にして返す（無ければ job: null）
export async function POST(req: Request) {
  const agent = await authenticateAgent(req);
  if (!agent) return agentJson({ error: "接続キーが正しくないか、無効になっています。" }, 401);
  const job = await claimNextJob(agent.id);
  return agentJson({ job });
}
