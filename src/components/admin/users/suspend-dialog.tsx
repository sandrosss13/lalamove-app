"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** Mirrors `MAX_REASON_LENGTH` in the suspend route, which rejects longer. */
const MAX_REASON_LENGTH = 500;

/** The account a confirmation is about, as both user tables describe it. */
export type SuspendTarget = {
  /** `User.id` — what the endpoints are keyed by. */
  userId: string;
  /** Shown in the copy so staff can see which account they are acting on. */
  name: string;
  /** Decides the direction: suspending, or lifting an existing suspension. */
  isSuspended: boolean;
  /** The reason on record, shown when lifting so staff see what they undo. */
  suspendedReason: string | null;
};

type SuspendDialogProps = {
  target: SuspendTarget;
  /** Dismissed without acting — the parent drops its target. */
  onClose: () => void;
  /** The account's state changed; the parent should reload its list. */
  onCompleted: () => void;
};

/**
 * Pulls the API's `{ error }` message out of a failed response so staff see
 * *why* an action was refused (a missing reason, a role that may not moderate)
 * rather than a generic failure. Falls back when the body is missing or shaped
 * unexpectedly, which is the case for an infrastructure-level failure.
 */
async function readErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const body: unknown = await response.json().catch(() => null);

  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof body.error === "string"
  ) {
    return body.error;
  }

  return fallback;
}

/**
 * The confirmation step for suspending or unsuspending an account, shared by
 * the Clients and Sellers tables so both moderate accounts identically.
 *
 * One component covers both directions rather than two nearly identical ones:
 * the copy, the endpoint and whether a reason is collected all follow from
 * `target.isSuspended`, and splitting them would mean keeping two dialogs in
 * step forever.
 *
 * It holds no `open` state. The parent mounts it only while a row is selected
 * (keyed by that row), so the reason box and any error start clean for every
 * account instead of needing to be reset — closing is the parent dropping its
 * target, which is also what `onOpenChange` reports here.
 */
export function SuspendDialog({
  target,
  onClose,
  onCompleted,
}: SuspendDialogProps) {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLifting = target.isSuspended;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedReason = reason.trim();

    // Checked here as well as server-side purely for the faster feedback; the
    // route is what actually enforces it.
    if (!isLifting && trimmedReason === "") {
      setError("A reason is required to suspend an account.");
      return;
    }

    setPending(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/admin/users/${target.userId}/${isLifting ? "unsuspend" : "suspend"}`,
        {
          method: "POST",
          // Unsuspending takes no body at all — see that route's doc comment.
          ...(isLifting
            ? {}
            : {
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reason: trimmedReason }),
              }),
        },
      );

      if (!response.ok) {
        setError(
          await readErrorMessage(
            response,
            isLifting
              ? "Could not lift the suspension."
              : "Could not suspend the account.",
          ),
        );
        setPending(false);
        return;
      }

      // The parent reloads and unmounts this dialog, so `pending` stays true —
      // the button must not flash back to its idle label in between.
      onCompleted();
    } catch {
      setError("Something went wrong. Please try again.");
      setPending(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        // Radix reports Escape, the overlay and the close button all through
        // here; none of them should interrupt a request already in flight.
        if (!open && !pending) {
          onClose();
        }
      }}
    >
      <DialogContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>
              {isLifting ? "Lift suspension" : "Suspend account"}
            </DialogTitle>
            <DialogDescription>
              {isLifting
                ? `${target.name} will be able to use the platform again.`
                : `${target.name} will be flagged as suspended. The reason is kept on the account and in the audit log.`}
            </DialogDescription>
          </DialogHeader>

          {isLifting ? (
            target.suspendedReason ? (
              <p className="text-sm text-muted-foreground">
                Suspended for:{" "}
                <span className="text-foreground">
                  {target.suspendedReason}
                </span>
              </p>
            ) : null
          ) : (
            <div className="flex flex-col gap-2">
              <Label htmlFor="suspend-reason">Reason</Label>
              <Textarea
                id="suspend-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={MAX_REASON_LENGTH}
                placeholder="Why is this account being suspended?"
                disabled={pending}
                autoFocus
                required
              />
            </div>
          )}

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant={isLifting ? "default" : "destructive"}
              disabled={pending}
            >
              {pending
                ? "Saving…"
                : isLifting
                  ? "Lift suspension"
                  : "Suspend account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
