"use client";

import { useActionState } from "react";
import type { SyncOutcome } from "@/server/team-sync";
import { syncTeam } from "./actions";

export function SyncButton({ teamId }: { teamId: string }) {
  const [outcome, action, pending] = useActionState<
    SyncOutcome | null,
    FormData
  >(syncTeam, null);

  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="teamId" value={teamId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-zinc-900 px-4 py-2 text-white disabled:opacity-60 dark:bg-white dark:text-zinc-900"
      >
        {pending ? "Syncing…" : "Sync now"}
      </button>
      {outcome && !pending && (
        <p
          role="status"
          className={
            outcome.ok
              ? "text-green-700 dark:text-green-400"
              : "text-red-700 dark:text-red-400"
          }
        >
          {outcome.message}
        </p>
      )}
    </form>
  );
}
