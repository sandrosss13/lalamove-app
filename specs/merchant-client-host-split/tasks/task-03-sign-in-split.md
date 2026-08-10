# Task 03: Audience-aware sign-in

## Status

pending

## Wave

2

## Description

Splits `/sign-in` into a thin server component (`src/app/sign-in/page.tsx`) that detects the requesting host's audience and a new client component (`src/components/auth/sign-in-form.tsx`) that renders the actual form, scoped to that audience: the client host only accepts a CLIENT credential, the merchant host only accepts a DRIVER or COMPANY credential, and — when the split is disabled — the exact current 3-way portal-picker behavior is preserved unchanged. This also fixes a real bug the plan's review caught: today's unconditional `router.push("/")` on success would bounce a driver who just signed in on the merchant host straight back to the client host, landing them signed-out.

## Dependencies

**Depends on:** task-01-host-detection-and-auth-config.md
**Blocks:** None

**Context from dependencies:** task-01 creates `src/lib/host.ts`, exporting the `Audience` type (`"CLIENT" | "MERCHANT" | "BOTH"`) and `audienceForHost(host): Audience`. `audienceForHost` returns `"BOTH"` whenever the split is disabled (the default state until task-08 sets `NEXT_PUBLIC_MERCHANT_HOST`), so this task's audience-scoped branches for `"CLIENT"`/`"MERCHANT"` are simply unreachable until then — the `"BOTH"` branch is what actually renders today, and it must exactly reproduce the current page's behavior.

## Files to Create

- `src/components/auth/sign-in-form.tsx` — the extracted client form, taking an `audience: Audience` prop.

## Files to Modify

- `src/app/sign-in/page.tsx` — becomes a server component that reads the request host and renders `<SignInForm audience={...} />`.

## Technical Details

### Current `src/app/sign-in/page.tsx` (read in full before editing — this is the entire file being replaced)

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { signIn, signOut, authClient } from "@/lib/auth-client";

type Role = "CLIENT" | "DRIVER" | "COMPANY";

const ROLE_LABELS: Record<Role, string> = {
  CLIENT: "client",
  DRIVER: "driver",
  COMPANY: "logistics company",
};

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!role) return;
    setError(null);
    setLoading(true);

    const { error: signInError } = await signIn.email({ email, password });

    if (signInError) {
      setLoading(false);
      setError(signInError.message ?? "Invalid email or password.");
      return;
    }

    const { data: session } = await authClient.getSession();
    const actualRole = session?.user.role as Role | undefined;

    if (actualRole && actualRole !== role) {
      await signOut();
      setLoading(false);
      const actualRoleLabel = ROLE_LABELS[actualRole];
      setError(
        `This account is registered as a ${actualRoleLabel}. Please use the ${actualRoleLabel} sign-in.`,
      );
      return;
    }

    setLoading(false);
    router.push("/");
    router.refresh();
  }

  // Step 1: portal cards (Client / Driver / Company) when role === null.
  // Step 2: email/password form once a portal is chosen, with a "← Back" button.
  // ...full JSX omitted here — see the file on disk for the exact current
  // markup/Tailwind classes to preserve in the "BOTH" branch below.
}
```

### New `src/app/sign-in/page.tsx`

```tsx
import { headers } from "next/headers";

import { audienceForHost } from "@/lib/host";
import { SignInForm } from "@/components/auth/sign-in-form";

