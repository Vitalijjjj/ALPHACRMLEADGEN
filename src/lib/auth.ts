import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

// The ADMIN_EMAIL login: always full access, manages users & roles.
export const OWNER_ID = "owner";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email as string;
        const password = credentials?.password as string;

        if (!email || !password) return null;

        const adminEmail = process.env.ADMIN_EMAIL;
        const adminPassword = process.env.ADMIN_PASSWORD;
        const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;

        // Team members (Налаштування → Доступи) — everyone except the owner
        if (!adminEmail || email.trim().toLowerCase() !== adminEmail.toLowerCase()) {
          const { db, ensureSchema } = await import("@/lib/db");
          await ensureSchema();
          const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
          if (!user || !user.active) return null;
          if (!(await bcrypt.compare(password, user.passwordHash))) return null;
          return { id: user.id, email: user.email, name: user.name };
        }

        // Support plain-text ADMIN_PASSWORD (preferred) or bcrypt ADMIN_PASSWORD_HASH
        let valid = false;
        if (adminPassword) {
          valid = password === adminPassword;
        } else if (adminPasswordHash) {
          valid = await bcrypt.compare(password, adminPasswordHash);
        }

        if (!valid) return null;

        return { id: OWNER_ID, email: adminEmail, name: "Власник" };
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
  callbacks: {
    // keep the user id in the token / session (access is checked by id on every request)
    jwt({ token, user }) {
      if (user?.id) token.uid = user.id;
      return token;
    },
    session({ session, token }) {
      if (session.user) session.user.id = (token.uid as string | undefined) ?? OWNER_ID;
      return session;
    },
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const isOnLogin = request.nextUrl.pathname === "/login";
      if (isOnLogin) return isLoggedIn ? Response.redirect(new URL("/", request.nextUrl)) : true;
      return isLoggedIn;
    },
  },
});
