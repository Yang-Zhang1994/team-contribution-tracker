"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { syncTeamRepository, type SyncOutcome } from "@/server/team-sync";

const syncInput = z.object({ teamId: z.string().min(1).max(64) });

// Reachable by direct POST, so it authenticates and authorizes on its own.
export async function syncTeam(
  _previous: SyncOutcome | null,
  formData: FormData,
): Promise<SyncOutcome> {
  const session = await auth();
  if (!session?.user) return { ok: false, message: "Sign in to sync." };

  const input = syncInput.safeParse({ teamId: formData.get("teamId") });
  if (!input.success) return { ok: false, message: "Invalid request." };

  const outcome = await syncTeamRepository(session.user.id, input.data.teamId);
  refresh();
  return outcome;
}
