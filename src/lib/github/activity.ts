// Maps GitHub API payloads to the records we store, applying the counting
// rules of PRD §4.1 that can be decided at sync time.

import { countLinesChanged, type ChangedFile } from "./files";

// The subset of GitHub REST payloads we read.
export type GitHubUser = { id: number; login: string; type?: string };

export type GitHubCommit = {
  sha: string;
  html_url: string;
  parents: { sha: string }[];
  // null when the git author email isn't linked to a GitHub account.
  author: GitHubUser | null;
  commit: { author: { name: string; email: string; date: string } };
};

export type GitHubPull = {
  id: number;
  number: number;
  html_url: string;
  title: string;
  user: GitHubUser | null;
  base: { ref: string };
  merged_at: string | null;
  updated_at: string;
};

export type GitHubReview = {
  id: number;
  html_url: string;
  user: GitHubUser | null;
  state: string;
  submitted_at?: string | null;
};

export type CommitRecord = {
  sha: string;
  authorGithubId: bigint | null;
  authorLogin: string | null;
  authorName: string;
  authorEmail: string;
  authoredAt: Date;
  linesChanged: number;
  url: string;
};

export type PullRequestRecord = {
  githubId: bigint;
  number: number;
  authorGithubId: bigint | null;
  authorLogin: string | null;
  title: string;
  url: string;
  baseRef: string;
  mergedAt: Date | null;
  githubUpdatedAt: Date;
};

export type ReviewRecord = {
  githubId: bigint;
  reviewerGithubId: bigint | null;
  reviewerLogin: string | null;
  state: string;
  url: string;
  submittedAt: Date;
};

const isBotName = (name: string) => name.endsWith("[bot]");

export function isBotAuthor(commit: GitHubCommit): boolean {
  if (commit.author) {
    return commit.author.type === "Bot" || isBotName(commit.author.login);
  }
  return isBotName(commit.commit.author.name);
}

export function isMergeCommit(commit: GitHubCommit): boolean {
  return commit.parents.length > 1;
}

// null for bot and merge commits, which are never counted.
export function toCommitRecord(
  commit: GitHubCommit,
  files: ChangedFile[],
): CommitRecord | null {
  if (isBotAuthor(commit) || isMergeCommit(commit)) return null;
  return {
    sha: commit.sha,
    authorGithubId: commit.author ? BigInt(commit.author.id) : null,
    authorLogin: commit.author?.login ?? null,
    authorName: commit.commit.author.name,
    authorEmail: commit.commit.author.email,
    authoredAt: new Date(commit.commit.author.date),
    linesChanged: countLinesChanged(files),
    url: commit.html_url,
  };
}

export function toPullRequestRecord(pull: GitHubPull): PullRequestRecord {
  return {
    githubId: BigInt(pull.id),
    number: pull.number,
    authorGithubId: pull.user ? BigInt(pull.user.id) : null,
    authorLogin: pull.user?.login ?? null,
    title: pull.title,
    url: pull.html_url,
    baseRef: pull.base.ref,
    mergedAt: pull.merged_at ? new Date(pull.merged_at) : null,
    githubUpdatedAt: new Date(pull.updated_at),
  };
}

// null for pending reviews and reviews on the reviewer's own PR.
export function toReviewRecord(
  review: GitHubReview,
  prAuthorGithubId: number | null,
): ReviewRecord | null {
  if (!review.submitted_at) return null;
  if (review.user && review.user.id === prAuthorGithubId) return null;
  return {
    githubId: BigInt(review.id),
    reviewerGithubId: review.user ? BigInt(review.user.id) : null,
    reviewerLogin: review.user?.login ?? null,
    state: review.state,
    url: review.html_url,
    submittedAt: new Date(review.submitted_at),
  };
}

// Keeps the first item for each key, e.g. when paginated results overlap.
export function dedupeBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
