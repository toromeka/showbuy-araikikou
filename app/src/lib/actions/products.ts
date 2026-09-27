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

function toSmallInt(v: FormDataEntryValue | null): number | null {
  const s = emptyToNull(v);
  return s === null ? null : parseInt(s, 10);
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
      tax_category: toSmallInt(formData.get("tax_category")) ?? 0,
      stock_managed: formData.get("stock_managed") === "on",
      cost_category: toSmallInt(formData.get("cost_category")) ?? 0,
      major_class_code: emptyToNull(formData.get("major_class_code")),
      middle_class_code: emptyToNull(formData.get("middle_class_code")),
      minor_class_code: emptyToNull(formData.get("minor_class_code")),
      category1_code: emptyToNull(formData.get("category1_code")),
      category2_code: emptyToNull(formData.get("category2_code")),
      category3_code: emptyToNull(formData.get("category3_code")),
      sale_price_1: toDecimal(formData.get("sale_price_1")),
      sale_price_2: toDecimal(formData.get("sale_price_2")),
      sale_price_3: toDecimal(formData.get("sale_price_3")),
      sale_price_4: toDecimal(formData.get("sale_price_4")),
      sale_price_5: toDecimal(formData.get("sale_price_5")),
      standard_cost: toDecimal(formData.get("standard_cost")),
      last_cost: toDecimal(formData.get("last_cost")),
      moving_avg_cost: toDecimal(formData.get("moving_avg_cost")),
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
      tax_category: toSmallInt(formData.get("tax_category")) ?? 0,
      stock_managed: formData.get("stock_managed") === "on",
      cost_category: toSmallInt(formData.get("cost_category")) ?? 0,
      major_class_code: emptyToNull(formData.get("major_class_code")),
      middle_class_code: emptyToNull(formData.get("middle_class_code")),
      minor_class_code: emptyToNull(formData.get("minor_class_code")),
      category1_code: emptyToNull(formData.get("category1_code")),
      category2_code: emptyToNull(formData.get("category2_code")),
      category3_code: emptyToNull(formData.get("category3_code")),
      sale_price_1: toDecimal(formData.get("sale_price_1")),
      sale_price_2: toDecimal(formData.get("sale_price_2")),
      sale_price_3: toDecimal(formData.get("sale_price_3")),
      sale_price_4: toDecimal(formData.get("sale_price_4")),
      sale_price_5: toDecimal(formData.get("sale_price_5")),
      standard_cost: toDecimal(formData.get("standard_cost")),
      last_cost: toDecimal(formData.get("last_cost")),
      moving_avg_cost: toDecimal(formData.get("moving_avg_cost")),
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
