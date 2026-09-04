import { NextResponse } from "next/server";

import {
  ContentLocale,
  type AdminRole,
  type Banner,
  type Prisma,
} from "@prisma/client";

import { authorizeAdminApi } from "@/lib/admin/api-auth";
import { writeAuditLog } from "@/lib/admin/audit";
import { prisma } from "@/lib/prisma";

import { checkHeroBannerCapacity } from "../validation";

/**
 * Staff who may read and write promotional banners. Stated per route rather
 * than imported from one shared constant so the gate on each endpoint can be
 * read — and audited — without following an import.
 */
const ALLOWED_ROLES: readonly AdminRole[] = ["SUPER_ADMIN", "CONTENT_MANAGER"];

/** Valid `ContentLocale` values, derived from the generated Prisma enum. */
const CONTENT_LOCALES = Object.values(ContentLocale);

/** The same bounds the create route enforces; see its constants for why. */
const MAX_TITLE_LENGTH = 200;
const MAX_PLACEMENT_LENGTH = 100;
const MAX_URL_LENGTH = 2048;
const MIN_SORT_ORDER = 0;
const MAX_SORT_ORDER = 9999;

/**
 * The wire shape of a banner, restated from the collection route rather than
 * imported: a `route.ts` is a Next.js entry point, and importing runtime values
 * across two of them would tie their build-time contracts together. Only the
 * *type* is shared, and it is re-declared here as the response body's type.
 */
