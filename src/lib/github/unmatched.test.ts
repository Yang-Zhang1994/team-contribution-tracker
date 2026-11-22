import { describe, expect, it } from "vitest";
import { findUnmatchedAuthors, type AuthoredCommit } from "./unmatched";

function commit(overrides: Partial<AuthoredCommit> = {}): AuthoredCommit {
  return {
    authorGithubId: BigInt(101),
    authorLogin: "alex",
    authorName: "Alex Kim",
    authorEmail: "alex@example.com",
    authoredAt: new Date("2026-11-24T10:00:00Z"),
    ...overrides,
  };
}

const members = [BigInt(101), BigInt(202)];

describe("US3-AC3: unmatched commit authors are listed for the team", () => {
  it("returns nothing when every author is a member", () => {
    expect(
      findUnmatchedAuthors(
        [commit(), commit({ authorGithubId: BigInt(202), authorLogin: "sam" })],
        members,
      ),
    ).toEqual([]);
  });

  it("lists a GitHub account that is not a team member", () => {
    expect(
      findUnmatchedAuthors(
        [
          commit({
            authorGithubId: BigInt(999),
            authorLogin: "outsider",
            authorName: "Out Sider",
            authorEmail: "out@example.com",
          }),
        ],
        members,
      ),
    ).toEqual([
      {
        authorGithubId: BigInt(999),
        login: "outsider",
        name: "Out Sider",
        email: "out@example.com",
        commitCount: 1,
        lastCommitAt: new Date("2026-11-24T10:00:00Z"),
      },
    ]);
  });

  it("lists a git author with no linked GitHub account", () => {
    const [entry] = findUnmatchedAuthors(
      [
        commit({
          authorGithubId: null,
          authorLogin: null,
          authorName: "Laptop User",
          authorEmail: "user@laptop.local",
        }),
      ],
      members,
    );
    expect(entry).toMatchObject({
      authorGithubId: null,
      login: null,
      name: "Laptop User",
      email: "user@laptop.local",
      commitCount: 1,
    });
  });

  it("groups commits by GitHub account, counting them and keeping the latest date", () => {
    const outsider = { authorGithubId: BigInt(999), authorLogin: "outsider" };
    const result = findUnmatchedAuthors(
      [
        commit({ ...outsider, authoredAt: new Date("2026-11-24T10:00:00Z") }),
        commit({ ...outsider, authoredAt: new Date("2026-11-26T10:00:00Z") }),
        commit({ ...outsider, authoredAt: new Date("2026-11-25T10:00:00Z") }),
      ],
      members,
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      commitCount: 3,
      lastCommitAt: new Date("2026-11-26T10:00:00Z"),
    });
  });

  it("groups unlinked commits by email, ignoring case", () => {
    const unlinked = { authorGithubId: null, authorLogin: null };
    const result = findUnmatchedAuthors(
      [
        commit({ ...unlinked, authorEmail: "User@Laptop.local" }),
        commit({ ...unlinked, authorEmail: "user@laptop.local" }),
      ],
      members,
    );
    expect(result).toHaveLength(1);
    expect(result[0].commitCount).toBe(2);
  });

  it("orders authors by commit count, most first", () => {
    const result = findUnmatchedAuthors(
      [
        commit({ authorGithubId: BigInt(1), authorLogin: "one" }),
        commit({ authorGithubId: BigInt(2), authorLogin: "two" }),
        commit({ authorGithubId: BigInt(2), authorLogin: "two" }),
      ],
      members,
    );
    expect(result.map((entry) => entry.login)).toEqual(["two", "one"]);
  });

  it("returns nothing when there are no commits", () => {
    expect(findUnmatchedAuthors([], members)).toEqual([]);
  });
});
