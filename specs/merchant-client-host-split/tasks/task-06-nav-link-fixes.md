# Task 06: Fix cross-host navigation links (header wordmark + "Home page" link)

## Status

pending

## Wave

2

## Description

Two global navigation links currently point at a fixed path regardless of the signed-in user's role, and both of those paths (`/` and `/home`) are client-only under the split from task-02: the root layout's header wordmark links to `/`, and the signed-in `AuthStatus` widget's "Home page" link goes to `/home`. For a driver/company user on the merchant host, clicking either would get 307-redirected by the middleware to the client host — landing on a page where their merchant-host session cookie doesn't apply, which looks exactly like being forced to sign out even though nothing actually went wrong. The fix for each is a same-host destination, not a cross-origin link: this task does not need `merchantOrigin()`/`clientOrigin()` at all.

## Dependencies

**Depends on:** task-01-host-detection-and-auth-config.md
**Blocks:** None

**Context from dependencies:** None beyond general spec context — both fixes below are role-based using the session data these components already read via `useSession()`, not host-detection from `src/lib/host.ts`. Listed as depending on task-01 for wave sequencing consistency, not an actual code dependency.

## Files to Modify

- `src/components/auth-status.tsx` — drop the "Home page" link for non-CLIENT sessions.
- `src/app/layout.tsx` — replace the static wordmark `<Link>` with a small role-aware client component.

## Technical Details

### `src/components/auth-status.tsx` — current relevant code (read the full file before editing)

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { signOut, useSession } from "@/lib/auth-client";

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

    const isClient = role === "CLIENT";

    return (
      <div className="flex items-center gap-3 text-sm">
        <span>Signed in as {name} ({role})</span>
        <Link href="/home" className="font-medium hover:opacity-70">
          Home page
        </Link>
        <Link href={isClient ? "/account" : "/dashboard"} className="font-medium hover:opacity-70">
          {isClient ? "My account" : "Dashboard"}
        </Link>
        <button type="button" onClick={handleSignOut} className="rounded border px-2 py-1 font-medium hover:opacity-70">
          Sign out
        </button>
      </div>
    );
  }

  // ...signed-out branch unchanged (Sign in / Sign up links)...
}
```

### The fix

`/home` is a marketing/landing page with no merchant-facing equivalent in scope for this feature (the merchant host deliberately has no dedicated landing page — its `/` just redirects to the client host's `/`, per task-02). Rather than build a cross-host link for it, only show the "Home page" link when the signed-in user is a CLIENT — drivers/companies already have "Dashboard" linked right next to it, which is the actually useful destination for them, and dropping the link avoids the confusing cross-host bounce entirely instead of engineering around it:

```tsx
        {isClient ? (
          <Link href="/home" className="font-medium hover:opacity-70">
            Home page
          </Link>
        ) : null}
        <Link href={isClient ? "/account" : "/dashboard"} className="font-medium hover:opacity-70">
          {isClient ? "My account" : "Dashboard"}
        </Link>
```

`isClient` is already computed in this component — reuse it, don't recompute. No other change to this file; the signed-out branch (Sign in / Sign up links) is untouched — those two paths are genuinely shared entry points reachable from either host and don't need modification here.

### `src/app/layout.tsx` — current relevant code (read the full file before editing)

```tsx
import type { Metadata } from "next";
import { Archivo, Bebas_Neue, IBM_Plex_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { AuthStatus } from "@/components/auth-status";

// ...font setup, metadata, unchanged...

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${archivo.variable} ${bebasNeue.variable} ${ibmPlexMono.variable}`}>
      <body>
        <header className="flex items-center justify-between border-b px-6 py-3">
          <Link href="/" className="font-bold">
            Lalamove Clone
          </Link>
          <AuthStatus />
        </header>
        {children}
      </body>
    </html>
  );
}
```

### The fix

`layout.tsx` itself must stay a plain synchronous server component — it wraps every single route in the app, so making it read per-request headers (to compute audience server-side) would force the entire app into dynamic rendering, a much bigger cost than this one link deserves. Instead, extract the wordmark into a tiny new client component that reads `useSession()` (the same hook `AuthStatus` already uses) and picks a same-host destination based on role — no cross-origin URL-building needed at all, since the correct destination for a signed-in merchant user (`/dashboard`) is always same-host relative to wherever they already are:

Add this small component directly in `src/components/auth-status.tsx` (same file, exported alongside `AuthStatus` — it's the same "session-aware header widget" concern, no need for a third file):

```tsx
/**
 * The header wordmark. A plain `<Link href="/">` would be wrong for a
 * signed-in driver/company on the merchant host: `/` is client-only under
 * the merchant/client host split (see `src/middleware.ts`), so clicking it
 * would get redirected to the client host, where their merchant-host
 * session cookie doesn't apply — looking like an unexpected sign-out. Route
 * a signed-in DRIVER/COMPANY to `/dashboard` instead (always same-host,
 * since a merchant session only ever exists on the merchant host); every
 * other case (CLIENT, or signed out) keeps the original destination.
 */
export function HeaderBrandLink() {
  const { data: session } = useSession();
  const isMerchantUser = session?.user.role === "DRIVER" || session?.user.role === "COMPANY";

  return (
    <Link href={isMerchantUser ? "/dashboard" : "/"} className="font-bold">
      Lalamove Clone
    </Link>
  );
}
```

Then in `layout.tsx`:
1. Remove the `import Link from "next/link";` line if it becomes unused after this change (check — `Link` is only used for the wordmark in this file today, so it should be removed).
2. Change the import from `import { AuthStatus } from "@/components/auth-status";` to `import { AuthStatus, HeaderBrandLink } from "@/components/auth-status";`.
3. Replace the wordmark markup:

```tsx
        <header className="flex items-center justify-between border-b px-6 py-3">
          <HeaderBrandLink />
          <AuthStatus />
        </header>
```

Note `HeaderBrandLink` is a client component (it uses the `useSession()` hook), but `layout.tsx` itself does not need a `"use client"` directive — a server component can render a client component as a child exactly as it already does with `<AuthStatus />`.

## Acceptance Criteria

- [ ] Signed in as a CLIENT: "Home page" link is present (unchanged), wordmark links to `/` (unchanged).
- [ ] Signed in as a DRIVER or COMPANY: "Home page" link is no longer rendered, wordmark links to `/dashboard`.
- [ ] Signed out: wordmark links to `/` (unchanged), no "Home page"/"My account"/"Dashboard" links shown (unchanged — that's the existing signed-out branch, untouched).
- [ ] `pnpm lint && pnpm typecheck` pass — in particular, confirm `Link` is still imported in `layout.tsx` only if still used there, and that removing it (if unused) doesn't break anything else in the file.
