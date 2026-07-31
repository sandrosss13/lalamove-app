"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { signOut, useSession } from "@/lib/auth-client";

/**
 * Header widget reflecting the current session. Shows the signed-in user with a
 * sign-out button, or sign-in / sign-up links when there is no session.
 */
export function AuthStatus() {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  if (isPending) {
    return <span className="text-sm opacity-50">…</span>;
  }

  if (session) {
    const { name, role } = session.user;

    async function handleSignOut() {
      await signOut();
      router.refresh();
    }

    return (
      <div className="flex items-center gap-3 text-sm">
        <span>
          Signed in as {name} ({role})
        </span>
        <button
          type="button"
          onClick={handleSignOut}
          className="rounded border px-2 py-1 font-medium hover:opacity-70"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      <Link href="/sign-in" className="font-medium hover:opacity-70">
        Sign in
      </Link>
      <Link href="/sign-up" className="font-medium hover:opacity-70">
        Sign up
      </Link>
    </div>
  );
}
