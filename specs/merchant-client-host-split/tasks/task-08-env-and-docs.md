# Task 08: Env var + local-dev documentation

## Status

pending

## Wave

2

## Description

Adds `NEXT_PUBLIC_MERCHANT_HOST` to the two env files (`env.example` as the documented, comment-heavy catalogue this repo's house convention uses for every var; `.env` with the actual local-dev value so the split is live locally as soon as this spec's Wave 2 lands) and a short "Local development: merchant subdomain" section to the root `README.md` explaining how to verify the split works. This is the task that actually turns the split on locally — every other Wave 2 task is inert (falls back to `"BOTH"`/today's-behavior) until this one sets the var.

## Dependencies

**Depends on:** task-01-host-detection-and-auth-config.md
**Blocks:** None

**Context from dependencies:** task-01 establishes that `NEXT_PUBLIC_MERCHANT_HOST` is read via `process.env.NEXT_PUBLIC_MERCHANT_HOST?.trim() || null` in `src/lib/host.ts`, is tri-state (unset = split disabled; set to an exact hostname = split on for that host), and is inlined into the client bundle at build time (so any future change to it in Vercel needs a redeploy — not relevant locally, since `pnpm dev` picks up `.env` changes on restart). This task is the one that actually sets the var for local development — every other Wave 2 task's audience-scoped code paths only become reachable once this task lands.

## Files to Modify

- `env.example` — add the documented, blank-value entry.
- `.env` — add the real local-dev value.
- `README.md` (repo root) — add a short local-dev verification section.

## Technical Details

### `env.example` addition

Add near the end of the file (after the existing `SUPABASE_SERVICE_ROLE_KEY` entry, or wherever fits the file's existing grouping — it doesn't belong with the Supabase/LocationIQ/Google entries, so append it as its own block), matching the file's existing comment density and style (see the `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` entry for the closest precedent — also `NEXT_PUBLIC_`, also has multi-line explanatory comments):

```
# Merchant/client host split — set to the exact hostname (including port for
# local dev) that should serve DRIVER/COMPANY sign-in, sign-up, and the ops
# dashboard, fully separated from the CLIENT-facing main domain. Tri-state:
# leave unset/blank to disable the split entirely (every role shares one
# host, exactly as this template behaves without this var). Local dev value:
# "merchant.localhost:3000" — works with no /etc/hosts edit in Chrome, Edge,
# and Firefox (they resolve *.localhost to loopback natively); Safari on
# macOS does not do this reliably before macOS Tahoe, see README for a
# workaround. Production value: the real merchant subdomain, e.g.
# "merchant.example.com" — set this in Vercel's Production environment only;
# leave Preview and Development unset, since preview deployment URLs have no
# stable subdomain structure to split against.
# NOTE: this value is inlined into the client bundle at build time — changing
# it in the Vercel dashboard requires a redeploy to take effect.
NEXT_PUBLIC_MERCHANT_HOST=""
```

### `.env` addition

Add the equivalent real value (this file holds actual local values per house convention, mirroring `env.example`'s structure):

```
NEXT_PUBLIC_MERCHANT_HOST="merchant.localhost:3000"
```

Place it in the same relative position as the `env.example` entry above.

### `README.md` addition

Read the current `README.md` in full before editing — it has a "Getting started" section ending with the `prisma db push` instruction, followed by a "Scripts" table. Insert a new section after "Getting started" and before "Scripts" (or immediately after, whichever reads more naturally given the surrounding prose — use judgment, but keep the new section short, matching the file's existing terse style):

```markdown
## Local development: merchant subdomain

This app splits sign-in/sign-up/dashboard access by hostname once
`NEXT_PUBLIC_MERCHANT_HOST` is set (see `env.example`): the main domain
serves CLIENT accounts, and the merchant subdomain serves DRIVER/COMPANY
accounts, with fully isolated sessions between the two. To exercise this
locally:

1. Set `NEXT_PUBLIC_MERCHANT_HOST="merchant.localhost:3000"` in `.env`
   (already the default in this repo's `.env`).
2. Run `pnpm dev`.
3. Open `http://localhost:3000` for the client experience and
   `http://merchant.localhost:3000` for the merchant experience — no
   `/etc/hosts` edit needed in Chrome, Edge, or Firefox.
4. Safari on macOS does not reliably resolve `*.localhost` subdomains before
   macOS Tahoe. If you need to test in Safari, add this line to
   `/etc/hosts`: `127.0.0.1 merchant.localhost`.
5. Unset `NEXT_PUBLIC_MERCHANT_HOST` (or delete the line from `.env`) and
   restart `pnpm dev` to disable the split entirely and confirm the app
   reverts to its single-host behavior.
```

## Acceptance Criteria

- [ ] `env.example` documents `NEXT_PUBLIC_MERCHANT_HOST` with the tri-state/local-dev/production/build-time-inlining explanation above, value left blank (`""`).
- [ ] `.env` sets `NEXT_PUBLIC_MERCHANT_HOST="merchant.localhost:3000"`.
- [ ] `README.md` has the new "Local development: merchant subdomain" section.
- [ ] `pnpm lint && pnpm typecheck` pass.
- [ ] **Manual end-to-end verification** (run this once every other Wave 2 task has also landed — this is the integration check for the whole spec, not just this task's own files). Seed one CLIENT, one DRIVER, and one COMPANY account (existing accounts from prior work in this repo are fine), then with `pnpm dev` running and `NEXT_PUBLIC_MERCHANT_HOST="merchant.localhost:3000"` set:
  - [ ] `http://merchant.localhost:3000/` redirects to `http://localhost:3000/`.
  - [ ] `http://merchant.localhost:3000/sign-up` shows exactly two role cards: Driver and Logistics Company.
  - [ ] `http://localhost:3000/sign-up` shows no role picker — goes straight to the CLIENT account-type step.
  - [ ] Signing in as the DRIVER account at `http://merchant.localhost:3000/sign-in` succeeds and lands on `/dashboard`.
  - [ ] With that DRIVER session still active on `merchant.localhost:3000`, opening `http://localhost:3000` in the same browser shows a signed-out state — confirms session isolation. Check DevTools → Application → Cookies: two separate cookie entries (one per host), neither showing a `Domain` attribute.
  - [ ] Signing in with the DRIVER's credentials at `http://localhost:3000/sign-in` fails with a message pointing at the merchant host, and the browser ends up signed out (not left holding a client-host session for a driver account).
  - [ ] Signing in with the CLIENT's credentials at `http://merchant.localhost:3000/sign-in` fails with a message pointing at the main site, and the browser ends up signed out.
  - [ ] `http://localhost:3000/dashboard` redirects to `http://merchant.localhost:3000/dashboard`.
  - [ ] `http://merchant.localhost:3000/account`, `/orders`, and `/home` each redirect to their `http://localhost:3000` equivalents.
  - [ ] If a DRIVER has an active order, their own `/orders/<id>/track` link (from the driver dashboard) still renders correctly on `merchant.localhost:3000` — regression check that the exact-match `/orders` rule in `src/middleware.ts` didn't also catch `/orders/[id]/track`.
  - [ ] A COMPANY registering a new driver from the ops dashboard's "Register driver" drawer still succeeds — regression check for the `hooks.before` sign-up guard's `ctx.request`-absence bail-out in `src/lib/auth.ts`.
  - [ ] Unset `NEXT_PUBLIC_MERCHANT_HOST` in `.env`, restart `pnpm dev`, and confirm the app reverts to exactly today's single-host behavior (3-way sign-in/sign-up pickers, no redirects).

## Notes

There is no test framework in this repo (`package.json` scripts are lint/typecheck/format/build only), so this manual pass is the actual verification gate for the feature as a whole, not just documentation — treat the checklist above as required, not optional, before considering this spec complete.
