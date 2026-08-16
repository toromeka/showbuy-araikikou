import type { NextAuthConfig } from "next-auth";

// Edge-safe config (no Prisma / bcrypt here) used by middleware.
export const authConfig: NextAuthConfig = {
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnLogin = nextUrl.pathname.startsWith("/login");
      if (isOnLogin) {
        if (isLoggedIn) return Response.redirect(new URL("/", nextUrl));
        return true;
      }
      return isLoggedIn;
    },
    jwt({ token, user }) {
      if (user) {
        token.role = (user as { role?: string }).role;
        token.loginId = (user as { loginId?: string }).loginId;
        token.staffCode = (user as { staffCode?: string | null }).staffCode;
      }
      return token;
    },
    session({ session, token }) {
      if (!session.user) return session;
      return {
        ...session,
        user: {
          ...session.user,
          id: token.sub as string | undefined,
          role: token.role as string | undefined,
          loginId: token.loginId as string | undefined,
          staffCode: token.staffCode as string | null | undefined,
        },
      };
    },
  },
  providers: [], // populated in auth.ts (Node runtime only)
  session: { strategy: "jwt" },
};
