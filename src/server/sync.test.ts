import { describe, expect, it, vi } from "vitest";
import type {
  CommitRecord,
  GitHubCommit,
  GitHubPull,
  GitHubReview,
  PullRequestRecord,
  ReviewRecord,
} from "@/lib/github/activity";
import type { ChangedFile } from "@/lib/github/files";
import type { SyncError } from "@/lib/github/errors";
import {
  runSync,
  type GitHubSource,
  type SavedActivity,
  type SyncStore,
} from "./sync";

const T0 = new Date("2026-11-25T12:00:00Z");

function ghCommit(sha: string, overrides: Partial<GitHubCommit> = {}) {
  return {
    sha,
    html_url: `https://github.com/o/r/commit/${sha}`,
    parents: [{ sha: "parent" }],
    author: { id: 101, login: "alex", type: "User" },
    commit: {
      author: {
        name: "Alex Kim",
        email: "alex@example.com",
        date: "2026-11-24T10:00:00Z",
      },
    },
    ...overrides,
  } satisfies GitHubCommit;
}

function ghPull(number: number, overrides: Partial<GitHubPull> = {}) {
  return {
    id: 9000 + number,
    number,
    html_url: `https://github.com/o/r/pull/${number}`,
    title: `PR ${number}`,
    user: { id: 101, login: "alex", type: "User" },
    base: { ref: "main" },
    merged_at: "2026-11-25T10:00:00Z",
    updated_at: "2026-11-25T10:00:00Z",
    ...overrides,
  } satisfies GitHubPull;
}

function ghReview(id: number, reviewerId = 202): GitHubReview {
  return {
    id,
    html_url: `https://github.com/o/r/pull/1#pullrequestreview-${id}`,
    user: { id: reviewerId, login: `user${reviewerId}`, type: "User" },
    state: "APPROVED",
    submitted_at: "2026-11-25T09:00:00Z",
  };
}

type FakeData = {
  defaultBranch?: string;
  pulls?: GitHubPull[];
  reviews?: Record<number, GitHubReview[]>;
  commits?: GitHubCommit[];
  files?: Record<string, ChangedFile[]>;
};

function fakeSource(data: FakeData) {
  const source = {
    getDefaultBranch: vi.fn(async () => data.defaultBranch ?? "main"),
    listPullsUpdatedSince: vi.fn(
      async (_since: Date | null) => data.pulls ?? [],
    ),
    listReviews: vi.fn(
      async (prNumber: number) => data.reviews?.[prNumber] ?? [],
    ),
    listCommits: vi.fn(
      async (_branch: string, _since: Date | null) => data.commits ?? [],
    ),
    getCommitFiles: vi.fn(
      async (sha: string) =>
        data.files?.[sha] ?? [
          { filename: "src/a.ts", additions: 1, deletions: 0 },
        ],
    ),
  } satisfies GitHubSource;
  return source;
}

// In-memory store that keys rows like the database's unique constraints.
class MemoryStore implements SyncStore {
  lastSyncedAt: Date | null = null;
  lastSyncStartedAt: Date | null = null;
  defaultBranch: string | null = null;
  failure: { error: SyncError; at: Date } | null = null;
  pullRequests = new Map<bigint, PullRequestRecord>();
  reviews = new Map<bigint, ReviewRecord>();
  commits = new Map<string, CommitRecord>();
  saveCalls = 0;

  async markStarted(at: Date) {
    this.lastSyncStartedAt = at;
  }

  async knownCommitShas(shas: string[]) {
    return new Set(shas.filter((sha) => this.commits.has(sha)));
  }

  async saveActivity(activity: SavedActivity) {
    this.saveCalls += 1;
    this.defaultBranch = activity.defaultBranch;
    for (const { reviews, ...pr } of activity.pullRequests) {
      this.pullRequests.set(pr.githubId, pr);
      for (const review of reviews) this.reviews.set(review.githubId, review);
    }
    for (const commit of activity.commits) this.commits.set(commit.sha, commit);
    this.lastSyncedAt = activity.syncedAt;
    this.failure = null;
  }

  async recordFailure(error: SyncError, at: Date) {
    this.failure = { error, at };
  }
}

