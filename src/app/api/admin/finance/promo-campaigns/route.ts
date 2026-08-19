import { NextResponse } from "next/server";

import { DiscountType, Prisma, type AdminRole } from "@prisma/client";

import { authorizeAdminApi } from "@/lib/admin/api-auth";
import { writeAuditLog } from "@/lib/admin/audit";
import { prisma } from "@/lib/prisma";

/**
 * Staff who may read or author discount codes. Stated per route rather than
 * imported from one shared constant so the gate on each endpoint can be read —
 * and audited — without following an import.
 */
const ALLOWED_ROLES: readonly AdminRole[] = ["SUPER_ADMIN", "FINANCE_MANAGER"];

/**
 * What a promo code may look like: uppercase letters and digits, 3–32 of them.
 * Deliberately narrow — a code is typed by hand, so punctuation, spaces and
 * mixed case would only produce failed redemptions and support tickets. The
 * dialog applies the same pattern before submitting; this copy is the one that
 * actually enforces it.
 */
const PROMO_CODE_PATTERN = /^[A-Z0-9]{3,32}$/;

/** A `PERCENTAGE` discount can take at most the whole order, never more. */
const MAX_PERCENTAGE_DISCOUNT = 100;

/** Valid `DiscountType` values, derived from the generated Prisma enum. */
const DISCOUNT_TYPES: readonly DiscountType[] = Object.values(DiscountType);

/**
 * One campaign as the admin table renders it. Dates are ISO strings because
 * this crosses the wire; the page and the form dialog import this type
 * (type-only, so nothing of this server module reaches the browser) rather than
 * restating the shape, which is what keeps the three from drifting.
 */
