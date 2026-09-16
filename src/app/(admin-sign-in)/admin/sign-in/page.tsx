"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient, signIn, signOut } from "@/lib/auth-client";

/**
 * One message for every failure mode — bad password, unknown email, a real
 * customer account, a deactivated staff account. Anything more specific would
 * turn this form into an account-enumeration oracle for a page whose whole
 * point is that only a handful of people should know it works at all.
 */
const GENERIC_ERROR = "Those credentials don't have back-office access.";

/**
 * Staff sign-in for the back office.
 *
 * Deliberately styled unlike the public `/sign-in`: no portal picker, a lock
 * mark, "Internal use only" copy and a dark panel, so it is obvious at a glance
 * which of the two sign-in pages you are looking at — the accounts are not
 * interchangeable and a staff member typing customer credentials here (or the
 * reverse) should notice immediately.
 *
 * This file lives under the `(admin-sign-in)` route group rather than in
 * `src/app/admin/sign-in/` on purpose: `src/app/admin/layout.tsx` guards its
 * whole subtree with `requireSystemUser()`, which redirects here — so a sign-in
 * page inside that subtree would redirect to itself forever. The route group is
 * invisible in the URL, so the path is still `/admin/sign-in`.
 *
 * The role check runs *after* `signIn.email` succeeds, matching
 * `src/components/auth/sign-in-form.tsx`: checking first would require an
 * email → role lookup, which is exactly the enumeration oracle above. A
 * non-admin account is signed straight back out again.
 *
 * A genuine `ADMIN` whose `SystemUserProfile` is inactive can only be detected
 * server-side, so they are pushed to `/admin` and bounced back here by
 * `requireSystemUser()` — the same destination this form's own error state
 * would have produced.
 *
 * Colours are shadcn tokens throughout, which is what makes this page theme for
 * free: `data-admin-surface` resolves `muted`/`accent` to the shadcn palette
 * (see the `--admin-accent` chain in `globals.css`) and `html.dark` now carries
 * a full dark set for it, so the panel, the ground and the lock mark all flip
 * together. Nothing here should reach for a `--landing-*` token or a hex — that
 * is the *public* `/sign-in`'s palette, and the visual gap between the two
 * pages is the point.
 */
export default function AdminSignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const { error: signInError } = await signIn.email({ email, password });

    if (signInError) {
      setLoading(false);
      setError(GENERIC_ERROR);
      return;
    }

    // `getSession` returns the custom `role` field, typed via
    // `inferAdditionalFields` in `@/lib/auth-client`.
    const { data: session } = await authClient.getSession();

    if (session?.user.role !== "ADMIN") {
      // A customer just proved they own this password on a page they have no
      // business on — undo the session rather than leaving them signed in.
      await signOut();
      setLoading(false);
      setError(GENERIC_ERROR);
      return;
    }

    setLoading(false);
    router.push("/admin");
    router.refresh();
  }

  return (
    <div
      data-admin-surface
      className="relative flex min-h-screen items-center justify-center bg-muted p-8 font-body text-foreground"
    >
      <div className="flex w-full max-w-sm flex-col gap-6 rounded-xl border border-border bg-background p-8 shadow-sm">
        <div className="flex flex-col gap-2">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ShieldCheck className="size-4.5" />
          </span>
          <h1 className="text-xl font-semibold tracking-tight">
            Back office sign-in
          </h1>
          <p className="text-sm text-muted-foreground">
            Internal use only. Customer and driver accounts sign in on the main
            site.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="admin-email">Work email</Label>
            <Input
              id="admin-email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="admin-password">Password</Label>
            <Input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <Button type="submit" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>

      {/*
        `data-admin-surface` hides the global site header (and with it the app's
        only other `ThemeToggle`), so without this the two staff pages would be
        the only screens with no way to switch themes.

        Parked in the page corner rather than added to the panel: the panel is
        the deliberate part of this design — lock mark, "Internal use only", a
        single centred card with nothing else on it — and a theme switch inside
        it would read as one more account control. `absolute` against the
        `relative` root rather than `fixed` so it scrolls with the page on a
        short viewport, and rendered after the panel so it lands last in tab
        order, behind the credentials a visitor came here to type.

        No `className`: `ThemeToggle`'s defaults are shadcn tokens, which is
        exactly this page's palette. The orange-hover trap does not apply — the
        shared button already avoids `bg-accent` — and even inside this subtree
        `accent` resolves to the neutral shadcn grey rather than the landing
        brand orange.
      */}
      <div className="absolute top-5 right-5">
        <ThemeToggle />
      </div>
    </div>
  );
}
