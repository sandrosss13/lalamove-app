import { NextResponse } from "next/server";

import { type AdminRole, PaymentMethodType } from "@prisma/client";

import { authorizeAdminApi } from "@/lib/admin/api-auth";
import { prisma } from "@/lib/prisma";

/**
 * Staff who may read and change the platform's payment methods. Stated per
 * route rather than imported from one shared constant so the gate on each
 * endpoint can be read — and audited — without following an import.
 */
const ALLOWED_ROLES: readonly AdminRole[] = ["SUPER_ADMIN", "FINANCE_MANAGER"];

/**
 * Every method the platform knows about, derived from the generated Prisma
 * enum so a new value in `schema.prisma` shows up here without a second edit.
 * `Object.values` preserves declaration order, which is also the order the
 * admin table renders in.
 */
const PAYMENT_METHOD_TYPES = Object.values(PaymentMethodType);

/**
 * One payment method as the admin table renders it.
 *
 * `config` is deliberately absent: no method needs one yet (the `PATCH`
 * endpoint accepts one for when that changes), and nothing in this UI reads or
 * edits it — so there is no reason to ship it to the browser. The page imports
 * this type (type-only, so nothing of this server module reaches the browser)
 * rather than restating the shape, which is what keeps the two from drifting.
 */
export type AdminPaymentMethodRow = {
  type: PaymentMethodType;
  isEnabled: boolean;
};

/** Body of `GET /api/admin/finance/payment-methods`. */
export type AdminPaymentMethodListResponse = {
  /** Exactly one entry per `PaymentMethodType`, in schema declaration order. */
  items: AdminPaymentMethodRow[];
};

/**
 * GET /api/admin/finance/payment-methods — the on/off state of every payment
 * method, seeding any method that has no row yet.
 *
 * The lazy seed is what lets the page stay a plain list: the response always
 * carries exactly one entry per enum value, so the UI never has to render a
 * "method with no row" case, and a new `PaymentMethodType` needs no separate
 * seed script or migration data to become manageable.
 */
export async function GET(): Promise<NextResponse> {
  const authorized = await authorizeAdminApi(ALLOWED_ROLES);
  if (!authorized.ok) {
    return authorized.response;
  }

  const existing = await prisma.paymentMethodConfig.findMany({
    select: { type: true, isEnabled: true },
  });

  const existingTypes = new Set(existing.map((row) => row.type));
  const missingTypes = PAYMENT_METHOD_TYPES.filter(
    (type) => !existingTypes.has(type),
  );

  // Only the missing rows are written, so a page load costs no write at all
  // once all three exist. `upsert` rather than `create` for the ones that are
  // missing: two admins opening this page at the same moment on a fresh
  // database then race harmlessly into the unique `type` index instead of one
  // of them getting a constraint violation. New methods start disabled —
  // turning one on has to be a deliberate act by staff.
  const seeded = await Promise.all(
    missingTypes.map((type) =>
      prisma.paymentMethodConfig.upsert({
        where: { type },
        create: { type, isEnabled: false },
        // Nothing to change on a row that already exists — this branch is only
        // reachable when a concurrent request inserted it a moment ago.
        update: {},
        select: { type: true, isEnabled: true },
      }),
    ),
  );

  // Sorted by the enum's own order rather than by `type` so the table's order
  // is the schema's order, not alphabetical.
  const items: AdminPaymentMethodRow[] = [...existing, ...seeded].sort(
    (a, b) =>
      PAYMENT_METHOD_TYPES.indexOf(a.type) -
      PAYMENT_METHOD_TYPES.indexOf(b.type),
  );

  const body: AdminPaymentMethodListResponse = { items };

  return NextResponse.json(body, { status: 200 });
}
