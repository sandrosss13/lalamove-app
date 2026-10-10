import { NextResponse } from "next/server";

import { ContentLocale, type AdminRole, type Banner } from "@prisma/client";

import { getRequestTranslations } from "@/i18n/request-locale";
import { authorizeAdminApi } from "@/lib/admin/api-auth";
import { writeAuditLog } from "@/lib/admin/audit";
import { revalidateHomePage } from "@/lib/admin/home-page-data";
import { prisma } from "@/lib/prisma";

import {
  BANNER_COPY_FIELDS,
  checkBannerPlacementCapacity,
  parseBannerCopyField,
} from "./validation";

/**
 * Staff who may read and write promotional banners. Stated per route rather
 * than imported from one shared constant so the gate on each endpoint can be
 * read — and audited — without following an import.
 */
const ALLOWED_ROLES: readonly AdminRole[] = ["SUPER_ADMIN", "CONTENT_MANAGER"];

/** Valid `ContentLocale` values, derived from the generated Prisma enum. */
const CONTENT_LOCALES = Object.values(ContentLocale);

/** Long enough for a headline, short enough that the column stays a title. */
const MAX_TITLE_LENGTH = 200;

/**
 * `placement` is a free-form key the admin and the public components agree on
 * by convention (see the `Banner` model doc), so it is only length-capped, not
 * restricted to a list — adding a placement must stay a content change.
 */
const MAX_PLACEMENT_LENGTH = 100;

/** Comfortably past the longest URL any browser will actually follow. */
const MAX_URL_LENGTH = 2048;

/**
 * Bounds on `sortOrder`. Ordering only ever needs to separate a handful of
 * banners per placement, and a bound keeps a typo out of the column.
 */
const MIN_SORT_ORDER = 0;
const MAX_SORT_ORDER = 9999;

/**
 * One banner as the admin table renders it. Dates are ISO strings because this
 * crosses the wire; the page imports this type (type-only, so nothing of this
 * server module reaches the browser) rather than restating the shape, which is
 * what keeps the two from drifting.
 */
export type AdminBannerRow = {
  id: string;
  title: string;
  locale: ContentLocale;
  imageUrl: string;
  linkUrl: string | null;
  placement: string;
  sortOrder: number;
  isActive: boolean;
  /** Start of the display window, or null for "as soon as it is active". */
  startsAt: string | null;
  /** End of the display window, or null for "until it is switched off". */
  endsAt: string | null;
  /**
   * Optional card copy, rendered by the v4 offers row (`home_secondary`): a
   * kicker above the title, a body sentence, and the label of the button that
   * follows `linkUrl`. `null` when unset; other placements ignore all three.
   */
  eyebrow: string | null;
  body: string | null;
  ctaLabel: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Body of `GET /api/admin/content/banners`. */
export type AdminBannerListResponse = {
  items: AdminBannerRow[];
};

/** Body of `POST /api/admin/content/banners` and of the `PATCH` beside it. */
export type AdminBannerResponse = {
  banner: AdminBannerRow;
};

/** The validated fields a create request carries. */
type CreateBannerInput = {
  title: string;
  locale: ContentLocale;
  imageUrl: string;
  linkUrl: string | null;
  placement: string;
  sortOrder: number;
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  eyebrow: string | null;
  body: string | null;
  ctaLabel: string | null;
};

/**
 * Serializes a row for the wire. Shared shape with the `[id]` route, which
 * restates it rather than importing from here: a `route.ts` is a Next.js entry
 * point, and exporting runtime values out of one for another module to consume
 * makes the two routes' build-time contracts depend on each other.
 */
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
    eyebrow: banner.eyebrow,
    body: banner.body,
    ctaLabel: banner.ctaLabel,
    createdAt: banner.createdAt.toISOString(),
    updatedAt: banner.updatedAt.toISOString(),
  };
}

/**
 * Whether a string is something a browser can actually load as an image or
 * follow as a link.
 *
 * Root-relative paths are allowed so a banner can point at an asset or a page
 * inside this app. Everything else must be an absolute `http(s)` URL, which
 * rules out `javascript:` and `data:` — this value ends up in an `src`/`href`
 * on the public site, so a scheme check is the cheap half of not letting a
 * content editor inject script into it.
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

/**
 * A nullable timestamp field → a `Date`. Accepts anything `Date` can parse
 * (the admin UI sends ISO strings) and rejects the rest, so an unparseable
 * value is a 400 rather than an `Invalid Date` silently reaching the column.
 */