type AdminBannerRow = {
  id: string;
  title: string;
  locale: ContentLocale;
  imageUrl: string;
  linkUrl: string | null;
  placement: string;
  sortOrder: number;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function toBannerRow(banner: Banner): AdminBannerRow {
  return {
    id: banner.id,
    title: banner.title,
    locale: banner.locale,
    imageUrl: banner.imageUrl,
    linkUrl: banner.linkUrl,
    placement: banner.placement,
    sortOrder: banner.sortOrder,
    isActive: banner.isActive,
    startsAt: banner.startsAt?.toISOString() ?? null,
    endsAt: banner.endsAt?.toISOString() ?? null,
    createdAt: banner.createdAt.toISOString(),
    updatedAt: banner.updatedAt.toISOString(),
  };
}

/**
 * Whether a string is something a browser can actually load as an image or
 * follow as a link — root-relative paths, or absolute `http(s)` URLs. Keeps
 * `javascript:`/`data:` out of an `src`/`href` on the public site.
 */
function isUsableUrl(value: string): boolean {
  // A leading `//` is protocol-relative, i.e. off-site despite looking local.
  if (value.startsWith("/")) {
    return !value.startsWith("//");
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }

  return parsed.protocol === "http:" || parsed.protocol === "https:";
}

/** A nullable timestamp field → a `Date`, or the message explaining why not. */
function parseTimestamp(
  raw: unknown,
  field: string,
): { value: Date | null } | { error: string } {
  if (raw === null) {
    return { value: null };
  }

  if (typeof raw !== "string") {
    return { error: `${field} must be an ISO date string or null.` };
  }

  const parsed = new Date(raw);

  if (Number.isNaN(parsed.getTime())) {
    return { error: `${field} must be a valid ISO date string.` };
  }

  return { value: parsed };
}

/**
 * A validated patch: the update Prisma should apply, plus the state the row
 * will hold once it has been applied.
 *
 * `next` is carried alongside `data` rather than read back off it because
 * `Prisma.BannerUpdateInput` types every field as "a value *or* an update
 * operation" (`boolean | BoolFieldUpdateOperationsInput`), so `data.isActive`
 * is not a `boolean` to the compiler even when this module only ever assigns
 * one. Resolving the three fields from plain locals while they are being
 * validated — exactly as `nextStartsAt`/`nextEndsAt` already are — keeps the
 * hero-capacity check below honest without a cast.
 */
type ParsedBannerUpdate = {
  data: Prisma.BannerUpdateInput;
  /** Locale, placement and visibility as they will be *after* this patch. */
  next: {
    locale: ContentLocale;
    placement: string;
    isActive: boolean;
  };
};

/**
 * Hand-rolled body validation, consistent with the rest of the API (the project
 * deliberately uses no validation library).
 *
 * Genuinely partial: an absent key leaves the stored value alone, which is what
 * lets the table's active toggle send `{ isActive }` on its own while the edit
 * dialog sends the whole form. Every key that *is* present is validated by the
 * same rules the create route applies.
 *
 * `existing` is read to resolve the fields the patch does not carry: the window
 * check below, where the two dates constrain each other, and the `next` trio
 * the hero-carousel cap is evaluated against.
 */
function parseUpdateBannerBody(
  body: unknown,
  existing: Banner,
): ParsedBannerUpdate | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: "Request body must be a JSON object." };
  }

  const record = body as Record<string, unknown>;
  const data: Prisma.BannerUpdateInput = {};

  if ("title" in record) {
    const { title } = record;
    if (typeof title !== "string" || title.trim() === "") {
      return { error: "title must be a non-empty string." };
    }
    if (title.trim().length > MAX_TITLE_LENGTH) {
      return {
        error: `title must be ${MAX_TITLE_LENGTH} characters or fewer.`,
      };
    }

    data.title = title.trim();
  }

  let nextLocale = existing.locale;
  if ("locale" in record) {
    const { locale } = record;
    if (
      typeof locale !== "string" ||
      !CONTENT_LOCALES.includes(locale as ContentLocale)
    ) {
      return { error: `locale must be one of: ${CONTENT_LOCALES.join(", ")}.` };
    }

    data.locale = locale as ContentLocale;
    nextLocale = locale as ContentLocale;
  }

  if ("imageUrl" in record) {
    const { imageUrl } = record;
    if (typeof imageUrl !== "string" || imageUrl.trim() === "") {
      return { error: "imageUrl must be a non-empty string." };
    }
    if (imageUrl.trim().length > MAX_URL_LENGTH) {
      return {
        error: `imageUrl must be ${MAX_URL_LENGTH} characters or fewer.`,
      };
    }
    if (!isUsableUrl(imageUrl.trim())) {
      return {
        error: "imageUrl must be an http(s) URL or a path starting with /.",
      };
    }

    data.imageUrl = imageUrl.trim();
  }

  if ("linkUrl" in record) {
    const { linkUrl } = record;
    if (linkUrl === null) {
      data.linkUrl = null;
    } else if (typeof linkUrl !== "string") {
      return { error: "linkUrl must be a string or null." };
    } else {
      const trimmedLinkUrl = linkUrl.trim();

      // An empty box in the form means "no link", not an empty string in the
      // column — a banner with no destination is a legitimate configuration.
      if (trimmedLinkUrl === "") {
        data.linkUrl = null;
      } else {
        if (trimmedLinkUrl.length > MAX_URL_LENGTH) {
          return {
            error: `linkUrl must be ${MAX_URL_LENGTH} characters or fewer.`,
          };
        }
        if (!isUsableUrl(trimmedLinkUrl)) {
          return {
            error: "linkUrl must be an http(s) URL or a path starting with /.",
          };
        }

        data.linkUrl = trimmedLinkUrl;
      }
    }
  }

  let nextPlacement = existing.placement;
  if ("placement" in record) {
    const { placement } = record;
    if (typeof placement !== "string" || placement.trim() === "") {
      return { error: "placement must be a non-empty string." };
    }
    if (placement.trim().length > MAX_PLACEMENT_LENGTH) {
      return {
        error: `placement must be ${MAX_PLACEMENT_LENGTH} characters or fewer.`,
      };
    }

    data.placement = placement.trim();
    nextPlacement = placement.trim();
  }

  if ("sortOrder" in record) {
    const { sortOrder } = record;
    if (
      typeof sortOrder !== "number" ||
      !Number.isInteger(sortOrder) ||
      sortOrder < MIN_SORT_ORDER ||
      sortOrder > MAX_SORT_ORDER
    ) {
      return {
        error: `sortOrder must be an integer between ${MIN_SORT_ORDER} and ${MAX_SORT_ORDER}.`,
      };
    }

    data.sortOrder = sortOrder;
  }

  let nextIsActive = existing.isActive;
  if ("isActive" in record) {
    const { isActive } = record;
    if (typeof isActive !== "boolean") {
      return { error: "isActive must be a boolean." };
    }

    data.isActive = isActive;
    nextIsActive = isActive;
  }

  // Both dates are resolved before either is checked, because the window rule
  // below needs the values the row will *end up* with, not the ones it has.
  let nextStartsAt = existing.startsAt;
  if ("startsAt" in record) {
    const startsAt = parseTimestamp(record.startsAt, "startsAt");
    if ("error" in startsAt) {
      return { error: startsAt.error };
    }

    data.startsAt = startsAt.value;
    nextStartsAt = startsAt.value;
  }

  let nextEndsAt = existing.endsAt;
  if ("endsAt" in record) {
    const endsAt = parseTimestamp(record.endsAt, "endsAt");
    if ("error" in endsAt) {
      return { error: endsAt.error };
    }

    data.endsAt = endsAt.value;
    nextEndsAt = endsAt.value;
  }

  // A window that ends before it starts can never show the banner, so it is
  // far more likely a mistyped date than an intention.
  if (
    nextStartsAt !== null &&
    nextEndsAt !== null &&
    nextEndsAt.getTime() <= nextStartsAt.getTime()
  ) {
    return { error: "endsAt must be after startsAt." };
  }

  return {
    data,
    next: {
      locale: nextLocale,
      placement: nextPlacement,
      isActive: nextIsActive,
    },
  };
}

