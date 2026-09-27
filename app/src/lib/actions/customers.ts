"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

const CustomerSchema = z.object({
  code: z.string().min(1, "得意先コードを入力してください").max(10),
  name1: z.string().min(1, "得意先名称1を入力してください").max(60),
  name2: z.string().max(60).optional().or(z.literal("")),
  short_name: z.string().max(30).optional().or(z.literal("")),
  kana: z.string().max(60).optional().or(z.literal("")),
  honorific: z.string().max(10).optional().or(z.literal("")),
  staff_code: z.string().max(10).optional().or(z.literal("")),
  region_code: z.string().max(10).optional().or(z.literal("")),
  postal_code: z.string().max(10).optional().or(z.literal("")),
  address1: z.string().max(100).optional().or(z.literal("")),
  address2: z.string().max(100).optional().or(z.literal("")),
  phone: z.string().max(20).optional().or(z.literal("")),
  fax: z.string().max(20).optional().or(z.literal("")),
  mobile: z.string().max(20).optional().or(z.literal("")),
  closing_day: z.string().optional().or(z.literal("")),
  collection_day: z.string().optional().or(z.literal("")),
  collection_type: z.string().max(10).optional().or(z.literal("")),
  collection_note: z.string().max(200).optional().or(z.literal("")),
  billing_customer_code: z.string().max(10).optional().or(z.literal("")),
  category1_code: z.string().max(10).optional().or(z.literal("")),
  category2_code: z.string().max(10).optional().or(z.literal("")),
  category3_code: z.string().max(10).optional().or(z.literal("")),
  price_rank: z.string().optional().or(z.literal("")),
  markup_rate: z.string().optional().or(z.literal("")),
  tax_method: z.string().optional().or(z.literal("")),
  calc_method: z.string().optional().or(z.literal("")),
  rounding_method: z.string().optional().or(z.literal("")),
  note: z.string().max(200).optional().or(z.literal("")),
});

export type CustomerFormState = {
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

function toDecimal(v: FormDataEntryValue | null): string | null {
  return emptyToNull(v);
}

export async function createCustomer(
  _prevState: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  const raw = Object.fromEntries(formData.entries());
  const parsed = CustomerSchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const existing = await prisma.customers.findUnique({ where: { code: parsed.data.code } });
  if (existing) {
    return { errors: { code: ["この得意先コードは既に使用されています。"] } };
  }

  await prisma.customers.create({
    data: {
      code: parsed.data.code,
      name1: parsed.data.name1,
      name2: emptyToNull(formData.get("name2")),
      short_name: emptyToNull(formData.get("short_name")),
      kana: emptyToNull(formData.get("kana")),
      honorific: emptyToNull(formData.get("honorific")),
      staff_code: emptyToNull(formData.get("staff_code")),
      region_code: emptyToNull(formData.get("region_code")),
      postal_code: emptyToNull(formData.get("postal_code")),
      address1: emptyToNull(formData.get("address1")),
      address2: emptyToNull(formData.get("address2")),
      phone: emptyToNull(formData.get("phone")),
      fax: emptyToNull(formData.get("fax")),
      mobile: emptyToNull(formData.get("mobile")),
      closing_day: toSmallInt(formData.get("closing_day")),
      collection_day: toSmallInt(formData.get("collection_day")),
      collection_type: emptyToNull(formData.get("collection_type")),
      collection_note: emptyToNull(formData.get("collection_note")),
      billing_customer_code: emptyToNull(formData.get("billing_customer_code")),
      category1_code: emptyToNull(formData.get("category1_code")),
      category2_code: emptyToNull(formData.get("category2_code")),
      category3_code: emptyToNull(formData.get("category3_code")),
      price_rank: toSmallInt(formData.get("price_rank")),
      markup_rate: toDecimal(formData.get("markup_rate")),
      tax_method: toSmallInt(formData.get("tax_method")) ?? 0,
      calc_method: toSmallInt(formData.get("calc_method")) ?? 0,
      rounding_method: toSmallInt(formData.get("rounding_method")) ?? 0,
      note: emptyToNull(formData.get("note")),
    },
  });

  revalidatePath("/customers");
  redirect("/customers");
}

export async function updateCustomer(
  code: string,
  _prevState: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  const raw = Object.fromEntries(formData.entries());
  const parsed = CustomerSchema.omit({ code: true }).safeParse(raw);
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  await prisma.customers.update({
    where: { code },
    data: {
      name1: parsed.data.name1,
      name2: emptyToNull(formData.get("name2")),
      short_name: emptyToNull(formData.get("short_name")),
      kana: emptyToNull(formData.get("kana")),
      honorific: emptyToNull(formData.get("honorific")),
      staff_code: emptyToNull(formData.get("staff_code")),
      region_code: emptyToNull(formData.get("region_code")),
      postal_code: emptyToNull(formData.get("postal_code")),
      address1: emptyToNull(formData.get("address1")),
      address2: emptyToNull(formData.get("address2")),
      phone: emptyToNull(formData.get("phone")),
      fax: emptyToNull(formData.get("fax")),
      mobile: emptyToNull(formData.get("mobile")),
      closing_day: toSmallInt(formData.get("closing_day")),
      collection_day: toSmallInt(formData.get("collection_day")),
      collection_type: emptyToNull(formData.get("collection_type")),
      collection_note: emptyToNull(formData.get("collection_note")),
      billing_customer_code: emptyToNull(formData.get("billing_customer_code")),
      category1_code: emptyToNull(formData.get("category1_code")),
      category2_code: emptyToNull(formData.get("category2_code")),
      category3_code: emptyToNull(formData.get("category3_code")),
      price_rank: toSmallInt(formData.get("price_rank")),
      markup_rate: toDecimal(formData.get("markup_rate")),
      tax_method: toSmallInt(formData.get("tax_method")) ?? 0,
      calc_method: toSmallInt(formData.get("calc_method")) ?? 0,
      rounding_method: toSmallInt(formData.get("rounding_method")) ?? 0,
      note: emptyToNull(formData.get("note")),
      updated_at: new Date(),
    },
  });

  revalidatePath("/customers");
  redirect("/customers");
}

export async function toggleCustomerActive(code: string, isActive: boolean) {
  await prisma.customers.update({
    where: { code },
    data: { is_active: !isActive, updated_at: new Date() },
  });
  revalidatePath("/customers");
}
