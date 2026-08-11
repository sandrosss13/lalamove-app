# Task 05: Role-aware change-password redirect

## Status

complete

## Wave

2

## Description

`/change-password` is genuinely shared between both hosts — a CLIENT changing their own password uses it on the client host, and a company-created driver forced through it on first login uses it on the merchant host — so it stays a single page reachable from both (the middleware in task-02 deliberately does not gate it). Its one bug: the success handler currently does `router.push("/dashboard")` unconditionally, which would send a CLIENT — who lives on `/account`, not `/dashboard` — to a merchant-only path that the middleware would immediately bounce off the client host, landing them signed-out on the wrong host right after they just fixed their password.

## Dependencies

**Depends on:** task-01-host-detection-and-auth-config.md
**Blocks:** None

**Context from dependencies:** None beyond the general spec context — this task doesn't import anything from `src/lib/host.ts`; it only needs the session's `role`, which the page already has via `useSession()`. Listed as depending on task-01 purely for wave sequencing consistency with the rest of this spec, not because of an actual code dependency.

## Files to Create

None.

## Files to Modify

- `src/app/change-password/page.tsx` — make the post-success redirect role-aware.

## Technical Details

### Current relevant code (read the full file before editing)

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { changePassword, useSession } from "@/lib/auth-client";

export default function ChangePasswordPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  // ...currentPassword/newPassword/confirmPassword/error/loading state...

  // ...useEffect redirecting signed-out visitors to /sign-in, unchanged...

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // ...password-match check, setLoading(true)...

    const { error: changePasswordError } = await changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: true,
    });

    if (changePasswordError) {
      setLoading(false);
      setError(changePasswordError.message ?? "Could not change your password. Please try again.");
      return;
    }

    setLoading(false);
    router.push("/dashboard"); // <-- this line changes
    router.refresh();
  }

  // ...rest of the component (loading state, form JSX) unchanged...
}
```

### The fix

`session` is already in scope from the `useSession()` call at the top of the component and is guaranteed non-null by the time `handleSubmit` can run (the component returns `null`/a loading placeholder before rendering the form for a pending or absent session — see the existing `if (isPending) {...}` and `if (!session) { return null; }` guards below the handler). Replace the hardcoded destination:

```tsx
    setLoading(false);
    router.push(session.user.role === "CLIENT" ? "/account" : "/dashboard");
    router.refresh();
```

CLIENT → `/account` (a client-host-only path, correct since a CLIENT session only ever exists on the client host). Anything else (DRIVER or COMPANY) → `/dashboard` (a merchant-host-only path, correct since those sessions only ever exist on the merchant host) — this matches the existing unconditional behavior for non-CLIENT users exactly, so this is a strictly additive fix for the CLIENT case, not a behavior change for drivers/companies.

Do not touch anything else in this file — the redirect-to-`/sign-in`-when-signed-out effect, the password-match validation, the `revokeOtherSessions: true` call, and all JSX/styling stay exactly as they are today.

## Acceptance Criteria

- [ ] A signed-in CLIENT successfully changing their password is redirected to `/account`, not `/dashboard`.
- [ ] A signed-in DRIVER or COMPANY successfully changing their password is still redirected to `/dashboard`, unchanged from today.
- [ ] No other behavior in this file changes.
- [ ] `pnpm lint && pnpm typecheck` pass.
