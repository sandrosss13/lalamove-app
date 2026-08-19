import { NextResponse } from "next/server";

import {
  DiscountType,
  Prisma,
  type AdminRole,
  type PromoCampaign,
} from "@prisma/client";

import { authorizeAdminApi } from "@/lib/admin/api-auth";
import { writeAuditLog } from "@/lib/admin/audit";
import { prisma } from "@/lib/prisma";

/**
 * The rules below restate the ones in the collection route rather than sharing
 * them. That is not an oversight: Next type-checks a `route.ts` against a
 * generated declaration that permits *only* the HTTP-method and segment-config
 * exports, so the sibling module cannot export a validator for this one to
 * import, and a helper module was outside this task's scope. Any change to the
 * discount rules has to be made in both files.
 */

/**
 * Staff who may edit or delete a discount code. Stated per route rather than
 * imported from one shared constant so the gate on each endpoint can be read —
 * and audited — without following an import.
 */
const ALLOWED_ROLES: readonly AdminRole[] = ["SUPER_ADMIN", "FINANCE_MANAGER"];

/** Mirrors `PROMO_CODE_PATTERN` in the collection route. */
const PROMO_CODE_PATTERN = /^[A-Z0-9]{3,32}$/;

/** A `PERCENTAGE` discount can take at most the whole order, never more. */
const MAX_PERCENTAGE_DISCOUNT = 100;

/** Valid `DiscountType` values, derived from the generated Prisma enum. */
const DISCOUNT_TYPES: readonly DiscountType[] = Object.values(DiscountType);

/**
 * The fields a patch may carry, all optional. `usageLimit` is `number | null`
 * because null is a meaningful value here — it lifts the cap — and "absent"
 * has to stay distinguishable from "cleared", which is why the parser checks
 * for the key rather than for `undefined`.
 */
type PromoCampaignPatch = {
  code?: string;
  discountType?: DiscountType;
  discountValue?: number;
  startsAt?: Date;
  endsAt?: Date;
  usageLimit?: number | null;
  isActive?: boolean;
};

/** Same wire shape the collection route returns, rebuilt after an update. */
function toRow(campaign: PromoCampaign) {
  return {
    id: campaign.id,
    code: campaign.code,
    discountType: campaign.discountType,
    discountValue: campaign.discountValue,
    startsAt: campaign.startsAt.toISOString(),
    endsAt: campaign.endsAt.toISOString(),
    usageLimit: campaign.usageLimit,
    usedCount: campaign.usedCount,
    isActive: campaign.isActive,
    createdAt: campaign.createdAt.toISOString(),
    updatedAt: campaign.updatedAt.toISOString(),
  };
}

/** See `isDuplicateCodeError` in the collection route. */
function isDuplicateCodeError(error: unknown): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    return false;
  }

  const target = error.meta?.target;
  if (Array.isArray(target)) {
    return target.includes("code");
  }

  return typeof target === "string" && target.includes("code");
}

/** Mirrors `discountValueError` in the collection route. */
function discountValueError(
  discountType: DiscountType,
  discountValue: number,
): string | null {
  if (!Number.isFinite(discountValue)) {
    return "discountValue must be a number.";
  }

  if (discountType === "PERCENTAGE") {
    return discountValue > 0 && discountValue <= MAX_PERCENTAGE_DISCOUNT
      ? null
      : `A percentage discount must be greater than 0 and at most ${MAX_PERCENTAGE_DISCOUNT}.`;
  }

  return discountValue > 0
    ? null
    : "A fixed-amount discount must be greater than 0.";
}

/** An ISO-8601 timestamp from the wire as a `Date`, or null when unparseable. */
function parseTimestamp(value: unknown): Date | null {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Reads the patch off the request body, checking each field it *does* carry.
 * Cross-field rules (the discount range, the ordering of the window) are not
 * applied here — a patch may change only one half of a pair, so those are
 * checked below against the merged result instead.
 */
function parsePatchBody(
  body: unknown,
): { data: PromoCampaignPatch } | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: "Request body must be a JSON object." };
  }

  const record = body as Record<string, unknown>;
  const patch: PromoCampaignPatch = {};

  if ("code" in record) {
    const { code } = record;
    if (typeof code !== "string") {
      return { error: "code must be a string." };
    }

    const normalizedCode = code.trim().toUpperCase();
    if (!PROMO_CODE_PATTERN.test(normalizedCode)) {
      return {
        error:
          "A code must be 3–32 characters, letters and numbers only (e.g. SUMMER25).",
      };
    }

    patch.code = normalizedCode;
  }

  if ("discountType" in record) {
    const { discountType } = record;
    if (
      typeof discountType !== "string" ||
      !DISCOUNT_TYPES.includes(discountType as DiscountType)
    ) {
      return {
        error: `discountType must be one of: ${DISCOUNT_TYPES.join(", ")}.`,
      };
    }

    patch.discountType = discountType as DiscountType;
  }

  if ("discountValue" in record) {
    const { discountValue } = record;
    if (typeof discountValue !== "number") {
      return { error: "discountValue must be a number." };
    }

    patch.discountValue = discountValue;
  }

  if ("startsAt" in record) {
    const startsAt = parseTimestamp(record.startsAt);
    if (!startsAt) {
      return { error: "startsAt must be a valid date." };
    }

    patch.startsAt = startsAt;
  }

  if ("endsAt" in record) {
    const endsAt = parseTimestamp(record.endsAt);
    if (!endsAt) {
      return { error: "endsAt must be a valid date." };
    }

    patch.endsAt = endsAt;
  }

  if ("usageLimit" in record) {
    const { usageLimit } = record;
    if (usageLimit === null || usageLimit === "") {
      patch.usageLimit = null;
    } else if (
      typeof usageLimit !== "number" ||
      !Number.isInteger(usageLimit) ||
      usageLimit < 1
    ) {
      return {
        error: "usageLimit must be a whole number of 1 or more, or null.",
      };
    } else {
      patch.usageLimit = usageLimit;
    }
  }

  if ("isActive" in record) {
    const { isActive } = record;
    if (typeof isActive !== "boolean") {
      return { error: "isActive must be a boolean." };
    }

    patch.isActive = isActive;
  }

  return { data: patch };
}

