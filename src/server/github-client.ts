import "server-only";
import { Octokit } from "@octokit/rest";
import type { GitHubCommit } from "@/lib/github/activity";
import type { GitHubSource } from "@/server/sync";

// Octokit-backed GitHubSource for one public repository. The token only
// raises the rate limit; no repository scope is requested.
export function createGitHubSource(
  token: string,
  owner: string,
  repo: string,
): GitHubSource {
  const octokit = new Octokit({ auth: token });

  return {
    async getDefaultBranch() {
      const { data } = await octokit.rest.repos.get({ owner, repo });
      return data.default_branch;
    },

    // Newest-updated first, so we can stop at the first PR older than `since`.
    async listPullsUpdatedSince(since) {
      const pulls = [];
      const pages = octokit.paginate.iterator(octokit.rest.pulls.list, {
        owner,
        repo,
        state: "all",
        sort: "updated",
        direction: "desc",
        per_page: 100,
      });
      for await (const { data } of pages) {
        for (const pull of data) {
          if (since && new Date(pull.updated_at) < since) return pulls;
          pulls.push(pull);
        }
      }
      return pulls;
    },

    async listReviews(prNumber) {
      return octokit.paginate(octokit.rest.pulls.listReviews, {
        owner,
        repo,
        pull_number: prNumber,
        per_page: 100,
      });
    },

    async listCommits(branch, since) {
      const commits = await octokit.paginate(octokit.rest.repos.listCommits, {
        owner,
        repo,
        sha: branch,
        since: since?.toISOString(),
        per_page: 100,
      });
      return commits.map((commit): GitHubCommit => ({
        sha: commit.sha,
        html_url: commit.html_url,
        parents: commit.parents,
        author:
          commit.author && "login" in commit.author
            ? {
                id: commit.author.id,
                login: commit.author.login,
                type: commit.author.type,
              }
            : null,
        commit: {
          author: {
            name: commit.commit.author?.name ?? "",
            email: commit.commit.author?.email ?? "",
            date:
              commit.commit.author?.date ?? commit.commit.committer?.date ?? "",
          },
        },
      }));
    },

    // GitHub returns at most 300 files per commit here, so very large
    // commits are undercounted.
    async getCommitFiles(sha) {
      const { data } = await octokit.rest.repos.getCommit({
        owner,
        repo,
        ref: sha,
      });
      return (data.files ?? []).map(({ filename, additions, deletions }) => ({
        filename,
        additions,
        deletions,
      }));
    },
  };
}
