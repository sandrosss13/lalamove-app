"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { AdminRole } from "@prisma/client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * `AdminRole` rendered for humans, in the order the picker offers them
 * (`SUPER_ADMIN` first, then the delegated roles alphabetically).
 *
 * Exported because the System Users table renders the same labels and the two
 * must not drift; it lives here, next to the picker, because this is the only
 * place the *ordering* also matters. A plain object crossing the client
 * boundary into a server component is fine — the page only reads it while
 * rendering.
 */
export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  SUPER_ADMIN: "Super Admin",
  ANALYTICS: "Analytics",
  CONTENT_MANAGER: "Content Manager",
  CRM_MANAGER: "CRM Manager",
  FINANCE_MANAGER: "Finance Manager",
  SUPPORT: "Support",
  USER_MANAGER: "User Manager",
};

/** Picker order, so the most privileged role is never buried mid-list. */
const ADMIN_ROLE_OPTIONS: AdminRole[] = [
  "SUPER_ADMIN",
  "ANALYTICS",
  "CONTENT_MANAGER",
  "CRM_MANAGER",
  "FINANCE_MANAGER",
  "SUPPORT",
  "USER_MANAGER",
];

/** The slice of the create response this dialog shows back to the admin. */
type CreatedSystemUser = {
  name: string;
  email: string;
  temporaryPassword: string;
};

/** How long the copy button stays in its "Copied!" state, in ms. */
const COPIED_FEEDBACK_MS = 2000;

/**
 * Creates an internal staff account via `POST /api/admin/users/system`.
 *
 * The dialog has two views: the form, then a one-time credential reveal. The
 * temporary password is generated server-side and returned exactly once — it is
 * never stored in readable form and no email provider is wired up — so the
 * second view is the only chance the creating admin gets to pass it on. That is
 * why it renders from local `created` state, why the dialog cannot be dismissed
 * back into the form, and why the form state is only reset once the admin has
 * explicitly closed the reveal.
 *
 * Rendered only for a `SUPER_ADMIN` (the page checks). That is cosmetic — the
 * endpoint re-checks `adminRole` server-side, which is the real boundary.
 */
export function CreateSystemUserDialog() {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  // Empty string means "nothing picked yet"; Radix's Select has no value for
  // that state, so it is passed `undefined` below.
  const [adminRole, setAdminRole] = useState<AdminRole | "">("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedSystemUser | null>(null);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  // The dialog unmounts its content as soon as it closes, which can happen
  // while this timer is still pending.
  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  /**
   * Resets everything back to an empty form. Called on close rather than on
   * open so the temporary password does not linger in component state (or in a
   * React DevTools inspection) any longer than the reveal itself.
   */
  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);

    if (!nextOpen) {
      setName("");
      setEmail("");
      setAdminRole("");
      setError(null);
      setCreated(null);
      setCopied(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (adminRole === "") {
      setError("Pick an admin role.");
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch("/api/admin/users/system", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, adminRole }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        // Reported inline rather than by closing the dialog: a taken email is
        // something the admin has to correct in the form still on screen.
        setError(payload?.error ?? "Could not create this system user.");
        return;
      }

      const result = (await response.json()) as {
        user: { name: string; email: string };
        temporaryPassword: string;
      };

      setCreated({
        name: result.user.name,
        email: result.user.email,
        temporaryPassword: result.temporaryPassword,
      });

      // Refresh now so the table behind the dialog is current by the time the
      // admin closes it. The reveal renders from local state, so it is
      // unaffected.
      router.refresh();
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopy() {
    if (!created) return;

    try {
      await navigator.clipboard.writeText(created.temporaryPassword);
      setCopied(true);
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(
        () => setCopied(false),
        COPIED_FEEDBACK_MS,
      );
    } catch {
      // Clipboard access can be denied by the browser (or unavailable outside a
      // secure context); the password stays visible on screen either way, so
      // this is a soft failure with nothing to report.
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">New System User</Button>
      </DialogTrigger>

      <DialogContent>
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>System user created</DialogTitle>
              <DialogDescription>
                Share these credentials with {created.name} directly — the
                password won&apos;t be shown again. They&apos;ll be asked to set
                their own password on first sign-in.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-2 rounded-lg border border-border p-3 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Email</span>
                <span className="break-all">{created.email}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">
                  Temporary password
                </span>
                <span className="font-mono break-all">
                  {created.temporaryPassword}
                </span>
              </div>
            </div>

            <DialogFooter showCloseButton={false}>
              <Button variant="outline" onClick={handleCopy}>
                {copied ? "Copied!" : "Copy password"}
              </Button>
              <Button onClick={() => handleOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="contents">
            <DialogHeader>
              <DialogTitle>New system user</DialogTitle>
              <DialogDescription>
                Creates a back-office account with a temporary password, shown
                once after you submit.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="system-user-name">Name</Label>
                <Input
                  id="system-user-name"
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Nino Beridze"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="system-user-email">Email</Label>
                <Input
                  id="system-user-email"
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="staff@example.com"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="system-user-role">Admin role</Label>
                <Select
                  value={adminRole === "" ? undefined : adminRole}
                  onValueChange={(value) => setAdminRole(value as AdminRole)}
                >
                  <SelectTrigger id="system-user-role" className="w-full">
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    {ADMIN_ROLE_OPTIONS.map((role) => (
                      <SelectItem key={role} value={role}>
                        {ADMIN_ROLE_LABELS[role]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {error ? (
                <p className="text-sm text-destructive">{error}</p>
              ) : null}
            </div>

            <DialogFooter showCloseButton={false}>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting || adminRole === ""}>
                {submitting ? "Creating…" : "Create system user"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
