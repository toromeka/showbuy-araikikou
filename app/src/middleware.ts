import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

export default NextAuth(authConfig).auth;

export const config = {
  // すべてのページを保護対象にし、API・静的ファイル・ログイン画面のみ除外
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
