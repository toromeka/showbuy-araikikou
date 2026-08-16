"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

const ProductSchema = z.object({
  code: z.string().min(1, "商品コードを入力してください").max(15),
  name: z.string().min(1, "商品名を入力してください").max(80),
});

export type ProductFormState = {
  errors?: Record<string, string[]>;
  message?: string;
};

function emptyToNull(v: FormDataEntryValue | null): string | null {
  const s = (v ?? "").toString().trim();
  return s === "" ? null : s;
}

function toDecimal(v: FormDataEntryValue | null): string | null {
  const s = emptyToNull(v);
  return s === null ? null : s;
}

export async function createProduct(
  _prevState: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const parsed = ProductSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const existing = await prisma.products.findUnique({ where: { code: parsed.data.code } });
  if (existing) {
    return { errors: { code: ["この商品コードは既に使用されています。"] } };
  }

  await prisma.products.create({
    data: {
      code: parsed.data.code,
      name: parsed.data.name,
      spec: emptyToNull(formData.get("spec")),
      kana: emptyToNull(formData.get("kana")),
      unit_code: emptyToNull(formData.get("unit_code")),
      sale_price_1: toDecimal(formData.get("sale_price_1")),
      sale_price_2: toDecimal(formData.get("sale_price_2")),
      sale_price_3: toDecimal(formData.get("sale_price_3")),
      standard_cost: toDecimal(formData.get("standard_cost")),
    },
  });

  revalidatePath("/products");
  redirect("/products");
}

export async function updateProduct(
  code: string,
  _prevState: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const parsed = ProductSchema.omit({ code: true }).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  await prisma.products.update({
    where: { code },
    data: {
      name: parsed.data.name,
      spec: emptyToNull(formData.get("spec")),
      kana: emptyToNull(formData.get("kana")),
      unit_code: emptyToNull(formData.get("unit_code")),
      sale_price_1: toDecimal(formData.get("sale_price_1")),
      sale_price_2: toDecimal(formData.get("sale_price_2")),
      sale_price_3: toDecimal(formData.get("sale_price_3")),
      standard_cost: toDecimal(formData.get("standard_cost")),
      updated_at: new Date(),
    },
  });

  revalidatePath("/products");
  redirect("/products");
}

export async function toggleProductActive(code: string, isActive: boolean) {
  await prisma.products.update({
    where: { code },
    data: { is_active: !isActive, updated_at: new Date() },
  });
  revalidatePath("/products");
}
