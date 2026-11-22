// Which changed files count toward "lines changed" (PRD §4.1).

export type ChangedFile = {
  filename: string;
  additions: number;
  deletions: number;
};

const LOCKFILES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lock",
  "bun.lockb",
  "Cargo.lock",
  "poetry.lock",
  "Gemfile.lock",
  "composer.lock",
  "go.sum",
]);

const GENERATED_SUFFIXES = [".min.js", ".min.css", ".map", ".snap"];

// A file inside any of these directories is build output or vendored code.
const GENERATED_DIRS = new Set([
  "dist",
  "build",
  ".next",
  "coverage",
  "node_modules",
  "generated",
]);

export function isExcludedFile(path: string): boolean {
  const parts = path.split("/");
  const name = parts[parts.length - 1];
  if (LOCKFILES.has(name)) return true;
  if (GENERATED_SUFFIXES.some((suffix) => name.endsWith(suffix))) return true;
  return parts.slice(0, -1).some((dir) => GENERATED_DIRS.has(dir));
}

// Additions + deletions over counted files. Not capped: the 300-per-commit
// cap is applied when shares are computed (US4).
export function countLinesChanged(files: ChangedFile[]): number {
  return files
    .filter((file) => !isExcludedFile(file.filename))
    .reduce((sum, file) => sum + file.additions + file.deletions, 0);
}
