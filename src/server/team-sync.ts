import "server-only";
import { findUnmatchedAuthors } from "@/lib/github/unmatched";
import { requireTeamAccess } from "@/server/access";
import { prisma } from "@/server/db";
import { createGitHubSource } from "@/server/github-client";
import { getGitHubToken } from "@/server/github-token";
import { runSync } from "@/server/sync";
import { createSyncStore } from "@/server/sync-store";

export type SyncOutcome = { ok: boolean; message: string };

const EXPIRED_SIGN_IN =
  "Your GitHub sign-in has expired. Sign out and sign in again.";

// "Sync now" for a team (US3-AC1), run with the requesting user's token.
export async function syncTeamRepository(
  userId: string,
  teamId: string,
): Promise<SyncOutcome> {
  const team = await requireTeamAccess(userId, teamId);
  if (!team) return { ok: false, message: "Team not found." };

  const repository = await prisma.repository.findUnique({
    where: { teamId: team.id },
    select: { id: true, owner: true, name: true, lastSyncedAt: true },
  });
  if (!repository) {
    return { ok: false, message: "This team has no linked repository yet." };
  }

  const token = await getGitHubToken(userId);
  if (!token) return { ok: false, message: EXPIRED_SIGN_IN };

  try {
    const result = await runSync({
      lastSyncedAt: repository.lastSyncedAt,
      source: createGitHubSource(token, repository.owner, repository.name),
      store: createSyncStore(repository.id),
      now: () => new Date(),
    });
    if (!result.ok) return { ok: false, message: result.error.message };
    const { pullRequests, reviews, commits } = result.counts;
    return {
      ok: true,
      message: `Synced ${pullRequests} PRs, ${reviews} reviews and ${commits} new commits.`,
    };
  } catch {
    // Only reached if recording the failure itself failed. Don't log the
    // error: it may include request details.
    return { ok: false, message: "Sync failed. Try again later." };
  }
}

// What the team page shows about sync, or null if the user can't see it.
export async function getTeamSyncStatus(userId: string, teamId: string) {
  const team = await requireTeamAccess(userId, teamId);
  if (!team) return null;

  const details = await prisma.team.findUniqueOrThrow({
    where: { id: team.id },
    select: {
      name: true,
      course: { select: { name: true, timeZone: true } },
      memberships: {
        select: {
          user: {
            select: {
              accounts: {
                where: { provider: "github" },
                select: { providerAccountId: true },
              },
            },
          },
        },
      },
      repository: {
        select: {
          id: true,
          owner: true,
          name: true,
          lastSyncedAt: true,
          lastSyncError: true,
          lastSyncErrorAt: true,
        },
      },
    },
  });

  const repository = details.repository;
  if (!repository) return { ...details, repository: null };

  const memberGithubIds = details.memberships
    .flatMap((m) => m.user.accounts)
    .map((account) => account.providerAccountId)
    .filter((id) => /^\d+$/.test(id))
    .map((id) => BigInt(id));

  const [pullRequests, reviews, commits] = await Promise.all([
    prisma.pullRequest.count({ where: { repositoryId: repository.id } }),
    prisma.review.count({
      where: { pullRequest: { repositoryId: repository.id } },
    }),
    prisma.commit.findMany({
      where: { repositoryId: repository.id },
      select: {
        authorGithubId: true,
        authorLogin: true,
        authorName: true,
        authorEmail: true,
        authoredAt: true,
      },
    }),
  ]);

  return {
    name: details.name,
    course: details.course,
    repository,
    counts: { pullRequests, reviews, commits: commits.length },
    unmatchedAuthors: findUnmatchedAuthors(commits, memberGithubIds),
  };
}
