"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

/**
 * The per-row deactivate/reactivate control on the System Users table.
 *
 * A separate client island because the page it sits in is a server component —
 * it has to be, since `requireSystemUser()` is the thing authorizing the whole
 * view — and this is the only interactive part of a row.
 *
 * Deactivation is a revocation, not a deletion: `requireSystemUser()` re-reads
 * the profile on every request, so the target loses back-office access on their
 * next page load while their account and audit history survive.
 *
 * Rendered only for a `SUPER_ADMIN` (the page checks). That is cosmetic — both
 * endpoints re-check `adminRole` server-side, which is the real boundary.
 */
export function SystemUserStatusButton({
  userId,
  name,
  isActive,
}: {
  /** The staff member's `User.id`, which the routes key on. */
  userId: string;
  /** Only used to word the confirmation prompt. */
  name: string;
  /** Current state; the button toggles to the opposite of it. */
  isActive: boolean;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    // Deactivating is disruptive and one click away, so it is confirmed;
    // reactivating restores access and is harmless to do by accident.
    if (
      isActive &&
      !window.confirm(`Revoke ${name}'s access to the back office?`)
    ) {
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const action = isActive ? "deactivate" : "reactivate";
      const response = await fetch(
        `/api/admin/users/system/${userId}/${action}`,
        { method: "POST" },
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(payload?.error ?? "Could not update this system user.");
        return;
      }

      // The table is server-rendered from Prisma, so re-rendering the route is
      // what reflects the new status — there is no client-side copy to patch.
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant={isActive ? "destructive" : "outline"}
        onClick={handleClick}
        disabled={submitting}
      >
        {isActive ? "Deactivate" : "Reactivate"}
      </Button>
      {error ? (
        <span className="text-xs text-destructive">{error}</span>
      ) : null}
    </div>
  );
}