export type AdminPromoCampaignRow = {
  id: string;
  code: string;
  discountType: DiscountType;
  discountValue: number;
  startsAt: string;
  endsAt: string;
  /** Null means the code may be redeemed any number of times. */
  usageLimit: number | null;
  /**
   * Redemptions so far. Nothing increments this yet — applying a code at
   * checkout is a separate piece of work — but it is already the reason a used
   * campaign cannot be deleted, only deactivated.
   */
  usedCount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

/** Body of `GET /api/admin/finance/promo-campaigns`. */
export type AdminPromoCampaignListResponse = {
  items: AdminPromoCampaignRow[];
};

/** The fields a create request supplies, once validated. */
type CreatePromoCampaignInput = {
  code: string;
  discountType: DiscountType;
  discountValue: number;
  startsAt: Date;
  endsAt: Date;
  usageLimit: number | null;
  isActive: boolean;
};

/** A stored campaign in the shape the wire uses. */
function toRow(campaign: {
  id: string;
  code: string;
  discountType: DiscountType;
  discountValue: number;
  startsAt: Date;
  endsAt: Date;
  usageLimit: number | null;
  usedCount: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): AdminPromoCampaignRow {
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

/**
 * True when `error` is a unique-constraint violation (P2002) on `code` — i.e.
 * the campaign code is already taken. `meta.target` is checked so an unrelated
 * P2002 is not mislabelled; Postgres reports either the column list or the
 * index name ("PromoCampaign_code_key"), so both shapes are handled.
 */
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

/**
 * The discount rule, checked server-side because the dialog's copy of it is
 * only a convenience: a percentage over 100 would hand money back on every
 * order, and a zero or negative discount of either kind is a code that does
 * nothing.
 *
 * Returns the message to reject with, or null when the pair is valid.
 */
function discountValueError(
  discountType: DiscountType,
  discountValue: number,
): string | null {
  if (typeof discountValue !== "number" || !Number.isFinite(discountValue)) {
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

/**
 * An ISO-8601 timestamp from the wire as a `Date`, or null when it is missing
 * or unparseable. `new Date("nonsense")` yields an Invalid Date rather than
 * throwing, so the `NaN` check is what actually rejects junk.
 */
function parseTimestamp(value: unknown): Date | null {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * A usage limit from the wire. Absent, null or an empty string all mean
 * "unlimited"; anything else has to be a whole number of redemptions.
 */
function parseUsageLimit(
  value: unknown,
): { value: number | null } | { error: string } {
  if (value === undefined || value === null || value === "") {
    return { value: null };
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    return {
      error: "usageLimit must be a whole number of 1 or more, or omitted.",
    };
  }

  return { value };
}

/**
 * Hand-rolled body validation, consistent with the rest of the API (the project
 * deliberately uses no validation library).
 *
 * `code` is upper-cased here rather than merely rejected in lower case, so the
 * unique constraint compares like with like no matter which client wrote the
 * row.
 */
function parseCreateBody(
  body: unknown,
): { data: CreatePromoCampaignInput } | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: "Request body must be a JSON object." };
  }

  const record = body as Record<string, unknown>;

  const { code } = record;
  if (typeof code !== "string") {
    return { error: "code is required." };
  }

  const normalizedCode = code.trim().toUpperCase();
  if (!PROMO_CODE_PATTERN.test(normalizedCode)) {
    return {
      error:
        "A code must be 3–32 characters, letters and numbers only (e.g. SUMMER25).",
    };
  }

  const { discountType } = record;
  if (
    typeof discountType !== "string" ||
    !DISCOUNT_TYPES.includes(discountType as DiscountType)
  ) {
    return {
      error: `discountType must be one of: ${DISCOUNT_TYPES.join(", ")}.`,
    };
  }

  const { discountValue } = record;
  if (typeof discountValue !== "number") {
    return { error: "discountValue must be a number." };
  }

  const valueError = discountValueError(
    discountType as DiscountType,
    discountValue,
  );
  if (valueError) {
    return { error: valueError };
  }

  const startsAt = parseTimestamp(record.startsAt);
  if (!startsAt) {
    return { error: "startsAt must be a valid date." };
  }

  const endsAt = parseTimestamp(record.endsAt);
  if (!endsAt) {
    return { error: "endsAt must be a valid date." };
  }

  if (startsAt.getTime() >= endsAt.getTime()) {
    return { error: "The start date must be before the end date." };
  }

  const usageLimit = parseUsageLimit(record.usageLimit);
  if ("error" in usageLimit) {
    return { error: usageLimit.error };
  }

  const { isActive } = record;
  if (isActive !== undefined && typeof isActive !== "boolean") {
    return { error: "isActive must be a boolean." };
  }

  return {
    data: {
      code: normalizedCode,
      discountType: discountType as DiscountType,
      discountValue,
      startsAt,
      endsAt,
      usageLimit: usageLimit.value,
      // A campaign authored without saying otherwise is live; the dialog always
      // sends the toggle's state explicitly.
      isActive: isActive ?? true,
    },
  };
}

/**
 * GET /api/admin/finance/promo-campaigns — every discount code, newest first.
 *
 * Unpaginated on purpose: campaigns are authored by hand a few at a time, so
 * the list is small enough that paging would be more machinery than the page
 * needs. Inactive and expired codes are included — the list is also where a
 * campaign is reactivated or its window extended.
 */
export async function GET(): Promise<NextResponse> {
  const authorized = await authorizeAdminApi(ALLOWED_ROLES);
  if (!authorized.ok) {
    return authorized.response;
  }

  const campaigns = await prisma.promoCampaign.findMany({
    orderBy: { createdAt: "desc" },
  });

  const body: AdminPromoCampaignListResponse = {
    items: campaigns.map(toRow),
  };

  return NextResponse.json(body, { status: 200 });
}

/**
 * POST /api/admin/finance/promo-campaigns — create a discount code.
 *
 * Uniqueness is left to the database's `@@unique` on `code` rather than a
 * read-then-write check: two admins submitting the same code at once would both
 * pass a pre-check, so the constraint is the only thing that actually decides,
 * and the P2002 it raises is translated into a message the author can act on.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const authorized = await authorizeAdminApi(ALLOWED_ROLES);
  if (!authorized.ok) {
    return authorized.response;
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = parseCreateBody(rawBody);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  let created;
  try {
    created = await prisma.promoCampaign.create({ data: parsed.data });
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
    action: "promo_campaign.create",
    entityType: "PromoCampaign",
    entityId: created.id,
    metadata: {
      code: created.code,
      discountType: created.discountType,
      discountValue: created.discountValue,
      startsAt: created.startsAt.toISOString(),
      endsAt: created.endsAt.toISOString(),
      usageLimit: created.usageLimit,
      isActive: created.isActive,
    },
  });

  return NextResponse.json(toRow(created), { status: 201 });
}
