import { auth, signIn, signOut } from "@/auth";

// Reads the session cookie, so it must render inside a <Suspense> boundary.
export async function AuthStatus() {
  const session = await auth();

  if (session?.user) {
    return (
      <form
        action={async () => {
          "use server";
          await signOut();
        }}
        className="flex items-center gap-4"
      >
        <span>Signed in as {session.user.name ?? session.user.email}</span>
        <button className="rounded border px-3 py-1" type="submit">
          Sign out
        </button>
      </form>
    );
  }

  return (
    <form
      action={async () => {
        "use server";
        await signIn("github");
      }}
    >
      <button
        className="rounded bg-zinc-900 px-4 py-2 text-white dark:bg-white dark:text-zinc-900"
        type="submit"
      >
        Sign in with GitHub
      </button>
    </form>
  );
}