describe("US3-AC1: Sync now fetches merged PRs, reviews and commits", () => {
  it("fetches full history on the first sync and stores everything", async () => {
    const source = fakeSource({
      pulls: [ghPull(1)],
      reviews: { 1: [ghReview(5001)] },
      commits: [ghCommit("a"), ghCommit("b")],
    });
    const store = new MemoryStore();

    const result = await runSync({
      lastSyncedAt: null,
      source,
      store,
      now: () => T0,
    });

    expect(source.listPullsUpdatedSince).toHaveBeenCalledWith(null);
    expect(source.listCommits).toHaveBeenCalledWith("main", null);
    expect(store.pullRequests.size).toBe(1);
    expect(store.reviews.size).toBe(1);
    expect([...store.commits.keys()]).toEqual(["a", "b"]);
    expect(store.defaultBranch).toBe("main");
    expect(result).toEqual({
      ok: true,
      counts: { pullRequests: 1, reviews: 1, commits: 2 },
    });
  });

  it("records the start time as the last successful sync", async () => {
    const store = new MemoryStore();
    let tick = T0.getTime();
    const now = () => new Date((tick += 1000));

    await runSync({ lastSyncedAt: null, source: fakeSource({}), store, now });

    expect(store.lastSyncStartedAt).toEqual(new Date(T0.getTime() + 1000));
    expect(store.lastSyncedAt).toEqual(store.lastSyncStartedAt);
  });

  it("fetches only activity since the last sync, with a 24h overlap", async () => {
    const source = fakeSource({});
    await runSync({
      lastSyncedAt: new Date("2026-11-24T12:00:00Z"),
      source,
      store: new MemoryStore(),
      now: () => T0,
    });

    const since = new Date("2026-11-23T12:00:00Z");
    expect(source.listPullsUpdatedSince).toHaveBeenCalledWith(since);
    expect(source.listCommits).toHaveBeenCalledWith("main", since);
  });

  it("uses the repository's default branch for commits and PRs", async () => {
    const source = fakeSource({
      defaultBranch: "trunk",
      pulls: [ghPull(1, { base: { ref: "trunk" } }), ghPull(2)],
    });
    const store = new MemoryStore();

    await runSync({ lastSyncedAt: null, source, store, now: () => T0 });

    expect(source.listCommits).toHaveBeenCalledWith("trunk", null);
    expect([...store.pullRequests.values()].map((pr) => pr.number)).toEqual([
      1,
    ]);
    expect(source.listReviews).not.toHaveBeenCalledWith(2);
  });

  it("stores line totals without lockfiles and generated files", async () => {
    const store = new MemoryStore();
    await runSync({
      lastSyncedAt: null,
      source: fakeSource({
        commits: [ghCommit("a")],
        files: {
          a: [
            { filename: "src/a.ts", additions: 20, deletions: 5 },
            { filename: "package-lock.json", additions: 900, deletions: 0 },
          ],
        },
      }),
      store,
      now: () => T0,
    });

    expect(store.commits.get("a")?.linesChanged).toBe(25);
  });

  it("skips bot and merge commits without fetching their files", async () => {
    const source = fakeSource({
      commits: [
        ghCommit("human"),
        ghCommit("bot", {
          author: { id: 1, login: "dependabot[bot]", type: "Bot" },
        }),
        ghCommit("merge", { parents: [{ sha: "x" }, { sha: "y" }] }),
      ],
    });
    const store = new MemoryStore();

    await runSync({ lastSyncedAt: null, source, store, now: () => T0 });

    expect([...store.commits.keys()]).toEqual(["human"]);
    expect(source.getCommitFiles).toHaveBeenCalledTimes(1);
    expect(source.getCommitFiles).toHaveBeenCalledWith("human");
  });

  it("drops self-reviews and keeps reviews on unmerged PRs", async () => {
    const store = new MemoryStore();
    await runSync({
      lastSyncedAt: null,
      source: fakeSource({
        pulls: [ghPull(1, { merged_at: null })],
        reviews: { 1: [ghReview(5001, 202), ghReview(5002, 101)] },
      }),
      store,
      now: () => T0,
    });

    expect([...store.reviews.keys()]).toEqual([BigInt(5001)]);
    expect([...store.pullRequests.values()][0].mergedAt).toBeNull();
  });

  it("succeeds with nothing to store for an empty repository", async () => {
    const store = new MemoryStore();
    const result = await runSync({
      lastSyncedAt: null,
      source: fakeSource({}),
      store,
      now: () => T0,
    });

    expect(result).toEqual({
      ok: true,
      counts: { pullRequests: 0, reviews: 0, commits: 0 },
    });
    expect(store.lastSyncedAt).toEqual(T0);
  });
});

