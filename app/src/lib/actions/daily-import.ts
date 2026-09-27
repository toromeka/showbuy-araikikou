"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/current-user";
import { decodeCsvBuffer } from "@/lib/csv";
import { executeDailyImport, planDailyImport, type DailyImportPreview } from "@/lib/migration/daily-import";

export type DailyImportActionResult = {
  preview?: DailyImportPreview;
  executed?: boolean;
  message?: string;
};

async function readCsv(formData: FormData): Promise<string | null> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return null;
  return decodeCsvBuffer(Buffer.from(await file.arrayBuffer()));
}

export async function previewDailyImportAction(formData: FormData): Promise<DailyImportActionResult> {
  if (!(await getCurrentUser())) return { message: "ログインが必要です。" };
  const csv = await readCsv(formData);
  if (!csv) return { message: "日計伝票のCSVファイルを選択してください。" };
  try {
    return { preview: (await planDailyImport(csv)).preview };
  } catch (e) {
    return { message: `ファイルを読み込めませんでした: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export async function executeDailyImportAction(formData: FormData): Promise<DailyImportActionResult> {
  const user = await getCurrentUser();
  if (!user) return { message: "ログインが必要です。" };
  const csv = await readCsv(formData);
  if (!csv) return { message: "日計伝票のCSVファイルを選択してください。" };
  try {
    const preview = await executeDailyImport(csv, user.id);
    if (preview.errors.length > 0) return { preview, message: "エラーがあるため取り込みませんでした。" };
    revalidatePath("/", "layout");
    return { preview, executed: true };
  } catch (e) {
    return { message: `取り込みに失敗しました（何も登録されていません）: ${e instanceof Error ? e.message : String(e)}` };
  }
}
