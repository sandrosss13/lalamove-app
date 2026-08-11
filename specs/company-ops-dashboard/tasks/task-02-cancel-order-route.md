# Task 02: Cancel-order API route

## Status

complete

## Wave

1

## Description

`OrderStatus.CANCELLED` is a valid enum value, rendered in the UI (`order-card.tsx`'s `STATUS_STYLES`, the client account page's cancelled-orders filter), but **no API route anywhere in this codebase transitions an order into it**. The new order-detail drawer (task-13) needs a "Cancel order" action for non-terminal orders, so this task adds the missing route. It mirrors the two existing company-order routes (`claim`, `dispatch`) exactly in structure and conventions.

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** task-13-order-detail-drawer.md

**Context from dependencies:** None — this task only needs the existing `claim`/`dispatch` route files as a pattern reference (both fully reproduced below) and the `Order`/`OrderStatus` schema.

## Files to Create

- `src/app/api/logistics-company/orders/[id]/cancel/route.ts` — new `POST` route.

## Technical Details

### Reference pattern: `src/app/api/logistics-company/orders/[id]/claim/route.ts` (existing, do not modify)

```ts
import { NextResponse } from "next/server";
import { OrderStatus } from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (session.user.role !== "COMPANY") {
    return NextResponse.json(
      { error: "Only logistics companies can claim deliveries." },
      { status: 403 },
    );
  }

  const { id } = await params;

  const company = await prisma.logisticsCompany.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });

  if (!company) {
    return NextResponse.json(
      { error: "Complete your company profile before claiming deliveries." },
      { status: 400 },
    );
  }

  // ... existence/type-match checks, then an atomic conditional updateMany
}
```

### Reference pattern for scoped ownership: `dispatch/route.ts` (existing, do not modify)

```ts
// Scoped by ownership *and* status: an order this company hasn't claimed, or
// has already dispatched, is not dispatchable and is reported as missing.
const order = await prisma.order.findFirst({
  where: { id, companyId: company.id, status: OrderStatus.CLAIMED },
  select: { id: true, vehicleTypeSpecId: true },
});

if (!order) {
  return NextResponse.json({ error: "Order not found." }, { status: 404 });
}
```

Both routes report another company's order (or a nonexistent one) as a plain `404 "Order not found."`, never a `403` — a `403` would confirm the id exists, letting a caller enumerate a competitor's data. Follow this exactly.

### New route: `POST /api/logistics-company/orders/[id]/cancel`

- **Request:** no body.
- **Response:** the updated `Order` row, `200`.
- **Auth:** session required (`401` if none); `session.user.role !== "COMPANY"` → `403`.
- **Ownership:** resolve `company` via `prisma.logisticsCompany.findUnique({ where: { userId: session.user.id }, select: { id: true } })`; if none, `404` (same "Order not found." wording — a company with no profile owns no orders, so this is indistinguishable from "not found" to the caller).
- **Order lookup:** `prisma.order.findFirst({ where: { id, companyId: company.id }, select: { id: true, status: true } })`. If not found → `404 "Order not found."`.
  - Note this is scoped by `companyId: company.id` only, **not** by a specific prior status (unlike `dispatch`, which requires `CLAIMED`) — a company should be able to cancel an order at any point in its own lifecycle (`CLAIMED`, `ACCEPTED`, or `IN_TRANSIT`), not just one specific stage.
- **Terminal-state guard:** if `order.status` is already `"COMPLETED"` or `"CANCELLED"`, return `409` with `{ error: "This delivery can no longer be cancelled." }`.
- **Write:** plain `prisma.order.update({ where: { id }, data: { status: "CANCELLED" } })` — a plain `update`, not a conditional `updateMany`, is correct here because the `findFirst` above already established exclusive ownership and current status; there's no concurrent claimant to race against (the same reasoning `dispatch/route.ts`'s own doc comment gives for using a plain `update`).
- **No `cancelledAt` timestamp** — no such column exists on `Order` and this task does not add one (no schema migration in this feature). Only `status` changes.

### Full route implementation

```ts
import { NextResponse } from "next/server";
import { OrderStatus } from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/logistics-company/orders/[id]/cancel — a logistics company cancels
 * one of its own orders (CLAIMED/ACCEPTED/IN_TRANSIT → CANCELLED). Mirrors
 * `claim`/`dispatch`'s auth/ownership/404-not-403 conventions exactly.
 *
 * No `cancelledAt` column exists on `Order` — this only flips `status`.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (session.user.role !== "COMPANY") {
    return NextResponse.json(
      { error: "Only logistics companies can cancel deliveries." },
      { status: 403 },
    );
  }

  const { id } = await params;

  const company = await prisma.logisticsCompany.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });

  if (!company) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  const order = await prisma.order.findFirst({
    where: { id, companyId: company.id },
    select: { id: true, status: true },
  });

  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  if (order.status === OrderStatus.COMPLETED || order.status === OrderStatus.CANCELLED) {
    return NextResponse.json(
      { error: "This delivery can no longer be cancelled." },
      { status: 409 },
    );
  }

  const updated = await prisma.order.update({
    where: { id },
    data: { status: OrderStatus.CANCELLED },
  });

  return NextResponse.json(updated, { status: 200 });
}
```

## Acceptance Criteria

- [ ] `POST /api/logistics-company/orders/[id]/cancel` exists at the path above.
- [ ] Returns `401` unauthenticated, `403` for non-`COMPANY` roles, `404` for a nonexistent/not-owned order (never `403` for ownership mismatches), `409` if already `COMPLETED`/`CANCELLED`, `200` with the updated order otherwise.
- [ ] `pnpm typecheck` and `pnpm lint` pass.
- [ ] Manually verified: as a `COMPANY` user with a `CLAIMED` or `ACCEPTED` order, calling this route flips it to `CANCELLED`; calling it again returns `409`.
