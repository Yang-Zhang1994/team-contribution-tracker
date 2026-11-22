import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth, { type DefaultSession } from "next-auth";
import GitHub from "next-auth/providers/github";
import { prisma } from "@/server/db";

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}

// GitHub is the only sign-in method: the app needs each user's GitHub identity
// to match them to commits, PRs and reviews.
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [GitHub],
  callbacks: {
    // Database sessions: expose the user id for server-side authorization.
    // The GitHub token stays in the Account table and never enters the session.
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
});
