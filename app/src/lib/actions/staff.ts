"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

const StaffSchema = z.object({
  code: z.string().trim().min(1, "担当者コードを入力してください").max(10, "担当者コードは10文字以内です"),
  name: z.string().trim().min(1, "担当者名を入力してください").max(40, "担当者名は40文字以内です"),
});

export type StaffFormState = {
  errors?: Record<string, string[]>;
  message?: string;
};

function emptyToNull(v: FormDataEntryValue | null): string | null {
  const s = (v ?? "").toString().trim();
  return s === "" ? null : s;
}

export async function createStaff(_prevState: StaffFormState, formData: FormData): Promise<StaffFormState> {
  const parsed = StaffSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const existing = await prisma.staff.findUnique({ where: { code: parsed.data.code } });
  if (existing) {
    return { errors: { code: ["この担当者コードは既に使用されています。"] } };
  }

  await prisma.staff.create({
    data: {
      code: parsed.data.code,
      name: parsed.data.name,
      department_code: emptyToNull(formData.get("department_code")),
    },
  });

  revalidatePath("/staff");
  redirect("/staff");
}

export async function updateStaff(
  code: string,
  _prevState: StaffFormState,
  formData: FormData,
): Promise<StaffFormState> {
  const parsed = StaffSchema.omit({ code: true }).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  await prisma.staff.update({
    where: { code },
    data: {
      name: parsed.data.name,
      department_code: emptyToNull(formData.get("department_code")),
    },
  });

  revalidatePath("/staff");
  redirect("/staff");
}

// 退職などで使わなくなった担当者は削除せず無効化する（過去の伝票・得意先から参照されているため）。
// 無効化すると、伝票・得意先の入力画面の担当者の選択肢に出なくなる。
export async function toggleStaffActive(code: string, isActive: boolean) {
  await prisma.staff.update({
    where: { code },
    data: { is_active: !isActive },
  });
  revalidatePath("/staff");
}
