import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  // 開発用の部署・担当者
  await prisma.departments.upsert({
    where: { code: "01" },
    update: {},
    create: { code: "01", name: "営業部" },
  });

  await prisma.staff.upsert({
    where: { code: "01" },
    update: {},
    create: { code: "01", name: "管理者", department_code: "01" },
  });

  // 開発用の管理者ログイン（本番投入前に必ずパスワードを変更してください）
  const passwordHash = await bcrypt.hash("changeme123", 10);
  await prisma.users.upsert({
    where: { login_id: "admin" },
    update: {},
    create: {
      login_id: "admin",
      display_name: "管理者",
      password_hash: passwordHash,
      role: "admin",
      staff_code: "01",
    },
  });

  // 消費税率履歴（2019/10/1以降は10%。売上伝票の税率自動判定に使用）
  await prisma.tax_rate_history.upsert({
    where: { starts_on: new Date("2019-10-01") },
    update: {},
    create: { starts_on: new Date("2019-10-01"), rate: 10.0 },
  });

  await prisma.company_settings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      company_name: "有限会社荒井機工",
      postal_code: "920-0106",
      address1: "石川県金沢市今町ホ19-1",
      phone: "076-257-0811",
      fax: "076-257-5331",
      default_closing_day: 31,
    },
  });

  console.log("Seed完了: ログインID=admin / パスワード=changeme123（必ず変更してください）");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
