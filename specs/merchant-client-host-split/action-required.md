# Action Required: Merchant/Client Host Split

Manual steps that must be completed by a human. These cannot be automated.

## Before Implementation

No manual steps required before implementation starts — no accounts, API keys, or DNS changes are needed to build and test this feature locally.

## During Implementation

- [ ] **Nothing** — all files in this spec are code/config that agents can create and edit directly.

## After Implementation

- [ ] **Local verification against `merchant.localhost:3000`** — Chrome, Edge, or Firefox (not Safari on macOS, which does not reliably resolve `*.localhost` subdomains to loopback before macOS Tahoe). See each task's acceptance criteria and the manual test flow in `README.md` (task-08 adds this section).
- [ ] **When a real production domain is registered** (not part of this feature — a future follow-up): add the production origin to `TRUSTED_ORIGINS` in `src/lib/auth.ts`, repoint `BETTER_AUTH_URL` to the real production origin, and set `NEXT_PUBLIC_MERCHANT_HOST` to the real merchant subdomain in Vercel's **Production environment only** (leave Preview and Development unset). Remember `NEXT_PUBLIC_MERCHANT_HOST` is inlined into the client bundle at build time — changing it in the Vercel dashboard requires a redeploy to take effect.

---

> These tasks are also referenced in context within the relevant task files.
