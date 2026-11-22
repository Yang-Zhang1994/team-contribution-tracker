import "server-only";
import { prisma } from "@/server/db";

// The only place that reads a user's GitHub access token. Keep it on the
// server: never put it in the session, return it from an action or log it.
export async function getGitHubToken(userId: string): Promise<string | null> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "github" },
    select: { access_token: true },
  });
  return account?.access_token ?? null;
}
