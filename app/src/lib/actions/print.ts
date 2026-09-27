"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import {
  CASSETTE_OPTIONS,
  DOC_TYPES,
  cassetteFor,
  generateAgentKey,
  hashAgentKey,
  isAgentOnline,
  isDocType,
  printTitle,
} from "@/lib/print/jobs";

export type RequestPrintResult =
  | { ok: true; jobId: string; cassette: number; agentOnline: boolean }
  | { ok: false; message: string };

// 画面の「印刷する」。帳票ごとに決めたカセットで印刷の依頼を登録する
export async function requestPrint(docType: string, targetId: string): Promise<RequestPrintResult> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, message: "ログインが必要です。" };
  if (!isDocType(docType)) return { ok: false, message: "印刷できない帳票です。" };

  const title = await printTitle(docType, targetId);
  if (!title) return { ok: false, message: "印刷する帳票が見つかりません。" };

  const cassette = await cassetteFor(docType);
  const job = await prisma.print_jobs.create({
    data: { doc_type: docType, target_id: targetId, title, cassette, requested_by: me.id },
  });
  revalidatePath("/print-jobs");
  return { ok: true, jobId: job.id.toString(), cassette, agentOnline: await isAgentOnline() };
}

export type PrintJobStatus = { status: string; error: string | null; agentOnline: boolean } | null;

export async function getPrintJobStatus(jobId: string): Promise<PrintJobStatus> {
  if (!(await getCurrentUser()) || !/^\d+$/.test(jobId)) return null;
  const job = await prisma.print_jobs.findUnique({ where: { id: BigInt(jobId) } });
  if (!job) return null;
  return { status: job.status, error: job.error, agentOnline: await isAgentOnline() };
}

// 印刷待ちの依頼だけ取り消せる（印刷中のものはプリンターに送られているため取り消せない）
export async function cancelPrintJob(jobId: string): Promise<{ message?: string }> {
  if (!(await getCurrentUser())) return { message: "ログインが必要です。" };
  if (!/^\d+$/.test(jobId)) return { message: "依頼が見つかりません。" };
  const { count } = await prisma.print_jobs.updateMany({
    where: { id: BigInt(jobId), status: "pending" },
    data: { status: "canceled", finished_at: new Date() },
  });
  revalidatePath("/print-jobs");
  return count === 0 ? { message: "印刷待ちではないため、取り消せませんでした。" } : {};
}

// ---- 管理者のみ ----

export type PrintSettingsState = { message?: string; done?: boolean };

export async function updatePrintTrays(_prev: PrintSettingsState, formData: FormData): Promise<PrintSettingsState> {
  if (!isAdmin(await getCurrentUser())) return { message: "印刷の設定は管理者のみ変更できます。" };
  const allowed = new Set(CASSETTE_OPTIONS.map((o) => o.value));
  for (const docType of Object.keys(DOC_TYPES)) {
    const cassette = Number(formData.get(docType));
    if (!allowed.has(cassette)) return { message: "カセットを選択してください。" };
    await prisma.print_trays.upsert({
      where: { doc_type: docType },
      update: { cassette },
      create: { doc_type: docType, cassette },
    });
  }
  revalidatePath("/print-jobs");
  return { done: true };
}

export type IssueAgentKeyState = { message?: string; key?: string; name?: string };

// 印刷係の接続キーを発行する。キーはこのとき1回だけ表示し、DBにはハッシュだけを保存する
export async function issueAgentKey(_prev: IssueAgentKeyState, formData: FormData): Promise<IssueAgentKeyState> {
  if (!isAdmin(await getCurrentUser())) return { message: "接続キーは管理者のみ発行できます。" };
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { message: "パソコンの名前を入力してください（例: 事務所の印刷用PC）。" };
  if (name.length > 60) return { message: "名前は60文字以内にしてください。" };
  const key = generateAgentKey();
  await prisma.print_agents.create({ data: { name, key_hash: hashAgentKey(key) } });
  revalidatePath("/print-jobs");
  return { key, name };
}

// パソコンの入れ替えなどで使わなくなった印刷係は無効にする（その接続キーでは印刷できなくなる）
export async function deactivateAgent(id: number): Promise<{ message?: string }> {
  if (!isAdmin(await getCurrentUser())) return { message: "管理者のみ変更できます。" };
  await prisma.print_agents.update({ where: { id }, data: { is_active: false } });
  revalidatePath("/print-jobs");
  return {};
}
