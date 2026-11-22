import { Suspense } from "react";
import { AuthStatus } from "./auth-status";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-4">
      <h1 className="text-3xl font-semibold">Team Contribution Tracker</h1>
      <p className="text-zinc-600 dark:text-zinc-400">
        See how work is shared in your project team, sprint by sprint.
      </p>
      <Suspense fallback={<div className="h-10" />}>
        <AuthStatus />
      </Suspense>
    </main>
  );
}
