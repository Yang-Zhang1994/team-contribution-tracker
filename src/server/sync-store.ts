import "server-only";
import { prisma } from "@/server/db";
import type { SyncStore } from "@/server/sync";

// A first sync of a busy repository writes many rows.
const SAVE_TIMEOUT_MS = 60_000;

// Prisma-backed SyncStore for one repository. Rows are upserted by their
// GitHub keys, so re-running a sync never duplicates them (US3-AC2).
export function createSyncStore(repositoryId: string): SyncStore {
  return {
    async markStarted(at) {
      await prisma.repository.update({
        where: { id: repositoryId },
        data: { lastSyncStartedAt: at },
      });
    },

    async knownCommitShas(shas) {
      const rows = await prisma.commit.findMany({
        where: { repositoryId, sha: { in: shas } },
        select: { sha: true },
      });
      return new Set(rows.map((row) => row.sha));
    },

    async saveActivity({ defaultBranch, pullRequests, commits, syncedAt }) {
      await prisma.$transaction(
        async (tx) => {
          for (const { reviews, ...pr } of pullRequests) {
            const { id: pullRequestId } = await tx.pullRequest.upsert({
              where: { githubId: pr.githubId },
              create: { ...pr, repositoryId },
              update: pr,
              select: { id: true },
            });
            for (const review of reviews) {
              await tx.review.upsert({
                where: { githubId: review.githubId },
                create: { ...review, pullRequestId },
                update: review,
              });
            }
          }
          // Commits never change once pushed.
          await tx.commit.createMany({
            data: commits.map((commit) => ({ ...commit, repositoryId })),
            skipDuplicates: true,
          });
          await tx.repository.update({
            where: { id: repositoryId },
            data: {
              defaultBranch,
              lastSyncedAt: syncedAt,
              lastSyncError: null,
              lastSyncErrorAt: null,
            },
          });
        },
        { timeout: SAVE_TIMEOUT_MS },
      );
    },

    async recordFailure(error, at) {
      const resets = error.retryAt
        ? ` Limit resets at ${error.retryAt.toISOString().slice(11, 16)} UTC.`
        : "";
      await prisma.repository.update({
        where: { id: repositoryId },
        data: { lastSyncError: error.message + resets, lastSyncErrorAt: at },
      });
    },
  };
}
