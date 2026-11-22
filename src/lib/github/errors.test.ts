import { describe, expect, it } from "vitest";
import { classifySyncError } from "./errors";

const now = new Date("2026-11-25T12:00:00Z");

describe("US3-AC4: GitHub errors stop the sync with a plain reason", () => {
  it("classifies a 403 with no remaining quota as a rate limit with reset time", () => {
    const result = classifySyncError(
      {
        status: 403,
        headers: {
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": String(
            Date.parse("2026-11-25T12:30:00Z") / 1000,
          ),
        },
      },
      now,
    );
    expect(result.kind).toBe("rate_limited");
    expect(result.retryAt).toEqual(new Date("2026-11-25T12:30:00Z"));
    expect(result.message).toMatch(/rate limit/i);
  });

  it("classifies a 429 as a rate limit", () => {
    expect(classifySyncError({ status: 429, headers: {} }, now).kind).toBe(
      "rate_limited",
    );
  });

  it("classifies a secondary rate limit (403 with retry-after)", () => {
    const result = classifySyncError(
      { status: 403, headers: { "retry-after": "60" } },
      now,
    );
    expect(result.kind).toBe("rate_limited");
    expect(result.retryAt).toEqual(new Date("2026-11-25T12:01:00Z"));
  });

  it("classifies a 404 as a missing or private repository", () => {
    const result = classifySyncError({ status: 404, headers: {} }, now);
    expect(result.kind).toBe("not_found_or_private");
    expect(result.message).toMatch(/not found or private/i);
    expect(result.retryAt).toBeUndefined();
  });

  it("classifies a plain 403 as a permission error", () => {
    const result = classifySyncError(
      { status: 403, headers: { "x-ratelimit-remaining": "4999" } },
      now,
    );
    expect(result.kind).toBe("forbidden");
    expect(result.message).toMatch(/permission|access/i);
  });

  it("classifies a 401 as an expired sign-in", () => {
    const result = classifySyncError({ status: 401, headers: {} }, now);
    expect(result.kind).toBe("unauthorized");
    expect(result.message).toMatch(/sign in again/i);
  });

  it("classifies anything else as unknown", () => {
    expect(classifySyncError({ status: 500, headers: {} }, now).kind).toBe(
      "unknown",
    );
  });

  it("classifies a non-HTTP error (e.g. network failure) as unknown", () => {
    expect(classifySyncError(new Error("ECONNRESET"), now).kind).toBe(
      "unknown",
    );
    expect(classifySyncError("boom", now).kind).toBe("unknown");
    expect(classifySyncError(null, now).kind).toBe("unknown");
  });

  it("reads headers from an Octokit-style response object", () => {
    const result = classifySyncError(
      {
        status: 403,
        response: { headers: { "x-ratelimit-remaining": "0" } },
      },
      now,
    );
    expect(result.kind).toBe("rate_limited");
    expect(result.retryAt).toBeUndefined();
  });

  it("never includes the raw error message, which may contain request details", () => {
    const result = classifySyncError(
      { status: 500, headers: {}, message: "token ghp_secret in URL" },
      now,
    );
    expect(result.message).not.toContain("ghp_secret");
  });
});