function parseTimestamp(
  raw: unknown,
  field: string,
  t: (key: string, values?: Record<string, string | number>) => string,
): { value: Date | null } | { error: string } {
  if (raw === null || raw === undefined) {
    return { value: null };
  }

  if (typeof raw !== "string") {
    return { error: t("common.shared.fieldMustBeIsoDateOrNull", { field }) };
  }

  const parsed = new Date(raw);

  if (Number.isNaN(parsed.getTime())) {
    return { error: t("common.shared.fieldMustBeValidIsoDate", { field }) };
  }

  return { value: parsed };
}

/**
 * Hand-rolled body validation, consistent with the rest of the API (the project
 * deliberately uses no validation library).
 *
 * Every field is required here: a create has no existing row to fall back on,
 * and the admin form always sends the complete set. The `PATCH` beside this
 * one applies the same rules per field, but treats an absent key as "leave it".
 */
function parseCreateBannerBody(
  body: unknown,
  t: (key: string, values?: Record<string, string | number>) => string,
): { data: CreateBannerInput } | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: t("common.shared.requestBodyMustBeAJson") };
  }

  const record = body as Record<string, unknown>;

  const { title } = record;
  if (typeof title !== "string" || title.trim() === "") {
    return { error: t("common.shared.titleIsRequiredAndMustBe") };
  }
  if (title.trim().length > MAX_TITLE_LENGTH) {
    return {
      error: t("common.shared.fieldMaxLength", {
        field: "title",
        max: MAX_TITLE_LENGTH,
      }),
    };
  }

  const { locale } = record;
  if (
    typeof locale !== "string" ||
    !CONTENT_LOCALES.includes(locale as ContentLocale)
  ) {
    return {
      error: t("common.shared.fieldMustBeOneOf", {
        field: "locale",
        options: CONTENT_LOCALES.join(", "),
      }),
    };
  }

  const { imageUrl } = record;
  if (typeof imageUrl !== "string" || imageUrl.trim() === "") {
    return {
      error: t("errors.adminContentBanners.imageurlIsRequiredAndMustBe"),
    };
  }
  if (imageUrl.trim().length > MAX_URL_LENGTH) {
    return {
      error: t("common.shared.fieldMaxLength", {
        field: "imageUrl",
        max: MAX_URL_LENGTH,
      }),
    };
  }
  if (!isUsableUrl(imageUrl.trim())) {
    return {
      error: t("common.shared.imageurlMustBeAnHttpS"),
    };
  }

  const { linkUrl } = record;
  let normalizedLinkUrl: string | null = null;
  if (linkUrl !== null && linkUrl !== undefined) {
    if (typeof linkUrl !== "string") {
      return { error: t("common.shared.linkurlMustBeStringOrNull") };
    }

    const trimmedLinkUrl = linkUrl.trim();
    // An empty box in the form means "no link", not an empty string in the
    // column — a banner with no destination is a legitimate configuration.
    if (trimmedLinkUrl !== "") {
      if (trimmedLinkUrl.length > MAX_URL_LENGTH) {
        return {
          error: t("common.shared.fieldMaxLength", {
            field: "linkUrl",
            max: MAX_URL_LENGTH,
          }),
        };
      }
      if (!isUsableUrl(trimmedLinkUrl)) {
        return {
          error: t("common.shared.linkurlMustBeAnHttpS"),
        };
      }

      normalizedLinkUrl = trimmedLinkUrl;
    }
  }

  const { placement } = record;
  if (typeof placement !== "string" || placement.trim() === "") {
    return {
      error: t("errors.adminContentBanners.placementIsRequiredAndMustBe"),
    };
  }
  if (placement.trim().length > MAX_PLACEMENT_LENGTH) {
    return {
      error: t("common.shared.fieldMaxLength", {
        field: "placement",
        max: MAX_PLACEMENT_LENGTH,
      }),
    };
  }

  const { sortOrder } = record;
  if (
    typeof sortOrder !== "number" ||
    !Number.isInteger(sortOrder) ||
    sortOrder < MIN_SORT_ORDER ||
    sortOrder > MAX_SORT_ORDER
  ) {
    return {
      error: t("common.shared.sortOrderMustBeIntegerBetween", {
        min: MIN_SORT_ORDER,
        max: MAX_SORT_ORDER,
      }),
    };
  }

  const { isActive } = record;
  if (typeof isActive !== "boolean") {
    return { error: t("common.shared.isactiveMustBeABoolean") };
  }

  const startsAt = parseTimestamp(record.startsAt, "startsAt", t);
  if ("error" in startsAt) {
    return { error: startsAt.error };
  }

  const endsAt = parseTimestamp(record.endsAt, "endsAt", t);
  if ("error" in endsAt) {
    return { error: endsAt.error };
  }

  // A window that ends before it starts can never show the banner, so it is
  // far more likely a mistyped date than an intention.
  if (
    startsAt.value !== null &&
    endsAt.value !== null &&
    endsAt.value.getTime() <= startsAt.value.getTime()
  ) {
    return { error: t("common.shared.endsatMustBeAfterStartsat") };
  }

  // Optional, so absent is the same as null: a hero or partner-logo banner has
  // no use for card copy and the form may simply not send it.
  const copy: Record<(typeof BANNER_COPY_FIELDS)[number], string | null> = {
    eyebrow: null,
    body: null,
    ctaLabel: null,
  };
  for (const field of BANNER_COPY_FIELDS) {
    const parsedCopy = parseBannerCopyField(record[field], field, t);
    if ("error" in parsedCopy) {
      return { error: parsedCopy.error };
    }
    copy[field] = parsedCopy.value;
  }

  return {
    data: {
      title: title.trim(),
      locale: locale as ContentLocale,
      imageUrl: imageUrl.trim(),
      linkUrl: normalizedLinkUrl,
      placement: placement.trim(),
      sortOrder,
      isActive,
      startsAt: startsAt.value,
      endsAt: endsAt.value,
      ...copy,
    },
  };
}

