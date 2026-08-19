import { NextResponse } from "next/server";

import {
  ContentLocale,
  type AdminRole,
  type HomePageSection,
  type Prisma,
} from "@prisma/client";

import { authorizeAdminApi } from "@/lib/admin/api-auth";
import { writeAuditLog } from "@/lib/admin/audit";
import {
  parseHomePageSection,
  type HomePageSectionType,
} from "@/lib/admin/home-page-content";
import { prisma } from "@/lib/prisma";

/**
 * Staff who may compose the public landing page. Stated per route rather than
 * imported from one shared constant so the gate on each endpoint can be read —
 * and audited — without following an import.
 */
const ALLOWED_ROLES: readonly AdminRole[] = ["SUPER_ADMIN", "CONTENT_MANAGER"];

/** Valid `ContentLocale` values, derived from the generated Prisma enum. */
const CONTENT_LOCALES = Object.values(ContentLocale);

/**
 * Bounds on `sortOrder`. A landing page is a handful of sections, and a bound
 * keeps a typo out of the column. Same range the banners routes use.
 */
const MIN_SORT_ORDER = 0;
const MAX_SORT_ORDER = 9999;

/**
 * One section as the admin table renders it.
 *
 * `type` is the raw column value rather than the `HomePageSectionType` union:
 * the column is a free-form `String`, and a row holding something this build
 * does not know how to render still has to be listable — otherwise it would be
 * invisible in the admin UI and therefore impossible to delete.
 *
 * `content` is likewise the raw `Json`. The page hands it straight to
 * `parseHomePageSection` from `@/lib/admin/home-page-content`, which is the one
 * place that decides what a valid `content` is for a given `type`.
 */
export type AdminHomePageSectionRow = {
  id: string;
  type: string;
  locale: ContentLocale;
  sortOrder: number;
  isActive: boolean;
  content: unknown;
  createdAt: string;
  updatedAt: string;
};

/** Body of `GET /api/admin/content/home-page-sections`. */
export type AdminHomePageSectionListResponse = {
  items: AdminHomePageSectionRow[];
};

/** Body of `POST /api/admin/content/home-page-sections` and of its `PATCH`. */
export type AdminHomePageSectionResponse = {
  section: AdminHomePageSectionRow;
};

/** The validated fields a create request carries. */
type CreateHomePageSectionInput = {
  type: HomePageSectionType;
  locale: ContentLocale;
  sortOrder: number;
  isActive: boolean;
  content: Prisma.InputJsonValue;
};

/**
 * Serializes a row for the wire. Shared shape with the `[id]` route, which
 * restates it rather than importing from here: a `route.ts` is a Next.js entry
 * point, and exporting runtime values out of one for another module to consume
 * makes the two routes' build-time contracts depend on each other.
 */
function toSectionRow(section: HomePageSection): AdminHomePageSectionRow {
  return {
    id: section.id,
    type: section.type,
    locale: section.locale,
    sortOrder: section.sortOrder,
    isActive: section.isActive,
    content: section.content,
    createdAt: section.createdAt.toISOString(),
    updatedAt: section.updatedAt.toISOString(),
  };
}

/**
 * Hand-rolled body validation, consistent with the rest of the API (the project
 * deliberately uses no validation library).
 *
 * `type` and `content` are checked together by `parseHomePageSection`, because
 * neither means anything alone: the type is what says which fields the content
 * must carry. The normalized (trimmed) content it returns is what gets stored,
 * so the `Json` column never accumulates whitespace variants of the same copy.
 */
function parseCreateBody(
  body: unknown,
): { data: CreateHomePageSectionInput } | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: "Request body must be a JSON object." };
  }

  const record = body as Record<string, unknown>;

  const { type } = record;
  if (typeof type !== "string") {
    return { error: "type is required and must be a string." };
  }

  const section = parseHomePageSection(type, record.content);
  if ("error" in section) {
    return { error: section.error };
  }

  const { locale } = record;
  if (
    typeof locale !== "string" ||
    !CONTENT_LOCALES.includes(locale as ContentLocale)
  ) {
    return { error: `locale must be one of: ${CONTENT_LOCALES.join(", ")}.` };
  }

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

  const { isActive } = record;
  if (typeof isActive !== "boolean") {
    return { error: "isActive must be a boolean." };
  }

  return {
    data: {
      type: section.data.type,
      locale: locale as ContentLocale,
      sortOrder,
      isActive,
      content: section.data.content,
    },
  };
}

/**
 * GET /api/admin/content/home-page-sections — the composed landing page, in the
 * order the public site would render it: `sortOrder` first, then oldest.
 *
 * `?locale=` narrows to one locale; without it every locale comes back. The
 * admin page always sends it, since it edits one locale tab at a time.
 *
 * Unpaginated on purpose, and inactive rows are included: a landing page is a
 * handful of hand-authored rows, and the table's whole job is showing the
 * running order — which paging would cut in half, and which hiding switched-off
 * sections would misrepresent.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const authorized = await authorizeAdminApi(ALLOWED_ROLES);
  if (!authorized.ok) {
    return authorized.response;
  }

  const rawLocale = new URL(request.url).searchParams.get("locale");

  if (
    rawLocale !== null &&
    !CONTENT_LOCALES.includes(rawLocale as ContentLocale)
  ) {
    return NextResponse.json(
      { error: `locale must be one of: ${CONTENT_LOCALES.join(", ")}.` },
      { status: 400 },
    );
  }

  const sections = await prisma.homePageSection.findMany({
    where: rawLocale === null ? {} : { locale: rawLocale as ContentLocale },
    // `createdAt` breaks ties so two sections sharing a `sortOrder` keep a
    // stable order here and on the public page alike.
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  const body: AdminHomePageSectionListResponse = {
    items: sections.map(toSectionRow),
  };

  return NextResponse.json(body, { status: 200 });
}

/** POST /api/admin/content/home-page-sections — add one section to a locale. */
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

  const section = await prisma.homePageSection.create({ data: parsed.data });

  await writeAuditLog({
    actorId: authorized.context.actorId,
    action: "home_page_section.create",
    entityType: "HomePageSection",
    entityId: section.id,
    metadata: {
      type: section.type,
      locale: section.locale,
      sortOrder: section.sortOrder,
      isActive: section.isActive,
    },
  });

  const body: AdminHomePageSectionResponse = { section: toSectionRow(section) };

  return NextResponse.json(body, { status: 201 });
}
