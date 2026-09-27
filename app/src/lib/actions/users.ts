"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isAdmin } from "@/lib/current-user";

export type UserFormState = {
  errors?: Record<string, string[]>;
  message?: string;
  done?: boolean;
};

const ROLES = ["admin", "staff"] as const;
const MIN_PASSWORD = 8;

const PasswordSchema = z
  .object({
    password: z.string().min(MIN_PASSWORD, `パスワードは${MIN_PASSWORD}文字以上にしてください`).max(100),
    password_confirm: z.string(),
  })
  .refine((v) => v.password === v.password_confirm, {
    message: "確認用のパスワードが一致しません",
    path: ["password_confirm"],
  });

const ProfileSchema = z.object({
  display_name: z.string().trim().min(1, "表示名を入力してください").max(100),
  role: z.enum(ROLES, { message: "権限を選択してください" }),
  staff_code: z.string().trim().max(10).optional(),
});

const LoginIdSchema = z
  .string()
  .trim()
  .min(3, "ログインIDは3文字以上にしてください")
  .max(50)
  .regex(/^[A-Za-z0-9._-]+$/, "ログインIDは半角英数字と . _ - で入力してください");

async function requireAdmin(): Promise<string | null> {
  const me = await getCurrentUser();
  if (!me) return "ログインが必要です。";
  if (!isAdmin(me)) return "ユーザー管理は管理者のみ利用できます。";
  return null;
}

async function checkStaffCode(code: string | undefined): Promise<string | null> {
  if (!code) return null;
  const staff = await prisma.staff.findUnique({ where: { code } });
  return staff ? null : "指定された担当者が担当者マスタにありません。";
}

// 有効な管理者が1人もいなくなる変更（最後の管理者の無効化・一般への変更）は受け付けない
async function wouldRemoveLastAdmin(userId: string): Promise<boolean> {
  const others = await prisma.users.count({ where: { role: "admin", is_active: true, id: { not: userId } } });
  return others === 0;
}

export async function createUser(_prev: UserFormState, formData: FormData): Promise<UserFormState> {
  const denied = await requireAdmin();
  if (denied) return { message: denied };

  const raw = Object.fromEntries(formData.entries());
  const loginId = LoginIdSchema.safeParse(raw.login_id);
  const profile = ProfileSchema.safeParse(raw);
  const password = PasswordSchema.safeParse(raw);
  if (!loginId.success || !profile.success || !password.success) {
    return {
      errors: {
        ...(loginId.success ? {} : { login_id: loginId.error.issues.map((i) => i.message) }),
        ...(profile.success ? {} : profile.error.flatten().fieldErrors),
        ...(password.success ? {} : password.error.flatten().fieldErrors),
      },
    };
  }
  const staffError = await checkStaffCode(profile.data.staff_code);
  if (staffError) return { errors: { staff_code: [staffError] } };
  if (await prisma.users.findUnique({ where: { login_id: loginId.data } })) {
    return { errors: { login_id: ["このログインIDは既に使われています。"] } };
  }

  await prisma.users.create({
    data: {
      login_id: loginId.data,
      display_name: profile.data.display_name,
      role: profile.data.role,
      staff_code: profile.data.staff_code || null,
      password_hash: await bcrypt.hash(password.data.password, 10),
    },
  });
  revalidatePath("/users");
  redirect("/users");
}

export async function updateUser(id: string, _prev: UserFormState, formData: FormData): Promise<UserFormState> {
  const denied = await requireAdmin();
  if (denied) return { message: denied };

  const profile = ProfileSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!profile.success) return { errors: profile.error.flatten().fieldErrors };
  const staffError = await checkStaffCode(profile.data.staff_code);
  if (staffError) return { errors: { staff_code: [staffError] } };

  const target = await prisma.users.findUnique({ where: { id } });
  if (!target) return { message: "対象のユーザーが見つかりません。" };
  if (target.role === "admin" && profile.data.role !== "admin" && target.is_active && (await wouldRemoveLastAdmin(id))) {
    return { errors: { role: ["有効な管理者が1人もいなくなるため、一般に変更できません。"] } };
  }

  await prisma.users.update({
    where: { id },
    data: {
      display_name: profile.data.display_name,
      role: profile.data.role,
      staff_code: profile.data.staff_code || null,
      updated_at: new Date(),
    },
  });
  revalidatePath("/users");
  redirect("/users");
}

export async function resetUserPassword(id: string, _prev: UserFormState, formData: FormData): Promise<UserFormState> {
  const denied = await requireAdmin();
  if (denied) return { message: denied };

  const password = PasswordSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!password.success) return { errors: password.error.flatten().fieldErrors };

  await prisma.users.update({
    where: { id },
    data: { password_hash: await bcrypt.hash(password.data.password, 10), updated_at: new Date() },
  });
  return { done: true, message: "パスワードを変更しました。新しいパスワードを本人に伝えてください。" };
}

export async function toggleUserActive(id: string): Promise<{ error?: string }> {
  const denied = await requireAdmin();
  if (denied) return { error: denied };
  const me = await getCurrentUser();
  const target = await prisma.users.findUnique({ where: { id } });
  if (!target) return { error: "対象のユーザーが見つかりません。" };

  if (target.is_active) {
    if (target.id === me?.id) return { error: "自分自身は無効化できません。" };
    if (target.role === "admin" && (await wouldRemoveLastAdmin(id))) {
      return { error: "有効な管理者が1人もいなくなるため、無効化できません。" };
    }
  }
  await prisma.users.update({ where: { id }, data: { is_active: !target.is_active, updated_at: new Date() } });
  revalidatePath("/users");
  return {};
}

// 自分のパスワードの変更（全員が使える）
export async function changeOwnPassword(_prev: UserFormState, formData: FormData): Promise<UserFormState> {
  const me = await getCurrentUser();
  if (!me) return { message: "ログインが必要です。" };

  const current = (formData.get("current_password") ?? "").toString();
  const password = PasswordSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!password.success) return { errors: password.error.flatten().fieldErrors };

  const user = await prisma.users.findUnique({ where: { id: me.id } });
  if (!user || !(await bcrypt.compare(current, user.password_hash))) {
    return { errors: { current_password: ["今のパスワードが正しくありません。"] } };
  }
  if (await bcrypt.compare(password.data.password, user.password_hash)) {
    return { errors: { password: ["今と同じパスワードです。別のパスワードにしてください。"] } };
  }

  await prisma.users.update({
    where: { id: me.id },
    data: { password_hash: await bcrypt.hash(password.data.password, 10), updated_at: new Date() },
  });
  return { done: true, message: "パスワードを変更しました。次回から新しいパスワードでログインしてください。" };
}
