"use server";

import { prisma } from "@/lib/prisma";
import { lastClosingDateOnOrBefore, todayInJapan } from "@/lib/closing-date";

// 得意先（請求）・仕入先（支払）の、今日以前で一番新しい締め日を返す（YYYY-MM-DD）。
// 締日が未設定の場合は会社設定の既定締日（未設定なら月末）を使う。請求更新の集計と同じ考え方。
export async function getLastClosingDate(kind: "customer" | "supplier", code: string): Promise<string | null> {
  const c = code.trim();
  if (!c) return null;
  const partner =
    kind === "customer"
      ? await prisma.customers.findUnique({ where: { code: c }, select: { closing_day: true } })
      : await prisma.suppliers.findUnique({ where: { code: c }, select: { closing_day: true } });
  if (!partner) return null;
  const settings = await prisma.company_settings.findUnique({ where: { id: 1 }, select: { default_closing_day: true } });
  const closingDay = partner.closing_day ?? settings?.default_closing_day ?? 31;
  return lastClosingDateOnOrBefore(closingDay, todayInJapan());
}
