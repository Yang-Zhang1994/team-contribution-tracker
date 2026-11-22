import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/auth";
import { getTeamSyncStatus } from "@/server/team-sync";
import { SyncButton } from "./sync-button";

// Sync now runs as a server action on this page; a first sync of a busy
// repository makes many GitHub requests.
export const maxDuration = 60;

export default function TeamPage({ params }: PageProps<"/teams/[teamId]">) {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-12">
      <Suspense fallback={<p className="text-zinc-500">Loading team…</p>}>
        <TeamSync params={params} />
      </Suspense>
    </main>
  );
}

// Reads params and the session, so it renders inside <Suspense>.
async function TeamSync({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const session = await auth();
  if (!session?.user) redirect("/");

  const status = await getTeamSyncStatus(session.user.id, teamId);
  if (!status) notFound();

  const formatTime = (date: Date) =>
    new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: status.course.timeZone,
    }).format(date);

  const { repository } = status;

  return (
    <>
      <header>
        <p className="text-sm text-zinc-500">{status.course.name}</p>
        <h1 className="text-3xl font-semibold">{status.name}</h1>
      </header>

      {!repository ? (
        <p>This team has no linked repository yet.</p>
      ) : (
        <>
          <section className="flex flex-col gap-2">
            <a
              href={`https://github.com/${repository.owner}/${repository.name}`}
              className="font-mono underline"
            >
              {repository.owner}/{repository.name}
            </a>
            <p>
              Last successful sync:{" "}
              {repository.lastSyncedAt
                ? formatTime(repository.lastSyncedAt)
                : "never"}
            </p>
            {repository.lastSyncError && repository.lastSyncErrorAt && (
              <p role="alert" className="text-red-700 dark:text-red-400">
                Last sync failed at {formatTime(repository.lastSyncErrorAt)}:{" "}
                {repository.lastSyncError}
              </p>
            )}
            <SyncButton teamId={teamId} />
          </section>

          <section>
            <h2 className="mb-2 text-xl font-semibold">Synced activity</h2>
            <ul>
              <li>{status.counts.pullRequests} pull requests</li>
              <li>{status.counts.reviews} reviews</li>
              <li>{status.counts.commits} commits</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-xl font-semibold">Unmatched authors</h2>
            {status.unmatchedAuthors.length === 0 ? (
              <p className="text-zinc-600 dark:text-zinc-400">
                Every commit author is matched to a team member.
              </p>
            ) : (
              <>
                <p className="mb-2 text-zinc-600 dark:text-zinc-400">
                  These commits aren&apos;t counted until the author is linked
                  to a team member.
                </p>
                <ul className="flex flex-col gap-1">
                  {status.unmatchedAuthors.map((author) => (
                    <li key={author.authorGithubId?.toString() ?? author.email}>
                      {author.login ? `@${author.login}` : author.name} (
                      {author.email}): {author.commitCount} commit
                      {author.commitCount === 1 ? "" : "s"}, last on{" "}
                      {formatTime(author.lastCommitAt)}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </>
      )}
    </>
  );
}
