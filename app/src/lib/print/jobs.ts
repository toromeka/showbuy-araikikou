import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { PrintedPdf } from "@/lib/pdf";
import { DOC_TYPES, type DocType } from "@/lib/print/labels";
import { deliveryNotePdf } from "@/lib/print/delivery-note";
import { quotationPdf } from "@/lib/print/quotation";
import { invoicePdf } from "@/lib/print/invoice";

// 事務所のプリンター（Canon iR-ADV C3520III）の指定カセットへの直接印刷。
// 画面の「印刷する」で印刷の依頼（print_jobs）を登録し、事務所の「印刷係」のパソコン
// （public/print-agent/print-agent.ps1）がこのシステムに依頼を取りに来て、帳票ごとに決めたカセットから印刷する。
// 印刷係はこちらへ取りに来るだけなので、社内のネットワークやプリンターを外部に公開する必要はない。

export { CASSETTE_OPTIONS, DOC_TYPES, JOB_STATUS_LABELS, type DocType } from "@/lib/print/labels";

// 印刷係は数秒おきに依頼を取りに来るので、1分以上連絡が無ければ止まっているとみなす
export const AGENT_ONLINE_SECONDS = 60;
// 印刷中のまま10分以上完了の連絡が無い依頼は、エラーにする（印刷係のパソコンが途中で止まった場合など）
const STUCK_MINUTES = 10;

export function isDocType(v: string): v is DocType {
  return v in DOC_TYPES;
}

// 印刷する帳票のPDFを作る（画面のプレビューと同じもの）
export async function renderPrintPdf(docType: string, targetId: string): Promise<PrintedPdf | null> {
  if (docType === "delivery_note") return deliveryNotePdf(targetId);
  if (docType === "quotation") return quotationPdf(targetId);
  if (docType === "invoice") return invoicePdf(targetId);
  return null;
}

// 画面表示用の依頼名（例: 納品書 152445）。対象が見つからなければ null
export async function printTitle(docType: DocType, targetId: string): Promise<string | null> {
  if (!/^\d+$/.test(targetId)) return null;
  const id = BigInt(targetId);
  if (docType === "delivery_note") {
    const v = await prisma.sales_vouchers.findUnique({ where: { id }, include: { customers: true } });
    return v ? `納品書 ${v.voucher_no}（${v.customers.name1}）` : null;
  }
  if (docType === "quotation") {
    const q = await prisma.quotations.findUnique({ where: { id }, include: { customers: true } });
    return q ? `見積書 ${q.voucher_no}（${q.customers.name1}）` : null;
  }
  const r = await prisma.billing_records.findUnique({ where: { id }, include: { customers: true } });
  return r ? `請求書 ${r.period_to.toISOString().slice(0, 10)}締（${r.customers.name1}）` : null;
}

export async function cassetteFor(docType: DocType): Promise<number> {
  const row = await prisma.print_trays.findUnique({ where: { doc_type: docType } });
  return row?.cassette ?? 1;
}

// 最後の接続から1分以内なら「接続中」
export function isSeenRecently(lastSeenAt: Date | null): boolean {
  return !!lastSeenAt && lastSeenAt.getTime() >= Date.now() - AGENT_ONLINE_SECONDS * 1000;
}

export async function isAgentOnline(): Promise<boolean> {
  const since = new Date(Date.now() - AGENT_ONLINE_SECONDS * 1000);
  return (await prisma.print_agents.count({ where: { is_active: true, last_seen_at: { gte: since } } })) > 0;
}

// ---- 接続キー ----

export function hashAgentKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function generateAgentKey(): string {
  return randomBytes(24).toString("base64url");
}

// 印刷係からの要求の「Authorization: Bearer <接続キー>」を確認し、最終接続日時を更新する
export async function authenticateAgent(req: Request): Promise<{ id: number; name: string } | null> {
  const m = (req.headers.get("authorization") ?? "").match(/^Bearer\s+(\S+)$/i);
  if (!m) return null;
  const agent = await prisma.print_agents.findUnique({ where: { key_hash: hashAgentKey(m[1]) } });
  if (!agent || !agent.is_active) return null;
  await prisma.print_agents.update({ where: { id: agent.id }, data: { last_seen_at: new Date() } });
  return { id: agent.id, name: agent.name };
}

// ---- 印刷係とのやりとり ----

// 印刷係（Windows PowerShell 5.1）は文字コードの指定が無いと日本語を正しく読めないため、charset を明示して返す
export function agentJson(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export type ClaimedJob = { id: string; title: string; cassette: number };

// 一番古い「印刷待ち」を1件取り出して「印刷中」にする。複数の印刷係が同時に取りに来ても、同じ依頼を二重に印刷しない
export async function claimNextJob(agentId: number): Promise<ClaimedJob | null> {
  await prisma.$executeRaw`
    UPDATE print_jobs
       SET status = 'error', finished_at = now(),
           error = '印刷係から完了の連絡がありませんでした。プリンターで印刷されたか確認してください。'
     WHERE status = 'printing' AND picked_at < now() - make_interval(mins => ${STUCK_MINUTES})`;
  const rows = await prisma.$queryRaw<{ id: bigint; title: string; cassette: number }[]>`
    UPDATE print_jobs
       SET status = 'printing', picked_at = now(), agent_id = ${agentId}
     WHERE id = (SELECT id FROM print_jobs WHERE status = 'pending' ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1)
    RETURNING id, title, cassette`;
  const row = rows[0];
  return row ? { id: row.id.toString(), title: row.title, cassette: Number(row.cassette) } : null;
}

// この印刷係が取り出して印刷中の依頼だけを返す
export async function claimedJob(agentId: number, jobId: string) {
  if (!/^\d+$/.test(jobId)) return null;
  const job = await prisma.print_jobs.findUnique({ where: { id: BigInt(jobId) } });
  return job && job.agent_id === agentId && job.status === "printing" ? job : null;
}

export async function finishJob(agentId: number, jobId: string, ok: boolean, error: string | null): Promise<boolean> {
  const job = await claimedJob(agentId, jobId);
  if (!job) return false;
  await prisma.print_jobs.update({
    where: { id: job.id },
    data: {
      status: ok ? "done" : "error",
      error: ok ? null : (error || "印刷に失敗しました。").slice(0, 1000),
      finished_at: new Date(),
    },
  });
  return true;
}
