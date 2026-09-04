---
name: order-select-leak-pattern
description: Recurring vuln class in this repo — Prisma Order queries returned to clients without an explicit `select`, which silently leaks each newly added column
metadata:
  type: project
---

The highest-yield security check in this codebase is: every `prisma.order.find*` /
`prisma.*.find*` whose result is handed straight to `NextResponse.json(...)` or into an
RSC tree **must** carry an explicit `select`. A bare `where` returns every scalar column,
so any column added by a later feature joins the response by accident.

**Why:** this has already fired twice. `GET /api/orders` leaked the client's stop-contact
name/phone into the open unassigned jobs any activated driver could list; it was fixed by
`ORDER_LIST_SELECT` + a per-row `canSeeStopContacts` redaction (`src/app/api/orders/route.ts`).
The identical pattern was left unfixed on the company side and on the
claim/accept/cancel 200 bodies.

**How to apply:** on any audit touching `Order`, `SavedCard` or another model that gained
columns, grep for `prisma\.\w+\.find(Many|Unique|First)\(\{\s*where` and check for a
sibling `select`. Two entitlement questions follow: (a) is the row scoped to the caller,
and (b) for rows the caller can legitimately list but is not yet a *party* to (open
PENDING work), are the party-only columns redacted per row rather than per query?
Party-only columns today: the six `*ContactName/Phone/Details`, `purchaseOrderRef`,
`savedCardId`.

Related: the saved-card routes are the good example to copy — `CARD_SELECT` in
`src/app/api/saved-cards/card-select.ts` is a shared allowlist all three handlers use.
