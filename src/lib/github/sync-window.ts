const HOUR_MS = 60 * 60 * 1000;

// Where an incremental sync starts fetching. Re-fetching an overlap is safe
// because records are upserted by their GitHub keys, and it catches activity
// whose timestamp is earlier than when GitHub made it visible.
// null means first sync: fetch the full history.
export function syncSince(
  lastSyncedAt: Date | null,
  overlapHours = 24,
): Date | null {
  if (!lastSyncedAt) return null;
  return new Date(lastSyncedAt.getTime() - overlapHours * HOUR_MS);
}
