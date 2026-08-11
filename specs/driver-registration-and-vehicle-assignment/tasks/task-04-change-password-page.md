# Task 04: Forced Password-Change Page + Dashboard Enforcement

## Status

complete

## Wave

3

## Description

A driver created by a company admin (task-03) logs in with a temp password the admin chose or generated. This task builds the screen that forces them to replace it with their own password before they can reach anything else, and wires the redirect that sends them there. Once they submit a valid current+new password, task-02's `after` hook (already in place by this task's dependency) clears `mustChangePassword` on the backend, and this page sends them on to the normal dashboard.

## Dependencies

**Depends on:** task-02-auth-config.md
**Blocks:** None

**Context from dependencies:** task-02 added `mustChangePassword` as a Better Auth additional field (`input: false`, so it's readable on `session.user.mustChangePassword` from both server and client via the existing `inferAdditionalFields<typeof auth>()` client plugin) and wired an `after` hook on Better Auth's own `/change-password` endpoint that sets `User.mustChangePassword` back to `false` once a password change succeeds. This task only needs to *read* that flag and call Better Auth's existing `authClient.changePassword(...)` — it does not need to touch `src/lib/auth.ts` again.

## Files to Create

- `src/app/change-password/page.tsx` — server component: requires a session, renders the client form.
- `src/components/change-password-form.tsx` — client component: the actual password-change form.

## Files to Modify

- `src/app/dashboard/page.tsx` — redirect to `/change-password` when `session.user.mustChangePassword` is true.

## Technical Details

### `src/app/change-password/page.tsx`

Mirror `src/app/dashboard/page.tsx`'s server-component/session-check pattern (`headers()` + `auth.api.getSession`, `redirect` on no session):

```tsx
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { ChangePasswordForm } from "@/components/change-password-form";

export const dynamic = "force-dynamic";

/**
 * Forced password-change screen for accounts a company admin created with a
 * temporary password (see the driver-registration flow). Also reachable
 * voluntarily by any signed-in user.
 */
export default async function ChangePasswordPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/sign-in");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Set a new password</h1>
        <p className="text-sm opacity-70">
          Your account was created with a temporary password. Choose a new one
          before continuing.
        </p>
      </header>
      <ChangePasswordForm />
    </main>
  );
}
```

### `src/components/change-password-form.tsx`

Follow the established client-form conventions exactly (local `useState` per field, `error` string state, JSON error surfaced inline, no `alert()`):

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth-client";

/** Mirrors Better Auth's default `emailAndPassword.password` minimum length. */
const MIN_PASSWORD_LENGTH = 8;

export function ChangePasswordForm() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const { error: changeError } = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });

      if (changeError) {
        setError(changeError.message ?? "Could not change your password.");
        return;
      }

      // The `after` hook in src/lib/auth.ts already cleared
      // mustChangePassword server-side; refresh so the dashboard's own
      // session read picks that up rather than redirecting back here.
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
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
          minLength={MIN_PASSWORD_LENGTH}
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
          minLength={MIN_PASSWORD_LENGTH}
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          className="rounded border px-3 py-2"
        />
      </label>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <button
        type="submit"
        disabled={submitting}
        className="self-start rounded border px-4 py-2 font-medium hover:opacity-70 disabled:opacity-50"
      >
        {submitting ? "Saving…" : "Save new password"}
      </button>
    </form>
  );
}
```

### `src/app/dashboard/page.tsx` — enforcement

Add the redirect immediately after the existing "no session" check, before the role-based branches:

```tsx
export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    // ...existing unchanged block...
  }

  if (session.user.mustChangePassword) {
    redirect("/change-password");
  }

  if (session.user.role === "CLIENT") {
    redirect("/account");
  }

  // ...rest unchanged...
}
```

Only the new `if (session.user.mustChangePassword) { redirect("/change-password"); }` block is added; every other line in the file is unchanged.

## Acceptance Criteria

- [ ] Visiting `/dashboard` while signed in as a user with `mustChangePassword: true` redirects to `/change-password` before any dashboard content renders.
- [ ] Visiting `/change-password` while signed out redirects to `/sign-in`.
- [ ] Submitting the correct temp password as "Temporary password" and a new password (≥8 chars, matching confirmation) succeeds, clears `mustChangePassword` in the database, and lands the user on `/dashboard` with normal (non-redirected) access.
- [ ] Submitting the wrong "Temporary password" shows an inline error and does not navigate away or clear the flag.
- [ ] Mismatched "New password"/"Confirm new password" shows an inline error without calling the API.
- [ ] `pnpm lint` and `pnpm typecheck` pass.

## Notes

- This enforcement point is `src/app/dashboard/page.tsx` specifically, since it's the single shared entry point all non-CLIENT roles land on today (per `src/app/dashboard/page.tsx`'s existing role-branching). If the app later grows additional authenticated driver-facing *pages* outside `/dashboard`, a root `middleware.ts` would be a stronger, more general enforcement point — out of scope here since no such pages exist yet and this project has no `middleware.ts` today.
- `MIN_PASSWORD_LENGTH = 8` mirrors Better Auth's documented default `emailAndPassword` minimum; this project doesn't override `password.minLength` in `src/lib/auth.ts`, so the default applies. If a future change to `src/lib/auth.ts` changes that default, update this constant to match.
