# Task 02: Admin auth guard, sign-in, and back-office shell

## Status

complete

## Wave

2

## Description

This task builds the foundation every other admin page sits on: a way to sign in as staff, a dedicated `admin.` subdomain the back office lives on (mirroring the existing merchant/client host split), a role guard that keeps everyone else out, and the shell (sidebar nav + section tab layouts) that all later section tasks render into. It also closes a real security gap: today, `POST /api/auth/sign-up/email` accepts an arbitrary `role` in the body, and the existing host-split hook (`src/lib/auth.ts`) only rejects `CLIENT` vs. non-`CLIENT` mismatches — it does not know about `ADMIN` at all, so a hand-rolled sign-up request could self-grant `role: "ADMIN"` today. This task makes that impossible, and makes admin account creation exclusively a `SUPER_ADMIN`-driven server action (built in task-05).

**Architecture note (supersedes an earlier draft of this task):** the admin back office is served on its own subdomain — a new `NEXT_PUBLIC_ADMIN_HOST` env var, exactly mirroring how `NEXT_PUBLIC_MERCHANT_HOST` already splits DRIVER/COMPANY traffic onto a `merchant.` host in `src/lib/host.ts`. It is a fully independent tri-state split: unset by default (so `/admin` keeps working path-based on the main host with zero setup, same as local dev works today without any subdomain), settable to `admin.localhost:3000` locally or `admin.<production-domain>` in production. The admin and merchant splits can be enabled independently of each other. Building the complete navigation tree and section-level tab layouts here — rather than letting each later task add its own nav entry — is deliberate: it means Wave 3/4/6 tasks never touch a shared file, so they can run fully in parallel without conflicting edits.

## Dependencies

**Depends on:** task-01-schema-and-migration.md
**Blocks:** task-03 through task-16 (every later task renders inside the shell/layouts this task creates, and calls the guard this task creates).

**Context from dependencies:** task-01 added `UserRole.ADMIN`, the `AdminRole` enum, and `SystemUserProfile` (one row per admin `User`, with `adminRole` and `isActive`) to the Prisma schema, and regenerated the Prisma Client. This task is the first to actually use those generated types. **Note:** task-01's migration was already applied directly to the live Supabase database (not just a local dev DB) — this task's own Prisma-affecting work is limited to reading the already-migrated schema; it does not need to run any further migration.

## Files to Create

