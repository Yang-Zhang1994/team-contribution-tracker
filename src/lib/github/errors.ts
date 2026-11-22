// Turns a failed GitHub request into a reason we can show on the team page
// (US3-AC4). The raw error is never passed through: it can carry request
// details we must not display or store.

export type SyncErrorKind =
  | "rate_limited"
  | "not_found_or_private"
  | "forbidden"
  | "unauthorized"
  | "unknown";

export type SyncError = {
  kind: SyncErrorKind;
  message: string;
  // When GitHub says the rate limit resets, if it told us.
  retryAt?: Date;
};

const MESSAGES: Record<SyncErrorKind, string> = {
  rate_limited: "GitHub rate limit reached. Try again later.",
  not_found_or_private:
    "Repository not found or private. Only public repositories can be synced.",
  forbidden: "GitHub refused access to this repository (missing permission).",
  unauthorized: "Your GitHub sign-in has expired. Sign out and sign in again.",
  unknown: "Sync failed because of an unexpected error. Try again later.",
};

type Headers = Record<string, string | number | undefined>;

// Octokit's RequestError has `status` and `response.headers`; accept bare
// `headers` too.
function readHttpError(
  error: unknown,
): { status: number; headers: Headers } | null {
  if (typeof error !== "object" || error === null) return null;
  const { status, headers, response } = error as {
    status?: unknown;
    headers?: Headers;
    response?: { headers?: Headers };
  };
  if (typeof status !== "number") return null;
  return { status, headers: response?.headers ?? headers ?? {} };
}

function rateLimitRetryAt(headers: Headers, now: Date): Date | undefined {
  const retryAfter = headers["retry-after"];
  if (retryAfter !== undefined) {
    return new Date(now.getTime() + Number(retryAfter) * 1000);
  }
  const reset = headers["x-ratelimit-reset"];
  if (reset !== undefined) return new Date(Number(reset) * 1000);
  return undefined;
}

function classify(kind: SyncErrorKind, retryAt?: Date): SyncError {
  return retryAt
    ? { kind, message: MESSAGES[kind], retryAt }
    : { kind, message: MESSAGES[kind] };
}

export function classifySyncError(error: unknown, now: Date): SyncError {
  const http = readHttpError(error);
  if (!http) return classify("unknown");
  const { status, headers } = http;

  const isRateLimited =
    status === 429 ||
    (status === 403 &&
      (String(headers["x-ratelimit-remaining"]) === "0" ||
        headers["retry-after"] !== undefined));
  if (isRateLimited) {
    return classify("rate_limited", rateLimitRetryAt(headers, now));
  }
  if (status === 404) return classify("not_found_or_private");
  if (status === 403) return classify("forbidden");
  if (status === 401) return classify("unauthorized");
  return classify("unknown");
}