/**
 * PATCH /api/admin/content/banners/[id] — edit a banner, in whole or in part.
 *
 * Partial by design: the edit dialog sends every field, while the table's
 * active toggle sends only `isActive`, and both are the same request here.
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

  // Read before write so a banner deleted in another tab is a clean 404 rather
  // than a Prisma "record not found" exception, and so the window check below
  // can see the dates this patch does not carry.
  const existing = await prisma.banner.findUnique({ where: { id } });

  if (!existing) {
    return NextResponse.json({ error: "Banner not found." }, { status: 404 });
  }

  const parsed = parseUpdateBannerBody(rawBody, existing);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  // Evaluated against the state the row will end up with, not the one it has:
  // the table's active toggle patches `isActive` on its own, and that is how a
  // seventh hero banner would otherwise get switched on. `ignoreId` keeps this
  // banner from counting itself, so editing one of a full six still saves.
  const overCapacity = await checkHeroBannerCapacity({
    locale: parsed.next.locale,
    placement: parsed.next.placement,
    isActive: parsed.next.isActive,
    ignoreId: id,
  });

  if (overCapacity !== null) {
    return NextResponse.json({ error: overCapacity }, { status: 409 });
  }

  const banner = await prisma.banner.update({
    where: { id },
    data: parsed.data,
  });

  await writeAuditLog({
    actorId: authorized.context.actorId,
    action: "banner.update",
    entityType: "Banner",
    entityId: banner.id,
    // The changed keys plus the values they landed on, so the trail says what
    // this specific edit did rather than restating the whole row every time.
    metadata: {
      changed: Object.keys(parsed.data),
      title: banner.title,
      locale: banner.locale,
      placement: banner.placement,
      isActive: banner.isActive,
    },
  });

  return NextResponse.json({ banner: toBannerRow(banner) }, { status: 200 });
}

/**
 * DELETE /api/admin/content/banners/[id] — remove a banner outright.
 *
 * A hard delete: the model carries no soft-delete flag, and `isActive` already
 * covers "take it down but keep it". What the banner *was* survives in the
 * audit-log metadata below.
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

  const existing = await prisma.banner.findUnique({ where: { id } });

  if (!existing) {
    return NextResponse.json({ error: "Banner not found." }, { status: 404 });
  }

  await prisma.banner.delete({ where: { id } });

  await writeAuditLog({
    actorId: authorized.context.actorId,
    action: "banner.delete",
    entityType: "Banner",
    entityId: id,
    // Recorded in full: after the row is gone this is the only record of what
    // was taken down.
    metadata: {
      title: existing.title,
      locale: existing.locale,
      placement: existing.placement,
      imageUrl: existing.imageUrl,
      sortOrder: existing.sortOrder,
    },
  });

  return NextResponse.json({ id }, { status: 200 });
}