- `src/lib/admin/auth.ts` — `requireSystemUser()` server helper: reads the Better Auth session, checks `role === "ADMIN"` and an active `SystemUserProfile`, redirects to `/admin/sign-in` otherwise; also exports a role-check helper (e.g. `hasAdminRole(profile, allowed: AdminRole[])`) later tasks use to gate section-specific actions (e.g. only `SUPER_ADMIN`/`USER_MANAGER` can suspend an account).
- `src/lib/admin/audit.ts` — `writeAuditLog({ actorId, action, entityType, entityId?, metadata? })` thin wrapper around `prisma.auditLog.create`, so every later task logs consistently instead of hand-rolling the call.
- `src/app/admin/sign-in/page.tsx` — admin sign-in form (email/password only, reusing `authClient.signIn.email` from `src/lib/auth-client.ts`, styled distinctly from the public `/sign-in` so staff can tell the two apart). On success, redirect to `/admin`. On failure (wrong credentials, or a successful auth but no active `SystemUserProfile`), show an error — do not leak whether the email exists.
- `src/app/admin/layout.tsx` — root admin layout: calls `requireSystemUser()`, renders `AdminShell` around `children`. Marked `export const dynamic = "force-dynamic"` (session + Prisma access, matching the existing `src/app/dashboard/page.tsx` pattern).
- `src/components/admin/admin-shell.tsx` — sidebar + top bar shell component. Sidebar lists the five sections with icons and expandable sub-links (see nav tree below); top bar shows the signed-in staff member's name/`adminRole` and a sign-out button (`authClient.signOut()`, redirect to `/admin/sign-in`).
- `src/components/admin/admin-nav.ts` — exports the full nav tree as a typed constant (`{ label, href, adminRoles: AdminRole[] }[]` per section), consumed by `admin-shell.tsx` to render links and hide sections the current staff member's `adminRole` cannot access. This is the single place the complete IA lives — later tasks must not need to edit it, since it's already complete after this task.
- `src/app/admin/(sections)/users/layout.tsx` — tab sub-nav for User Management (`Clients` / `Sellers` / `System Users`), wraps `children`.
- `src/app/admin/(sections)/content/layout.tsx` — tab sub-nav for Content Management (`Banners` / `Static Pages` / `Translations` / `Messaging Templates` / `Home Page`), wraps `children`.
- `src/app/admin/(sections)/finance/layout.tsx` — tab sub-nav for Finances (`Payment Methods` / `Promo Campaigns`), wraps `children`.
- `src/app/admin/(sections)/crm/layout.tsx` — tab sub-nav for CRM (`Segments` / `Surveys` / `Campaigns`), wraps `children`.
- `src/app/admin/page.tsx` — `/admin` index: a minimal landing/redirect (e.g. redirect to `/admin/analytics`, built in task-03) so `/admin` itself is never a dead end.
- `components.json` — shadcn/ui config (see Implementation Steps below).
- `src/components/ui/*` — shadcn primitives: `button`, `table`, `dialog`, `dropdown-menu`, `tabs`, `input`, `label`, `select`, `calendar`, `popover`, `badge`, `card`, `checkbox`, `textarea`. These are generated files, not hand-written from scratch.
- `src/lib/utils.ts` — shadcn's standard `cn()` class-merge helper (generated by `shadcn init` if not already present; check first, since it's a common utility name — do not overwrite an existing file with different contents without checking).

## Files to Modify