describe("US3-AC2: re-running a sync never creates duplicates", () => {
  it("stores the same rows when the same activity is synced twice", async () => {
    const data: FakeData = {
      pulls: [ghPull(1)],
      reviews: { 1: [ghReview(5001)] },
      commits: [ghCommit("a"), ghCommit("b")],
    };
    const store = new MemoryStore();

    await runSync({
      lastSyncedAt: null,
      source: fakeSource(data),
      store,
      now: () => T0,
    });
    const second = fakeSource(data);
    await runSync({
      lastSyncedAt: store.lastSyncedAt,
      source: second,
      store,
      now: () => new Date("2026-11-25T13:00:00Z"),
    });

    expect(store.pullRequests.size).toBe(1);
    expect(store.reviews.size).toBe(1);
    expect(store.commits.size).toBe(2);
    expect(second.getCommitFiles).not.toHaveBeenCalled();
  });

  it("drops a commit that appears twice in one fetch", async () => {
    const source = fakeSource({ commits: [ghCommit("a"), ghCommit("a")] });
    const store = new MemoryStore();

    const result = await runSync({
      lastSyncedAt: null,
      source,
      store,
      now: () => T0,
    });

    expect(source.getCommitFiles).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ ok: true, counts: { commits: 1 } });
  });
});

describe("US3-AC4: a GitHub error stops the sync cleanly", () => {
  const rateLimit = Object.assign(new Error("API rate limit exceeded"), {
    status: 403,
    response: {
      headers: {
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": String(Date.parse("2026-11-25T13:00:00Z") / 1000),
      },
    },
  });

  it("records the reason, writes nothing and keeps the last successful sync time", async () => {
    const lastSyncedAt = new Date("2026-11-24T12:00:00Z");
    const store = new MemoryStore();
    store.lastSyncedAt = lastSyncedAt;
    const source = fakeSource({ pulls: [ghPull(1)], commits: [ghCommit("a")] });
    source.listReviews.mockRejectedValueOnce(rateLimit);

    const result = await runSync({
      lastSyncedAt,
      source,
      store,
      now: () => T0,
    });

    expect(result).toEqual({
      ok: false,
      error: {
        kind: "rate_limited",
        message: expect.stringMatching(/rate limit/i),
        retryAt: new Date("2026-11-25T13:00:00Z"),
      },
    });
    expect(store.saveCalls).toBe(0);
    expect(store.pullRequests.size).toBe(0);
    expect(store.lastSyncedAt).toEqual(lastSyncedAt);
    expect(store.failure).toEqual({
      error: expect.objectContaining({ kind: "rate_limited" }),
      at: T0,
    });
  });

  it("reports a missing or private repository", async () => {
    const store = new MemoryStore();
    const source = fakeSource({});
    source.getDefaultBranch.mockRejectedValueOnce(
      Object.assign(new Error("Not Found"), { status: 404 }),
    );

    const result = await runSync({
      lastSyncedAt: null,
      source,
      store,
      now: () => T0,
    });

    expect(result).toMatchObject({
      ok: false,
      error: { kind: "not_found_or_private" },
    });
    expect(store.failure?.error.kind).toBe("not_found_or_private");
  });

  it("records an unknown failure when saving fails", async () => {
    const store = new MemoryStore();
    vi.spyOn(store, "saveActivity").mockRejectedValueOnce(new Error("db down"));

    const result = await runSync({
      lastSyncedAt: null,
      source: fakeSource({}),
      store,
      now: () => T0,
    });

    expect(result).toMatchObject({ ok: false, error: { kind: "unknown" } });
    expect(store.failure?.error.kind).toBe("unknown");
    expect(store.lastSyncedAt).toBeNull();
  });
});
