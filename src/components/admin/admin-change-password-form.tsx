"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changePassword } from "@/lib/auth-client";

/**
 * The forced password change for back-office staff, rendered by
 * `src/app/(admin-sign-in)/admin/change-password/page.tsx`.
 *
 * The client-facing equivalent at `src/app/change-password/page.tsx` is one
 * self-contained client page that has to resolve the session itself (with the
 * `isPending` flash and the redirect effect that entails). This one doesn't:
 * its page is a server component that has already run the back-office guard, so
 * by the time this renders there is a known-good `ADMIN` session with an active
 * `SystemUserProfile` and nothing left to check client-side. Hence a form
 * component rather than a whole page — and no `useSession` call.
 *
 * Styled like `/admin/sign-in` (dark panel, lock mark, `data-admin-surface`)
 * rather than like `/change-password`: both live outside `AdminShell`, and a
 * staff member arrives here directly from that sign-in screen, so the two
 * should read as the same surface.
 */
export function AdminChangePasswordForm() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    // Checked before the request so a typo costs nothing — the round trip would
    // otherwise succeed and lock the staff member out with a password they
    // mistyped, which for a back-office account means another `SUPER_ADMIN` has
    // to intervene.
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);

    // `revokeOtherSessions` signs every other device out. The temporary
    // password was handed over out-of-band, so anyone else who was told it
    // loses their foothold the moment the real owner picks a replacement —
    // which is the entire point of forcing this screen.
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
    // Better Auth's `after` hook in `@/lib/auth` clears `mustChangePassword`
    // for any successful `/change-password` call regardless of which page made
    // it, so `src/app/admin/layout.tsx` lets this staff member straight through
    // now instead of bouncing them back here. `refresh()` discards the router
    // cache so that layout re-runs against the updated session rather than a
    // cached render taken while the flag was still set.
    router.push("/admin");
    router.refresh();
  }

  return (
    <div
      data-admin-surface
      className="flex min-h-screen items-center justify-center bg-muted p-8 font-body text-foreground"
    >
      <div className="flex w-full max-w-sm flex-col gap-6 rounded-xl border border-border bg-background p-8 shadow-sm">
        <div className="flex flex-col gap-2">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <KeyRound className="size-4.5" />
          </span>
          <h1 className="text-xl font-semibold tracking-tight">
            Set a new password
          </h1>
          <p className="text-sm text-muted-foreground">
            Your back-office account was created with a temporary password.
            Choose a new one to continue.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="admin-current-password">Temporary password</Label>
            <Input
              id="admin-current-password"
              type="password"
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="admin-new-password">New password</Label>
            <Input
              id="admin-new-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="admin-confirm-password">Confirm new password</Label>
            <Input
              id="admin-confirm-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </div>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <Button type="submit" disabled={loading}>
            {loading ? "Saving…" : "Save password"}
          </Button>
        </form>
      </div>
    </div>
  );
}