/**
 * PATCH /api/admin/finance/promo-campaigns/[id] — edit a discount code, or flip
 * it inactive.
 *
 * Partial by design, because the table's per-row Deactivate control sends
 * nothing but `{ isActive: false }` while the edit dialog sends every field.
 * The cross-field rules are therefore checked against the row as it *will* be,
 * not against the patch alone: switching an existing 150 to `PERCENTAGE`, or
 * moving `endsAt` back before an untouched `startsAt`, both have to be caught
 * even though the patch mentions only one side of the pair.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const authorized = await authorizeAdminApi(ALLOWED_ROLES);
  if (!authorized.ok) {
    return authorized.response;
  }

  const { id } = await params;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = parsePatchBody(rawBody);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const patch = parsed.data;

  // Read before write so a missing campaign is a clean 404 instead of a Prisma
  // "record not found" exception, and so the merged row can be validated.
  const existing = await prisma.promoCampaign.findUnique({ where: { id } });

  if (!existing) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  const nextDiscountType = patch.discountType ?? existing.discountType;
  const nextDiscountValue = patch.discountValue ?? existing.discountValue;
  const nextStartsAt = patch.startsAt ?? existing.startsAt;
  const nextEndsAt = patch.endsAt ?? existing.endsAt;

  const valueError = discountValueError(nextDiscountType, nextDiscountValue);
  if (valueError) {
    return NextResponse.json({ error: valueError }, { status: 400 });
  }

  if (nextStartsAt.getTime() >= nextEndsAt.getTime()) {
    return NextResponse.json(
      { error: "The start date must be before the end date." },
      { status: 400 },
    );
  }

  let updated: PromoCampaign;
  try {
    updated = await prisma.promoCampaign.update({ where: { id }, data: patch });
  } catch (error) {
    if (isDuplicateCodeError(error)) {
      return NextResponse.json(
        { error: "A campaign with this code already exists." },
        { status: 400 },
      );
    }

    throw error;
  }

  await writeAuditLog({
    actorId: authorized.context.actorId,
    action: "promo_campaign.update",
    entityType: "PromoCampaign",
    entityId: updated.id,
    // Both sides of the change, so a later reader can see what a campaign was
    // before someone widened its window or lifted its cap.
    metadata: {
      code: updated.code,
      changed: Object.keys(patch),
      before: {
        code: existing.code,
        discountType: existing.discountType,
        discountValue: existing.discountValue,
        startsAt: existing.startsAt.toISOString(),
        endsAt: existing.endsAt.toISOString(),
        usageLimit: existing.usageLimit,
        isActive: existing.isActive,
      },
      after: {
        code: updated.code,
        discountType: updated.discountType,
        discountValue: updated.discountValue,
        startsAt: updated.startsAt.toISOString(),
        endsAt: updated.endsAt.toISOString(),
        usageLimit: updated.usageLimit,
        isActive: updated.isActive,
      },
    },
  });

  return NextResponse.json(toRow(updated), { status: 200 });
}

/**
 * DELETE /api/admin/finance/promo-campaigns/[id] — remove a discount code that
 * was never redeemed.
 *
 * A campaign with `usedCount > 0` is refused. Deleting it would erase the terms
 * that orders were discounted under, leaving those redemptions unexplainable;
 * deactivating instead takes the code out of circulation and keeps the record.
 * Nothing increments `usedCount` yet — redemption at checkout is separate work
 * — so today this only ever fires on a hand-seeded row, but the rule belongs
 * with the delete rather than with whatever writes the counter later.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const authorized = await authorizeAdminApi(ALLOWED_ROLES);
  if (!authorized.ok) {
    return authorized.response;
  }

  const { id } = await params;

  const existing = await prisma.promoCampaign.findUnique({ where: { id } });

  if (!existing) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  if (existing.usedCount > 0) {
    return NextResponse.json(
      {
        error:
          "This campaign has already been redeemed and cannot be deleted. Deactivate it instead.",
      },
      { status: 400 },
    );
  }

  await prisma.promoCampaign.delete({ where: { id } });

  await writeAuditLog({
    actorId: authorized.context.actorId,
    action: "promo_campaign.delete",
    entityType: "PromoCampaign",
    entityId: existing.id,
    // The whole row, since it no longer exists anywhere else.
    metadata: {
      code: existing.code,
      discountType: existing.discountType,
      discountValue: existing.discountValue,
      startsAt: existing.startsAt.toISOString(),
      endsAt: existing.endsAt.toISOString(),
      usageLimit: existing.usageLimit,
      isActive: existing.isActive,
    },
  });

  return NextResponse.json({ id: existing.id }, { status: 200 });
}
