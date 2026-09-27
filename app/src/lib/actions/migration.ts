"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { decodeCsvBuffer } from "@/lib/csv";
import {
  executeMigration,
  planMigration,
  type MigrationFiles,
  type MigrationPreview,
} from "@/lib/migration/voucher-migration";

export type MigrationActionResult = {
  preview?: MigrationPreview;
  executed?: boolean;
  message?: string;
};

async function readFile(formData: FormData, name: string): Promise<string | null> {
  const file = formData.get(name);
  if (!(file instanceof File) || file.size === 0) return null;
  return decodeCsvBuffer(Buffer.from(await file.arrayBuffer()));
}

async function readFiles(formData: FormData): Promise<MigrationFiles | string> {
  const sales = await readFile(formData, "sales");
  if (!sales) return "売上伝票のCSVファイルを選択してください。";
  return { sales, purchase: await readFile(formData, "purchase"), receipt: await readFile(formData, "receipt") };
}

async function requireAdmin(): Promise<{ userId: string | null } | string> {
  const user = await getCurrentUser();
  if (!user) return "ログインが必要です。";
  if (!isAdmin(user)) return "データ移行は管理者のみ実行できます。";
  return { userId: user.id };
}

export async function previewMigrationAction(formData: FormData): Promise<MigrationActionResult> {
  const user = await requireAdmin();
  if (typeof user === "string") return { message: user };
  const files = await readFiles(formData);
  if (typeof files === "string") return { message: files };
  try {
    const plan = await planMigration(files);
    return { preview: plan.preview };
  } catch (e) {
    return { message: `ファイルを読み込めませんでした: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export async function executeMigrationAction(formData: FormData): Promise<MigrationActionResult> {
  const user = await requireAdmin();
  if (typeof user === "string") return { message: user };
  const files = await readFiles(formData);
  if (typeof files === "string") return { message: files };
  try {
    const preview = await executeMigration(files, user.userId);
    if (preview.errors.length > 0) return { preview, message: "エラーがあるため取り込みませんでした。" };
    revalidatePath("/", "layout");
    return { preview, executed: true };
  } catch (e) {
    return { message: `取り込みに失敗しました（何も登録されていません）: ${e instanceof Error ? e.message : String(e)}` };
  }
}
