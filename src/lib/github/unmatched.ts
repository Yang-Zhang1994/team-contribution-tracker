// Commit authors that can't be matched to a team member (US3-AC3). They are
// listed for the team and not counted (PRD §4.1).

import type { CommitRecord } from "./activity";

export type AuthoredCommit = Pick<
  CommitRecord,
  "authorGithubId" | "authorLogin" | "authorName" | "authorEmail" | "authoredAt"
>;

export type UnmatchedAuthor = {
  authorGithubId: bigint | null;
  login: string | null;
  name: string;
  email: string;
  commitCount: number;
  lastCommitAt: Date;
};

// Same GitHub account, or for unlinked commits the same email.
function authorKey(commit: AuthoredCommit): string {
  return commit.authorGithubId !== null
    ? `github:${commit.authorGithubId}`
    : `email:${commit.authorEmail.toLowerCase()}`;
}

export function findUnmatchedAuthors(
  commits: AuthoredCommit[],
  memberGithubIds: bigint[],
): UnmatchedAuthor[] {
  const members = new Set(memberGithubIds);
  const byAuthor = new Map<string, UnmatchedAuthor>();

  for (const commit of commits) {
    if (commit.authorGithubId !== null && members.has(commit.authorGithubId)) {
      continue;
    }
    const key = authorKey(commit);
    const entry = byAuthor.get(key);
    if (!entry) {
      byAuthor.set(key, {
        authorGithubId: commit.authorGithubId,
        login: commit.authorLogin,
        name: commit.authorName,
        email: commit.authorEmail,
        commitCount: 1,
        lastCommitAt: commit.authoredAt,
      });
    } else {
      entry.commitCount += 1;
      if (commit.authoredAt > entry.lastCommitAt) {
        entry.lastCommitAt = commit.authoredAt;
      }
    }
  }

  return [...byAuthor.values()].sort((a, b) => b.commitCount - a.commitCount);
}