export default async function SignInPage() {
  const headersList = await headers();
  const host = headersList.get("x-forwarded-host") ?? headersList.get("host");
  const audience = audienceForHost(host);

  return <SignInForm audience={audience} />;
}
```

Reading the host per-request via `headers()` makes this page dynamically rendered — that's correct and expected: which audience's form to show genuinely depends on the request, and this page was already effectively dynamic (auth-dependent).

### New `src/components/auth/sign-in-form.tsx`

Move the entire current page body here as a `"use client"` component taking `{ audience: Audience }` as a prop (`Audience` imported as `import type { Audience } from "@/lib/host";`). Behavior per audience:

- **`audience === "BOTH"`** (split disabled — today's exact behavior, must not change): keep the existing two-step flow verbatim — step 1 shows the three portal cards (Client / Driver / Company) exactly as today; step 2 shows the email/password form once a portal is picked; the post-auth check compares the resulting session's role against the *picked* portal (`role` state), exactly as today; on success, `router.push("/"); router.refresh();` — unchanged.

- **`audience === "CLIENT"`**: skip the portal-picker step entirely — render the email/password form directly (no step 1), with the heading `"Sign in"` (no "as a client" suffix needed, since this host only ever means client). Internally, treat the allowed role as `["CLIENT"]`. After `signIn.email(...)` succeeds, fetch the session and check `actualRole !== "CLIENT"`; if it isn't CLIENT, `await signOut()` and show: `` `This account is registered as a ${ROLE_LABELS[actualRole]}. Please sign in at the merchant portal.` `` (no portal-switching UI needed here since there's no in-page "other portal" to switch to — this host only has one). On success: `router.push("/"); router.refresh();`.

- **`audience === "MERCHANT"`**: skip the portal-picker step entirely — render the email/password form directly, with the heading `"Sign in"`. Internally, treat the allowed roles as `["DRIVER", "COMPANY"]` (a merchant sign-in accepts either — the host has already decided "not a client", not which merchant type). After `signIn.email(...)` succeeds, fetch the session and check `!["DRIVER", "COMPANY"].includes(actualRole)`; if the account is actually a CLIENT, `await signOut()` and show: `"This is a customer account. Please sign in at the main site."` On success: **`router.push("/dashboard"); router.refresh();`** — this is the fix for the bug described above; do not push `"/"`, which is client-only and would bounce the driver/company straight back off the merchant host via the middleware from task-02.

Keep the `ROLE_LABELS` map (`CLIENT: "client"`, `DRIVER: "driver"`, `COMPANY: "logistics company"`) — still used by the `"BOTH"` branch and by the `"CLIENT"` branch's mismatch message.

Preserve the exact existing Tailwind classes/layout structure (`mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-8`, the card button styles, the input/label/error/button styles) for all three audience branches — only the step-skipping and redirect-target/error-copy logic changes, not the visual design.

Rejected alternatives (do not implement): a pre-auth email→role lookup before calling `signIn.email` (would be an account-enumeration oracle — answering "what role is this email?" to an unauthenticated caller, with no real benefit over the post-auth check). Rejecting the mismatch via a Better Auth `after` hook instead of this client-side check (verified during planning that a throwing `after` hook's error response headers get *appended* to, not replacing, the already-issued session `Set-Cookie` — the cookie ships to the browser regardless, so an after-hook cannot actually prevent the session from being set; the post-auth-check-then-`signOut()` pattern already in this codebase is the correct mechanism, and this task keeps it, just repoints which roles are "allowed").

## Acceptance Criteria

- [ ] `src/app/sign-in/page.tsx` is a server component using `headers()` + `audienceForHost`, rendering `<SignInForm audience={...} />`.
- [ ] `src/components/auth/sign-in-form.tsx` implements all three audience branches described above, with the `"BOTH"` branch behaviorally identical to the current page (verify manually with `NEXT_PUBLIC_MERCHANT_HOST` unset: full 3-way picker, `router.push("/")` on success, unchanged mismatch behavior).
- [ ] `pnpm lint && pnpm typecheck` pass.

## Notes

Full merchant/client-audience manual verification (confirming the client host shows no portal picker and only accepts CLIENT credentials, the merchant host only accepts DRIVER/COMPANY credentials and lands on `/dashboard`) requires `NEXT_PUBLIC_MERCHANT_HOST` to be set — covered by task-08's end-to-end test matrix once all of Wave 2 has landed.
