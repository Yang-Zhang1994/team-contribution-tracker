import { describe, expect, it } from "vitest";
import { countLinesChanged, isExcludedFile } from "./files";

describe("PRD §4.1: lines changed exclude lockfiles and generated files", () => {
  describe("isExcludedFile", () => {
    it.each([
      "package-lock.json",
      "frontend/package-lock.json",
      "yarn.lock",
      "pnpm-lock.yaml",
      "bun.lock",
      "bun.lockb",
      "Cargo.lock",
      "poetry.lock",
      "Gemfile.lock",
      "composer.lock",
      "go.sum",
    ])("excludes lockfile %s", (path) => {
      expect(isExcludedFile(path)).toBe(true);
    });

    it.each([
      "public/vendor/jquery.min.js",
      "styles/app.min.css",
      "dist/app.js.map",
      "src/__snapshots__/page.test.ts.snap",
      "dist/index.js",
      "packages/web/build/main.js",
      ".next/server/app.js",
      "coverage/lcov.info",
      "node_modules/react/index.js",
      "src/generated/prisma/client.ts",
    ])("excludes generated or bundled file %s", (path) => {
      expect(isExcludedFile(path)).toBe(true);
    });

    it.each([
      "src/lib/share.ts",
      "README.md",
      "prisma/schema.prisma",
      "prisma/migrations/20261122044653_github_sync/migration.sql",
      "package.json",
      "src/lib/build-info.ts",
      "docs/distribution.md",
      "src/lockfile.ts",
    ])("keeps source file %s", (path) => {
      expect(isExcludedFile(path)).toBe(false);
    });
  });

  describe("countLinesChanged", () => {
    it("sums additions and deletions across files", () => {
      expect(
        countLinesChanged([
          { filename: "src/a.ts", additions: 10, deletions: 2 },
          { filename: "src/b.ts", additions: 0, deletions: 5 },
        ]),
      ).toBe(17);
    });

    it("skips excluded files", () => {
      expect(
        countLinesChanged([
          { filename: "src/a.ts", additions: 10, deletions: 2 },
          { filename: "package-lock.json", additions: 4000, deletions: 3000 },
        ]),
      ).toBe(12);
    });

    it("is 0 for a lockfile-only commit", () => {
      expect(
        countLinesChanged([
          { filename: "package-lock.json", additions: 50, deletions: 10 },
        ]),
      ).toBe(0);
    });

    it("is 0 when the commit has no files", () => {
      expect(countLinesChanged([])).toBe(0);
    });

    it("does not cap large commits (the 300-line cap belongs to US4)", () => {
      expect(
        countLinesChanged([
          { filename: "src/big.ts", additions: 900, deletions: 100 },
        ]),
      ).toBe(1000);
    });
  });
});
