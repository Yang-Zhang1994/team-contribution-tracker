// Runs one repository sync (US3): fetch from GitHub, map with the pure rules
// in src/lib/github, then write everything in one step. GitHub and the
// database are injected, so this module has no Prisma, Octokit or
// server-only imports and is unit-tested with fakes.

import {
  dedupeBy,
  isBotAuthor,
  isMergeCommit,
  toCommitRecord,
  toPullRequestRecord,
  toReviewRecord,
  type CommitRecord,
  type GitHubCommit,
  type GitHubPull,
  type GitHubReview,
  type PullRequestRecord,
  type ReviewRecord,
} from "@/lib/github/activity";
import { classifySyncError, type SyncError } from "@/lib/github/errors";
import type { ChangedFile } from "@/lib/github/files";
import { syncSince } from "@/lib/github/sync-window";

// Read access to one repository. `since: null` means full history.
export interface GitHubSource {
  getDefaultBranch(): Promise<string>;
  listPullsUpdatedSince(since: Date | null): Promise<GitHubPull[]>;
  listReviews(prNumber: number): Promise<GitHubReview[]>;
  listCommits(branch: string, since: Date | null): Promise<GitHubCommit[]>;
  getCommitFiles(sha: string): Promise<ChangedFile[]>;
}

export type SavedActivity = {
  defaultBranch: string;
  pullRequests: (PullRequestRecord & { reviews: ReviewRecord[] })[];
  commits: CommitRecord[];
  syncedAt: Date;
};

// Persistence for one repository. saveActivity must be atomic and upsert by
// GitHub keys (US3-AC2).
export interface SyncStore {
  markStarted(at: Date): Promise<void>;
  knownCommitShas(shas: string[]): Promise<Set<string>>;
  saveActivity(activity: SavedActivity): Promise<void>;
  recordFailure(error: SyncError, at: Date): Promise<void>;
}

export type SyncResult =
  | {
      ok: true;
      counts: { pullRequests: number; reviews: number; commits: number };
    }
  | { ok: false; error: SyncError };

export async function runSync({
  lastSyncedAt,
  source,
  store,
  now,
}: {
  lastSyncedAt: Date | null;
  source: GitHubSource;
  store: SyncStore;
  now: () => Date;
}): Promise<SyncResult> {
  const startedAt = now();
  try {
    await store.markStarted(startedAt);
    const since = syncSince(lastSyncedAt);
    const defaultBranch = await source.getDefaultBranch();

    const pulls = dedupeBy(
      (await source.listPullsUpdatedSince(since)).filter(
        (pull) => pull.base.ref === defaultBranch,
      ),
      (pull) => String(pull.id),
    );
    const pullRequests: SavedActivity["pullRequests"] = [];
    for (const pull of pulls) {
      const reviews = (await source.listReviews(pull.number))
        .map((review) => toReviewRecord(review, pull.user?.id ?? null))
        .filter((review) => review !== null);
      pullRequests.push({
        ...toPullRequestRecord(pull),
        reviews: dedupeBy(reviews, (review) => String(review.githubId)),
      });
    }

    // Stored commits never change, so only new ones cost a files request.
    const fetched = dedupeBy(
      await source.listCommits(defaultBranch, since),
      (commit) => commit.sha,
    ).filter((commit) => !isBotAuthor(commit) && !isMergeCommit(commit));
    const known = await store.knownCommitShas(fetched.map((c) => c.sha));
    const commits: CommitRecord[] = [];
    for (const commit of fetched) {
      if (known.has(commit.sha)) continue;
      const record = toCommitRecord(
        commit,
        await source.getCommitFiles(commit.sha),
      );
      if (record) commits.push(record);
    }

    await store.saveActivity({
      defaultBranch,
      pullRequests,
      commits,
      syncedAt: startedAt,
    });
    return {
      ok: true,
      counts: {
        pullRequests: pullRequests.length,
        reviews: pullRequests.reduce((n, pr) => n + pr.reviews.length, 0),
        commits: commits.length,
      },
    };
  } catch (error) {
    const syncError = classifySyncError(error, now());
    await store.recordFailure(syncError, now());
    return { ok: false, error: syncError };
  }
}