- `src/lib/host.ts` — add the admin side of the host split, additively, without changing existing merchant/client behavior when `NEXT_PUBLIC_ADMIN_HOST` is unset. Specifically:
  - A new `RAW_ADMIN_HOST` / `ADMIN_HOST` pair, read from `process.env.NEXT_PUBLIC_ADMIN_HOST`, following the exact same trim/lowercase/misconfiguration-guard pattern as `MERCHANT_HOST` (see the existing `MISCONFIGURED` check) — except the admin host must be checked against **both** `CLIENT_HOST` and `MERCHANT_HOST` (an admin host colliding with either would be a redirect-loop/ambiguous-audience bug).
  - Export `IS_ADMIN_HOST_ENABLED = ADMIN_HOST !== null`.
  - Extend the `Audience` type from `"CLIENT" | "MERCHANT" | "BOTH"` to `"CLIENT" | "MERCHANT" | "ADMIN" | "BOTH"` — **add** `"ADMIN"`, do **not** remove `"BOTH"` (it's load-bearing for the existing split-disabled behavior consumed elsewhere — see Notes).
  - In `audienceForHost()`, check `ADMIN_HOST` **first**, before the existing `!IS_HOST_SPLIT_ENABLED` early return — so admin-host classification works independently of whether the merchant split is enabled. See the Code Snippet below for the exact shape.
  - Add `adminOrigin(): string | null`, mirroring `merchantOrigin()` exactly (same protocol-resolution logic, same client/server safety).
  - Add `export const ADMIN_TRUSTED_ORIGINS: string[]`, mirroring `MERCHANT_TRUSTED_ORIGINS` exactly.
- `src/middleware.ts` — add admin-host routing, layered independently alongside the existing merchant/client logic (which must keep working byte-identical when `NEXT_PUBLIC_ADMIN_HOST` is unset). See the Code Snippet below for the exact shape: an `ADMIN_ONLY_PREFIXES = ["/admin"]` list, an `isAdminOnly()` helper, and two new redirect branches — one sending non-`/admin` requests away from the admin host, one sending `/admin` requests on a non-admin host to the real admin host (only when `IS_ADMIN_HOST_ENABLED`).
- `src/lib/auth.ts` — in the existing `before` hook, restructure per the Code Snippet below: (1) unconditionally reject `role === "ADMIN"` at sign-up, regardless of host-split state; (2) unconditionally reject *any* sign-up whose request resolves to the `"ADMIN"` audience (no account of any role is ever created via public sign-up on the admin host); (3) keep the existing `CLIENT`/`MERCHANT` host-split logic exactly as it is today, only reached after (1) and (2). Also add `...ADMIN_TRUSTED_ORIGINS` to the `trustedOrigins` array (alongside the existing `...MERCHANT_TRUSTED_ORIGINS` spread), and import `ADMIN_HOST`-related exports from `@/lib/host` as needed.
- `src/components/auth/sign-in-form.tsx` — `POST_SIGN_IN_PATH: Record<Audience, string>` must add an `ADMIN` key (TypeScript will fail to compile otherwise, since `Audience` now has four members). This branch is unreachable in practice — middleware redirects any non-`/admin` path away from the admin host before this component ever renders there — but the type needs a value; use `ADMIN: "/admin"` with a one-line comment explaining it's unreachable and why.
- `env.example` — document `NEXT_PUBLIC_ADMIN_HOST` immediately below the existing `NEXT_PUBLIC_MERCHANT_HOST` entry, matching its documented style (blank by default, local-dev value `admin.localhost:3000`, production value `admin.<your-domain>`, same Safari `/etc/hosts` caveat).
- `README.md` — optionally add a short parallel note to the existing "Local development: merchant subdomain" section covering the admin subdomain (`admin.localhost:3000`), for the same discoverability reasons that section already exists. Nice-to-have, not required for acceptance.
- `package.json` — only if `shadcn init` / the primitives listed above require new dependencies (e.g. `@radix-ui/react-*`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`) — these are added automatically by the `shadcn` CLI.

## Technical Details

### Implementation Steps

1. Set up shadcn/ui: run `pnpm dlx shadcn@latest init` (Tailwind v4 + React 19 + Next.js App Router are already in place, per `package.json`; answer prompts to match the existing `src/` layout and the `@/*` path alias already configured in `tsconfig.json`). Then `pnpm dlx shadcn@latest add button table dialog dropdown-menu tabs input label select calendar popover badge card checkbox textarea`.
2. Extend `src/lib/host.ts` per "Files to Modify" above and the Code Snippet below.
3. Extend `src/middleware.ts` per "Files to Modify" above and the Code Snippet below.
4. Write `src/lib/admin/auth.ts`. Pattern it after `src/app/dashboard/page.tsx`'s session check: call `auth.api.getSession({ headers: await headers() })`, then `prisma.systemUserProfile.findUnique({ where: { userId: session.user.id } })`. Redirect (`redirect("/admin/sign-in")`) if there's no session, `session.user.role !== "ADMIN"`, no `SystemUserProfile`, or `!systemUserProfile.isActive`. Return `{ session, systemUserProfile }` on success so callers get both without a second query.
5. Write `src/lib/admin/audit.ts` as a small wrapper — see Code Snippets.
6. Update `src/lib/auth.ts`'s sign-up hook per "Files to Modify" above and the Code Snippet below.
7. Add the `ADMIN` key to `POST_SIGN_IN_PATH` in `src/components/auth/sign-in-form.tsx`.
8. Document `NEXT_PUBLIC_ADMIN_HOST` in `env.example`.
9. Build the sign-in page, layout, shell, and nav constant. The nav tree (exact hrefs later tasks must match):
   - Sales Analytics → `/admin/analytics` (task-03)
   - User Management → `/admin/users/clients`, `/admin/users/sellers` (task-04), `/admin/users/system` (task-05)
   - Content Management → `/admin/content/banners`, `/admin/content/pages` (task-07), `/admin/content/translations` (task-08), `/admin/content/messaging-templates` (task-09), `/admin/content/home-page` (task-10)
   - Finances → `/admin/finance/payment-methods` (task-11), `/admin/finance/promo-campaigns` (task-12)
   - CRM → `/admin/crm/segments`, `/admin/crm/surveys` (task-15), `/admin/crm/campaigns` (task-16)
10. Build the four section `layout.tsx` tab-nav files using the shadcn `tabs` (or plain `<Link>`s styled as tabs) primitive — they only need to render tab links and `{children}`; the leaf `page.tsx` files that make each tab's content real are built by later tasks and do not exist yet after this task (that's expected and fine — the routes will 404 until their task lands, same as any not-yet-built route).
11. Build `src/app/admin/page.tsx` as a server component that just `redirect("/admin/analytics")`.
12. Run `pnpm check` (lint + typecheck). **Do not run any Prisma migration command in this task** — task-01 already applied the schema this task depends on; this task only writes application code.
13. **Do not attempt to configure `NEXT_PUBLIC_ADMIN_HOST` in any real `.env` or Vercel deployment** — that's a deployment/DNS decision for a human (document it in `env.example` per step 8, but leave the actual value unset). Verify your work locally by setting `NEXT_PUBLIC_ADMIN_HOST="admin.localhost:3000"` in a local `.env` only for manual testing, then confirm the app still works correctly with it unset/removed afterward (the default, zero-config state must be provably unaffected by everything this task adds).

### Code Snippets

`src/lib/host.ts` additions (illustrative — match the file's existing style/comment density exactly, this is the logic shape, not verbatim prose):

```ts
// Mirrors RAW_MERCHANT_HOST/MERCHANT_HOST exactly, one line below it.
const RAW_ADMIN_HOST =
  process.env.NEXT_PUBLIC_ADMIN_HOST?.trim().toLowerCase() || null;

// Extends the existing MISCONFIGURED check: an admin host colliding with
// either the client host or the merchant host would be ambiguous/loop-prone,
// same reasoning as the existing merchant-vs-client guard.
const ADMIN_MISCONFIGURED =
  RAW_ADMIN_HOST !== null &&
  (RAW_ADMIN_HOST === CLIENT_HOST.toLowerCase() ||
    (RAW_MERCHANT_HOST !== null && RAW_ADMIN_HOST === RAW_MERCHANT_HOST));

if (ADMIN_MISCONFIGURED) {
  console.error(
    `[host] NEXT_PUBLIC_ADMIN_HOST ("${RAW_ADMIN_HOST}") collides with the ` +
      "client or merchant host. Disabling the admin host split — fix one of these values.",
  );
}

export const ADMIN_HOST = ADMIN_MISCONFIGURED ? null : RAW_ADMIN_HOST;
export const IS_ADMIN_HOST_ENABLED = ADMIN_HOST !== null;

// Audience gains a 4th member. "BOTH" is unchanged/still load-bearing for the
// merchant split's disabled state — do not remove it.
export type Audience = "CLIENT" | "MERCHANT" | "ADMIN" | "BOTH";

export function audienceForHost(host: string | null | undefined): Audience {
  // Checked first and independent of IS_HOST_SPLIT_ENABLED (which only
  // gates the merchant dimension) — the admin split can be on while the
  // merchant split is off, or vice versa.
  if (host && ADMIN_HOST && host.toLowerCase() === ADMIN_HOST.toLowerCase()) {
    return "ADMIN";
  }

  if (!IS_HOST_SPLIT_ENABLED) {
    return "BOTH";
  }

  if (
    host &&
    MERCHANT_HOST &&
    host.toLowerCase() === MERCHANT_HOST.toLowerCase()
  ) {
    return "MERCHANT";
  }

  return "CLIENT";
}

// Mirrors merchantOrigin() exactly.
export function adminOrigin(): string | null {
  if (!ADMIN_HOST) {
    return null;
  }
  const protocol =
    typeof window !== "undefined" ? window.location.protocol : CLIENT_PROTOCOL;
  return `${protocol}//${ADMIN_HOST}`;
}

// Mirrors MERCHANT_TRUSTED_ORIGINS exactly.
export const ADMIN_TRUSTED_ORIGINS: string[] = ADMIN_HOST
  ? [`http://${ADMIN_HOST}`, `https://${ADMIN_HOST}`]
  : [];
```

`src/middleware.ts` additions (layered around the existing logic — the existing `MERCHANT_ONLY_PREFIXES`/`isMerchantOnly`/`CLIENT_ONLY_*`/`isClientOnly` and their two redirect branches stay exactly as they are):

```ts
import {
  ADMIN_HOST, // only needed if referenced directly; adminOrigin()/IS_ADMIN_HOST_ENABLED are the ones actually used below
  adminOrigin,
  IS_ADMIN_HOST_ENABLED,
  // ...plus the existing imports
} from "@/lib/host";

const ADMIN_ONLY_PREFIXES = ["/admin"];

function isAdminOnly(pathname: string): boolean {
  return matchesPrefix(pathname, ADMIN_ONLY_PREFIXES);
}

export function middleware(request: NextRequest) {
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const audience = audienceForHost(host);
  const { pathname, search } = request.nextUrl;

  // Admin host serves only /admin/** — everything else redirects to the
  // client host. Checked before the existing IS_HOST_SPLIT_ENABLED bail-out
  // since this dimension is independent of the merchant split.
  if (audience === "ADMIN") {
    if (!isAdminOnly(pathname)) {
      return NextResponse.redirect(new URL(`${pathname}${search}`, clientOrigin()));
    }
    return NextResponse.next();
  }

  // /admin requested on a non-admin host while the admin split is
  // configured — send it to the real admin host, same pattern as the
  // existing merchant-only-path redirect below.
  if (IS_ADMIN_HOST_ENABLED && isAdminOnly(pathname)) {
    const origin = adminOrigin();
    if (origin) {
      return NextResponse.redirect(new URL(`${pathname}${search}`, origin));
    }
  }

  if (!IS_HOST_SPLIT_ENABLED) {
    return NextResponse.next();
  }

  // ...existing CLIENT/MERCHANT branches, unchanged...
}
```

`src/lib/auth.ts`'s `before` hook restructuring (illustrative placement — the existing host-split logic block moves to the end, unchanged, after two new unconditional checks):

```ts
before: createAuthMiddleware(async (ctx) => {
  if (ctx.path !== SIGN_UP_EMAIL_PATH) {
    return;
  }

  const role = (ctx.body as { role?: string } | undefined)?.role ?? "CLIENT";

  // No self-serve admin sign-up, ever — System Users are created directly by
  // a SUPER_ADMIN via a trusted server-side call (see task-05), not through
  // this public endpoint, regardless of host-split state.
  if (role === "ADMIN") {
    throw new APIError("FORBIDDEN", {
      message: "Admin accounts cannot self sign up.",
    });
  }

  if (!ctx.request) {
    return; // existing driver-registration direct-call bail-out, unchanged
  }

  const host =
    ctx.request.headers.get("x-forwarded-host") ??
    ctx.request.headers.get("host");
  const audience = audienceForHost(host);

  // No account of any role is created from the admin host.
  if (audience === "ADMIN") {
    throw new APIError("FORBIDDEN", {
      message: "Accounts cannot be created from the admin host.",
    });
  }

  if (!IS_HOST_SPLIT_ENABLED) {
    return;
  }

  // ...existing CLIENT/MERCHANT audience checks, unchanged...
}),
```

### Environment Variables

- `NEXT_PUBLIC_ADMIN_HOST` — the admin subdomain's exact hostname (same format contract as `NEXT_PUBLIC_MERCHANT_HOST`: include port for local dev, e.g. `admin.localhost:3000`; no port in production, e.g. `admin.example.com`). Unset by default — leaving it unset keeps `/admin` reachable path-based on the main host with zero setup, exactly like the merchant split's default-off behavior.

### API Endpoints

None new in this task (sign-in reuses Better Auth's existing `POST /api/auth/sign-in/email`).

## Acceptance Criteria

- [ ] With `NEXT_PUBLIC_ADMIN_HOST` unset (the default), `/admin` still works exactly as it would have under a purely path-based design — reachable on the main host, gated only by `requireSystemUser()`.
- [ ] With `NEXT_PUBLIC_ADMIN_HOST="admin.localhost:3000"` set locally: visiting `admin.localhost:3000/admin` (signed in as an active `ADMIN`) renders the shell; visiting any non-`/admin` path on that host (e.g. `admin.localhost:3000/`) redirects to the main host; visiting `/admin` on the main host or the merchant host redirects to `admin.localhost:3000/admin`.
- [ ] Visiting `/admin` while signed out redirects to `/admin/sign-in` (on whichever host `/admin` is currently reachable on).
- [ ] Visiting `/admin` while signed in as a `CLIENT`/`DRIVER`/`COMPANY` user redirects to `/admin/sign-in` (never shows admin content).
- [ ] Visiting `/admin` while signed in as an `ADMIN` user with an active `SystemUserProfile` renders the shell and redirects `/admin` → `/admin/analytics`.
- [ ] An `ADMIN` user whose `SystemUserProfile.isActive` is `false` is redirected to `/admin/sign-in`, not shown the shell.
- [ ] `POST /api/auth/sign-up/email` with `{ role: "ADMIN", ... }` in the body is rejected with `403 FORBIDDEN`, regardless of `NEXT_PUBLIC_MERCHANT_HOST`/`NEXT_PUBLIC_ADMIN_HOST` state — verify manually with `curl` or the browser devtools network tab.
- [ ] `POST /api/auth/sign-up/email` for *any* role, made against the admin host (when `NEXT_PUBLIC_ADMIN_HOST` is set), is rejected with `403 FORBIDDEN`.
- [ ] The sidebar shows all five sections (hidden/shown per the signed-in staff member's `adminRole` per `admin-nav.ts`), and each of the four section layouts renders its tab sub-nav.
- [ ] With `NEXT_PUBLIC_ADMIN_HOST` unset, every existing merchant/client host-split behavior (sign-in/sign-up portal cards, `/dashboard` redirects, etc.) is provably unchanged — re-verify a couple of the existing flows manually (e.g. sign in as a driver on the merchant host) after this task's changes.
- [ ] `pnpm check` passes.

## Notes

- Section leaf pages 404 until their own task lands — that's expected; this task only has to make the shell, nav, and layouts correct, not every route reachable yet.
- Keep the admin sign-in page visually distinct from `/sign-in` (different heading/copy at minimum) so staff never confuse the two.
- `AdminRole`-based nav filtering here is a UI nicety, not the security boundary — every section's actual API routes must independently check `hasAdminRole` server-side (later tasks' job) since hiding a nav link never stops a direct request.
- Do **not** remove `"BOTH"` from the `Audience` type or change what it means — `src/components/auth/sign-in-form.tsx` and `src/components/auth/sign-up-form.tsx` both branch on it to mean "merchant split disabled, show the full three-portal picker," and changing its semantics would silently break the existing client/merchant sign-in and sign-up flows. Only *add* `"ADMIN"` alongside it.
- **Do not touch a live database's schema in this task.** task-01 already migrated `prisma/schema.prisma`'s changes to the real Supabase instance directly (flagged to and accepted by the user); this task consumes the already-generated Prisma Client and writes application code only.
