import { NextResponse } from "next/server";

import { type AdminRole, PaymentMethodType, type Prisma } from "@prisma/client";

import type { AdminPaymentMethodRow } from "@/app/api/admin/finance/payment-methods/route";
import { authorizeAdminApi } from "@/lib/admin/api-auth";
import { writeAuditLog } from "@/lib/admin/audit";
import { prisma } from "@/lib/prisma";

/**
 * Staff who may switch a payment method on or off. Stated per route rather than
 * imported from one shared constant so the gate on each endpoint can be read —
 * and audited — without following an import.
 */
const ALLOWED_ROLES: readonly AdminRole[] = ["SUPER_ADMIN", "FINANCE_MANAGER"];

/** Valid `[type]` path segments, derived from the generated Prisma enum. */
const PAYMENT_METHOD_TYPES = Object.values(PaymentMethodType);

/** Validated shape of an update-payment-method request body. */
type UpdatePaymentMethodInput = {
  isEnabled: boolean;
  /**
   * Absent when the request carried none, in which case the stored column is
   * left exactly as it is. No method needs a config yet; the field is accepted
   * so the one that eventually does (see the pending gateway decision) needs no
   * change to this endpoint's contract.
   */
  config?: Prisma.InputJsonObject;
};

/**
 * Hand-rolled body validation, consistent with the rest of the API (the project
 * deliberately uses no validation library).
 *
 * `config` must be a JSON *object* — an array or a bare scalar is a caller
 * mistake, not a configuration. Secrets never belong in it (see the model's
 * schema doc); this endpoint stores whatever it is given, so that stays a
 * convention the caller keeps, not something validation can check.
 */
function parseUpdateBody(
  body: unknown,
): { data: UpdatePaymentMethodInput } | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: "Request body must be a JSON object." };
  }

  const record = body as Record<string, unknown>;

  const { isEnabled } = record;
  if (typeof isEnabled !== "boolean") {
    return { error: "isEnabled is required and must be a boolean." };
  }

  const { config } = record;
  if (config === undefined) {
    return { data: { isEnabled } };
  }

  if (typeof config !== "object" || config === null || Array.isArray(config)) {
    return { error: "config must be a JSON object." };
  }

  // Safe by construction: `config` came out of `request.json()`, so everything
  // inside it is already a JSON value.
  return { data: { isEnabled, config: config as Prisma.InputJsonObject } };
}

/**
 * PATCH /api/admin/finance/payment-methods/[type] — turn one payment method on
 * or off platform-wide.
 *
 * Flipping the flag is all this does. It processes no payment and talks to no
 * gateway: `CARD` in particular is a switch over an integration that does not
 * exist yet (the provider decision is still pending), so enabling it records
 * intent rather than accepting cards.
 *
 * `upsert` rather than `update` so a `PATCH` that arrives before this method's
 * row has been seeded — a direct API call, or a click racing the very first
 * `GET` on a fresh database — still lands instead of failing on a missing row.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ type: string }> },
): Promise<NextResponse> {
  const authorized = await authorizeAdminApi(ALLOWED_ROLES);
  if (!authorized.ok) {
    return authorized.response;
  }

  const { type: rawType } = await params;

  // The segment names a resource, so an unknown one is a 404 rather than a
  // validation error: there is no such payment method to address.
  if (!PAYMENT_METHOD_TYPES.includes(rawType as PaymentMethodType)) {
    return NextResponse.json(
      { error: "Unknown payment method." },
      { status: 404 },
    );
  }

  const type = rawType as PaymentMethodType;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = parseUpdateBody(rawBody);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { isEnabled, config } = parsed.data;

  // One object for both halves of the upsert, so a created row and an updated
  // row can never end up carrying different values.
  const data = config === undefined ? { isEnabled } : { isEnabled, config };

  const updated = await prisma.paymentMethodConfig.upsert({
    where: { type },
    create: { type, ...data },
    update: data,
    select: { type: true, isEnabled: true },
  });

  await writeAuditLog({
    actorId: authorized.context.actorId,
    action: updated.isEnabled
      ? "payment_method.enable"
      : "payment_method.disable",
    entityType: "PaymentMethodConfig",
    // The method itself, not the row's cuid: `type` is the stable identity
    // staff and a later reader of the log reason about ("CASH"), while the id
    // is an implementation detail that a re-seed could change.
    entityId: updated.type,
    // Only recorded when the request actually carried one — the action verb
    // above already says what happened to the flag.
    metadata: config === undefined ? undefined : { config },
  });

  const body: AdminPaymentMethodRow = {
    type: updated.type,
    isEnabled: updated.isEnabled,
  };

  return NextResponse.json(body, { status: 200 });
}
