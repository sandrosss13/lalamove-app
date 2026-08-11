"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { changePassword, useSession } from "@/lib/auth-client";

/**
 * Forced password change for drivers whose account was created for them by a
 * logistics company with a temporary password. Better Auth's
 * `POST /api/auth/change-password` clears the account's `mustChangePassword`
 * flag on success (see the `after` hook in `@/lib/auth`), so a successful
 * submit here is what actually releases the driver into the app.
 */
export default function ChangePasswordPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Better Auth authenticates the change-password call by session cookie, so a
  // signed-out visitor could never succeed here — send them to sign in instead
  // of showing a form that is guaranteed to fail. This lives in an effect
  // because navigating during render isn't allowed, and it waits for
  // `isPending` to settle: the session is always briefly absent on first load.
  useEffect(() => {
    if (!isPending && !session) {
      router.replace("/sign-in");
    }
  }, [isPending, session, router]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    // Checked before the request so a typo costs nothing — the round trip would
    // otherwise succeed and lock the driver out with a password they mistyped.
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);

    // `revokeOtherSessions` signs every other device out. The temporary
    // password was handed over out-of-band (read off a company dashboard), so
    // anyone else holding it loses their foothold the moment the real owner
    // picks a replacement.
    const { error: changePasswordError } = await changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: true,
    });

    if (changePasswordError) {
      setLoading(false);
      setError(
        changePasswordError.message ??
          "Could not change your password. Please try again.",
      );
      return;
    }

    setLoading(false);
    // This page is shared by both hosts, so the landing spot depends on who
    // just changed their password: clients live on `/account`, while drivers
    // and companies land on the merchant-host `/dashboard`. Sending a client to
    // `/dashboard` would get them bounced by the middleware and signed out
    // immediately after fixing their password. `session` is non-null in
    // practice (the form only renders once the session has resolved), but this
    // closure is declared above those guards so TypeScript can't narrow it —
    // the optional chain falls back to `/dashboard`, the pre-existing default.
    router.push(session?.user.role === "CLIENT" ? "/account" : "/dashboard");
    router.refresh();
  }

  // `useSession` is pending on every first render; rendering the form straight
  // away would flash it at the signed-out visitor the effect above redirects.
  if (isPending) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-8">
        <span className="text-sm opacity-50">…</span>
      </main>
    );
  }

  // No session: the effect above has already started the redirect, so render
  // nothing rather than a form that can't be submitted.
  if (!session) {
    return null;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">Set a new password</h1>
        <p className="text-sm opacity-70">
          Your account was created with a temporary password. Choose a new one
          to continue.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Temporary password
          <input
            type="password"
            required
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            className="rounded border px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          New password
          <input
            type="password"
            required
            minLength={8}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            className="rounded border px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Confirm new password
          <input
            type="password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className="rounded border px-3 py-2"
          />
        </label>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <button
          type="submit"
          disabled={loading}
          className="rounded border px-3 py-2 font-medium hover:opacity-70 disabled:opacity-50"
        >
          {loading ? "Saving…" : "Save password"}
        </button>
      </form>
    </main>
  );
}