/**
 * GET /api/admin/content/banners — every banner, in the order the public site
 * would render them: `sortOrder` first, then newest.
 *
 * Unpaginated on purpose. Banners are a handful of hand-authored rows per
 * placement, and the admin table's whole job is showing the running order,
 * which paging would cut in half.
 */
export async function GET(): Promise<NextResponse> {
  const authorized = await authorizeAdminApi(ALLOWED_ROLES);
  if (!authorized.ok) {
    return authorized.response;
  }

  const banners = await prisma.banner.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });

  const body: AdminBannerListResponse = {
    items: banners.map(toBannerRow),
  };

  return NextResponse.json(body, { status: 200 });
}

/** POST /api/admin/content/banners — create one banner. */
export async function POST(request: Request): Promise<NextResponse> {
  const authorized = await authorizeAdminApi(ALLOWED_ROLES);
  if (!authorized.ok) {
    return authorized.response;
  }

  const t = await getRequestTranslations();

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: t("common.shared.requestBodyMustBeValidJson") },
      { status: 400 },
    );
  }

  const parsed = parseCreateBannerBody(rawBody, t);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  // A 409 rather than a 400: the body is well-formed and every field is valid,
  // the conflict is with the other rows already in this locale's placement.
  const overCapacity = await checkBannerPlacementCapacity(
    {
      locale: parsed.data.locale,
      placement: parsed.data.placement,
      isActive: parsed.data.isActive,
    },
    t,
  );

  if (overCapacity !== null) {
    return NextResponse.json({ error: overCapacity }, { status: 409 });
  }

  const banner = await prisma.banner.create({ data: parsed.data });

  await writeAuditLog({
    actorId: authorized.context.actorId,
    action: "banner.create",
    entityType: "Banner",
    entityId: banner.id,
    metadata: {
      title: banner.title,
      locale: banner.locale,
      placement: banner.placement,
      isActive: banner.isActive,
    },
  });

  revalidateHomePage();

  const body: AdminBannerResponse = { banner: toBannerRow(banner) };

  return NextResponse.json(body, { status: 201 });
}
