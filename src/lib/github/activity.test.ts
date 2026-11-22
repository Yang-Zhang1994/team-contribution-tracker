import { describe, expect, it } from "vitest";
import {
  dedupeBy,
  isBotAuthor,
  isMergeCommit,
  toCommitRecord,
  toPullRequestRecord,
  toReviewRecord,
  type GitHubCommit,
  type GitHubPull,
  type GitHubReview,
} from "./activity";

function commit(overrides: Partial<GitHubCommit> = {}): GitHubCommit {
  return {
    sha: "abc123",
    html_url: "https://github.com/o/r/commit/abc123",
    parents: [{ sha: "p1" }],
    author: { id: 101, login: "alex", type: "User" },
    commit: {
      author: {
        name: "Alex Kim",
        email: "alex@example.com",
        date: "2026-11-24T10:00:00Z",
      },
    },
    ...overrides,
  };
}

function pull(overrides: Partial<GitHubPull> = {}): GitHubPull {
  return {
    id: 9001,
    number: 7,
    html_url: "https://github.com/o/r/pull/7",
    title: "Add share calculation",
    user: { id: 101, login: "alex", type: "User" },
    base: { ref: "main" },
    merged_at: "2026-11-25T12:00:00Z",
    updated_at: "2026-11-25T12:00:00Z",
    ...overrides,
  };
}

function review(overrides: Partial<GitHubReview> = {}): GitHubReview {
  return {
    id: 5001,
    html_url: "https://github.com/o/r/pull/7#pullrequestreview-5001",
    user: { id: 202, login: "sam", type: "User" },
    state: "APPROVED",
    submitted_at: "2026-11-25T11:00:00Z",
    ...overrides,
  };
}

describe("PRD §4.1: bot commits are ignored", () => {
  it("detects a linked bot account by login", () => {
    expect(
      isBotAuthor(
        commit({ author: { id: 1, login: "dependabot[bot]", type: "User" } }),
      ),
    ).toBe(true);
  });

  it("detects a linked bot account by type", () => {
    expect(
      isBotAuthor(
        commit({ author: { id: 1, login: "renovate", type: "Bot" } }),
      ),
    ).toBe(true);
  });

  it("detects an unlinked bot by git author name", () => {
    expect(
      isBotAuthor(
        commit({
          author: null,
          commit: {
            author: {
              name: "github-actions[bot]",
              email: "41898282+github-actions[bot]@users.noreply.github.com",
              date: "2026-11-24T10:00:00Z",
            },
          },
        }),
      ),
    ).toBe(true);
  });

  it("does not flag a human author", () => {
    expect(isBotAuthor(commit())).toBe(false);
  });

  it("does not flag an unlinked human author", () => {
    expect(isBotAuthor(commit({ author: null }))).toBe(false);
  });
});

describe("PRD §4.1: merge commits are ignored", () => {
  it("treats a commit with two parents as a merge", () => {
    expect(
      isMergeCommit(commit({ parents: [{ sha: "a" }, { sha: "b" }] })),
    ).toBe(true);
  });

  it("treats a commit with one parent as a normal commit", () => {
    expect(isMergeCommit(commit())).toBe(false);
  });

  it("treats a root commit (no parents) as a normal commit", () => {
    expect(isMergeCommit(commit({ parents: [] }))).toBe(false);
  });
});

describe("toCommitRecord", () => {
  const files = [
    { filename: "src/a.ts", additions: 10, deletions: 2 },
    { filename: "package-lock.json", additions: 500, deletions: 0 },
  ];

  it("maps a commit with its author, author date and filtered line total", () => {
    expect(toCommitRecord(commit(), files)).toEqual({
      sha: "abc123",
      authorGithubId: 101n,
      authorLogin: "alex",
      authorName: "Alex Kim",
      authorEmail: "alex@example.com",
      authoredAt: new Date("2026-11-24T10:00:00Z"),
      linesChanged: 12,
      url: "https://github.com/o/r/commit/abc123",
    });
  });

  it("keeps a commit whose author is not linked to a GitHub account (unmatched)", () => {
    const record = toCommitRecord(commit({ author: null }), files);
    expect(record).toMatchObject({
      authorGithubId: null,
      authorLogin: null,
      authorName: "Alex Kim",
      authorEmail: "alex@example.com",
    });
  });

  it("drops bot commits", () => {
    expect(
      toCommitRecord(
        commit({ author: { id: 1, login: "dependabot[bot]", type: "Bot" } }),
        files,
      ),
    ).toBeNull();
  });

  it("drops merge commits", () => {
    expect(
      toCommitRecord(commit({ parents: [{ sha: "a" }, { sha: "b" }] }), files),
    ).toBeNull();
  });
});

describe("toPullRequestRecord", () => {
  it("maps a merged PR", () => {
    expect(toPullRequestRecord(pull())).toEqual({
      githubId: 9001n,
      number: 7,
      authorGithubId: 101n,
      authorLogin: "alex",
      title: "Add share calculation",
      url: "https://github.com/o/r/pull/7",
      baseRef: "main",
      mergedAt: new Date("2026-11-25T12:00:00Z"),
      githubUpdatedAt: new Date("2026-11-25T12:00:00Z"),
    });
  });

  it("keeps an unmerged PR with mergedAt null, so its reviews have a parent", () => {
    expect(toPullRequestRecord(pull({ merged_at: null })).mergedAt).toBeNull();
  });

  it("keeps a PR whose author account was deleted", () => {
    expect(toPullRequestRecord(pull({ user: null }))).toMatchObject({
      authorGithubId: null,
      authorLogin: null,
    });
  });
});

describe("PRD §4.1: reviews count only on a teammate's PR", () => {
  const prAuthorId = 101;

  it("maps a submitted review on someone else's PR", () => {
    expect(toReviewRecord(review(), prAuthorId)).toEqual({
      githubId: 5001n,
      reviewerGithubId: 202n,
      reviewerLogin: "sam",
      state: "APPROVED",
      url: "https://github.com/o/r/pull/7#pullrequestreview-5001",
      submittedAt: new Date("2026-11-25T11:00:00Z"),
    });
  });

  it("drops a review on the reviewer's own PR", () => {
    expect(
      toReviewRecord(
        review({ user: { id: 101, login: "alex", type: "User" } }),
        prAuthorId,
      ),
    ).toBeNull();
  });

  it("drops a pending review that has not been submitted", () => {
    expect(
      toReviewRecord(
        review({ state: "PENDING", submitted_at: undefined }),
        prAuthorId,
      ),
    ).toBeNull();
  });

  it("drops a review with a null submitted_at", () => {
    expect(
      toReviewRecord(review({ submitted_at: null }), prAuthorId),
    ).toBeNull();
  });

  it("keeps a review when the PR author is unknown", () => {
    expect(toReviewRecord(review(), null)).not.toBeNull();
  });
});

describe("US3-AC2: duplicates within one batch are dropped", () => {
  it("keeps the first item for each key", () => {
    const items = [
      { sha: "a", n: 1 },
      { sha: "b", n: 2 },
      { sha: "a", n: 3 },
    ];
    expect(dedupeBy(items, (item) => item.sha)).toEqual([
      { sha: "a", n: 1 },
      { sha: "b", n: 2 },
    ]);
  });

  it("returns an empty list unchanged", () => {
    expect(dedupeBy([], (item: { id: string }) => item.id)).toEqual([]);
  });
});
