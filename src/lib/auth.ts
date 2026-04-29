import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

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

        if (!adminEmail) return null;
        if (email !== adminEmail) return null;

        // Support plain-text ADMIN_PASSWORD (preferred) or bcrypt ADMIN_PASSWORD_HASH
        let valid = false;
        if (adminPassword) {
          valid = password === adminPassword;
        } else if (adminPasswordHash) {
          valid = await bcrypt.compare(password, adminPasswordHash);
        }

        if (!valid) return null;

        return { id: "1", email: adminEmail, name: "Admin" };
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const isOnLogin = request.nextUrl.pathname === "/login";
      if (isOnLogin) return isLoggedIn ? Response.redirect(new URL("/", request.nextUrl)) : true;
      return isLoggedIn;
    },
  },
});
