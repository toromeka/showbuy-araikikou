"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

const SupplierSchema = z.object({
  code: z.string().min(1, "仕入先コードを入力してください").max(10),
  name1: z.string().min(1, "仕入先名称1を入力してください").max(60),
});

export type SupplierFormState = {
  errors?: Record<string, string[]>;
  message?: string;
};

function emptyToNull(v: FormDataEntryValue | null): string | null {
  const s = (v ?? "").toString().trim();
  return s === "" ? null : s;
}

function toSmallInt(v: FormDataEntryValue | null): number | null {
  const s = emptyToNull(v);
  return s === null ? null : parseInt(s, 10);
}

export async function createSupplier(
  _prevState: SupplierFormState,
  formData: FormData,
): Promise<SupplierFormState> {
  const parsed = SupplierSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const existing = await prisma.suppliers.findUnique({ where: { code: parsed.data.code } });
  if (existing) {
    return { errors: { code: ["この仕入先コードは既に使用されています。"] } };
  }

  await prisma.suppliers.create({
    data: {
      code: parsed.data.code,
      name1: parsed.data.name1,
      name2: emptyToNull(formData.get("name2")),
      short_name: emptyToNull(formData.get("short_name")),
      kana: emptyToNull(formData.get("kana")),
      staff_code: emptyToNull(formData.get("staff_code")),
      postal_code: emptyToNull(formData.get("postal_code")),
      address1: emptyToNull(formData.get("address1")),
      address2: emptyToNull(formData.get("address2")),
      phone: emptyToNull(formData.get("phone")),
      fax: emptyToNull(formData.get("fax")),
      closing_day: toSmallInt(formData.get("closing_day")),
      payment_day: toSmallInt(formData.get("payment_day")),
      note: emptyToNull(formData.get("note")),
    },
  });

  revalidatePath("/suppliers");
  redirect("/suppliers");
}

export async function updateSupplier(
  code: string,
  _prevState: SupplierFormState,
  formData: FormData,
): Promise<SupplierFormState> {
  const parsed = SupplierSchema.omit({ code: true }).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  await prisma.suppliers.update({
    where: { code },
    data: {
      name1: parsed.data.name1,
      name2: emptyToNull(formData.get("name2")),
      short_name: emptyToNull(formData.get("short_name")),
      kana: emptyToNull(formData.get("kana")),
      staff_code: emptyToNull(formData.get("staff_code")),
      postal_code: emptyToNull(formData.get("postal_code")),
      address1: emptyToNull(formData.get("address1")),
      address2: emptyToNull(formData.get("address2")),
      phone: emptyToNull(formData.get("phone")),
      fax: emptyToNull(formData.get("fax")),
      closing_day: toSmallInt(formData.get("closing_day")),
      payment_day: toSmallInt(formData.get("payment_day")),
      note: emptyToNull(formData.get("note")),
      updated_at: new Date(),
    },
  });

  revalidatePath("/suppliers");
  redirect("/suppliers");
}

export async function toggleSupplierActive(code: string, isActive: boolean) {
  await prisma.suppliers.update({
    where: { code },
    data: { is_active: !isActive, updated_at: new Date() },
  });
  revalidatePath("/suppliers");
}
