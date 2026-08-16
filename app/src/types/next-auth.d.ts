import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    role?: string;
    loginId?: string;
    staffCode?: string | null;
  }

  interface Session {
    user?: DefaultSession["user"] & User;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string;
    loginId?: string;
    staffCode?: string | null;
  }
}
