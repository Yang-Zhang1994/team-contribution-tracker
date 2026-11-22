import { describe, expect, it } from "vitest";
import { syncSince } from "./sync-window";

describe("US3-AC1: sync fetches activity since the last sync", () => {
  it("fetches full history on the first sync", () => {
    expect(syncSince(null)).toBeNull();
  });

  it("starts 24 hours before the last successful sync by default", () => {
    expect(syncSince(new Date("2026-11-25T12:00:00Z"))).toEqual(
      new Date("2026-11-24T12:00:00Z"),
    );
  });

  it("uses a custom overlap", () => {
    expect(syncSince(new Date("2026-11-25T12:00:00Z"), 2)).toEqual(
      new Date("2026-11-25T10:00:00Z"),
    );
  });

  it("does not modify the given date", () => {
    const last = new Date("2026-11-25T12:00:00Z");
    syncSince(last);
    expect(last).toEqual(new Date("2026-11-25T12:00:00Z"));
  });
});
