"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isAdmin } from "@/lib/current-user";

// 自社情報（納品書・見積書・請求書に印刷する社名・住所・電話番号など）。管理者のみ変更できる。
const optional = (max: number, label: string) =>
  z.string().trim().max(max, `${label}は${max}文字以内です`).transform((s) => (s === "" ? null : s));

const CompanySchema = z.object({
  company_name: z.string().trim().min(1, "会社名を入力してください").max(60, "会社名は60文字以内です"),
  postal_code: optional(10, "郵便番号"),
  address1: optional(100, "住所1"),
  address2: optional(100, "住所2"),
  phone: optional(20, "TEL"),
  fax: optional(20, "FAX"),
  invoice_registration_no: optional(20, "登録番号"),
});

export type CompanySettingsFormState = {
  errors?: Record<string, string[]>;
  message?: string;
  done?: boolean;
};

export async function updateCompanySettings(
  _prevState: CompanySettingsFormState,
  formData: FormData,
): Promise<CompanySettingsFormState> {
  const me = await getCurrentUser();
  if (!me) return { message: "ログインが必要です。" };
  if (!isAdmin(me)) return { message: "自社情報は管理者のみ変更できます。" };

  const parsed = CompanySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  await prisma.company_settings.upsert({
    where: { id: 1 },
    update: parsed.data,
    create: { id: 1, ...parsed.data },
  });
  revalidatePath("/company-settings");
  return { done: true };
}
