import { NextResponse } from "next/server";

import type { AdminRole } from "@prisma/client";

import { authorizeAdminApi } from "@/lib/admin/api-auth";
import { writeAuditLog } from "@/lib/admin/audit";
import { prisma } from "@/lib/prisma";

import {
  DUPLICATE_PAGE_ERROR,
  STATIC_PAGE_SELECT,
  isDuplicateSlugLocaleError,
  parseBodyHtml,
  parseIsPublished,
  parseLocale,
  parseSlug,
  parseTitle,
  serializeStaticPage,
  type AdminStaticPageRow,
} from "./validation";

/**
 * Staff who may read and write the site's static pages. Stated per route rather
 * than imported from one shared constant so the gate on each endpoint can be
 * read — and audited — without following an import.
 */
const ALLOWED_ROLES: readonly AdminRole[] = ["SUPER_ADMIN", "CONTENT_MANAGER"];

/**
 * Re-exported so the admin table keeps the codebase's convention of importing a
 * row type from the route that produces it (type-only, so nothing of this
 * server module reaches the browser). The declaration lives in `./validation`
 * because the `[id]` route has to produce the same shape.
 */
export type { AdminStaticPageRow };

/** Body of `GET /api/admin/content/pages`. */
export type AdminStaticPageListResponse = {
  items: AdminStaticPageRow[];
};

/**
 * GET /api/admin/content/pages — every static page, both locales, published or
 * not.
 *
 * Unpaginated on purpose: this table holds the site's handful of legal and
 * informational pages (Terms, Privacy, About) times two locales, not a growing
 * dataset, so paging would be machinery with nothing to page through. Ordered
 * by slug then locale so a page's two translations sit next to each other.
 */
export async function GET(): Promise<NextResponse> {
  const authorized = await authorizeAdminApi(ALLOWED_ROLES);
  if (!authorized.ok) {
    return authorized.response;
  }

  const pages = await prisma.staticPage.findMany({
    select: STATIC_PAGE_SELECT,
    orderBy: [{ slug: "asc" }, { locale: "asc" }],
  });

  const body: AdminStaticPageListResponse = {
    items: pages.map(serializeStaticPage),
  };

  return NextResponse.json(body, { status: 200 });
}

/**
 * POST /api/admin/content/pages — create one static page for one locale.
 *
 * A page's translations are separate rows (that is what `@@unique([slug,
 * locale])` describes), so creating the Georgian version of an existing page is
 * an ordinary create here, not an edit of the English one.
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

  if (typeof rawBody !== "object" || rawBody === null) {
    return NextResponse.json(
      { error: "Request body must be a JSON object." },
      { status: 400 },
    );
  }

  const record = rawBody as Record<string, unknown>;

  const slug = parseSlug(record.slug);
  if ("error" in slug) {
    return NextResponse.json({ error: slug.error }, { status: 400 });
  }

  const locale = parseLocale(record.locale);
  if ("error" in locale) {
    return NextResponse.json({ error: locale.error }, { status: 400 });
  }

  const title = parseTitle(record.title);
  if ("error" in title) {
    return NextResponse.json({ error: title.error }, { status: 400 });
  }

  const bodyHtml = parseBodyHtml(record.bodyHtml);
  if ("error" in bodyHtml) {
    return NextResponse.json({ error: bodyHtml.error }, { status: 400 });
  }

  // Omitted means unpublished — the schema's own default, restated here so a
  // form that never sends the field still creates a draft rather than failing.
  const isPublished =
    record.isPublished === undefined
      ? { value: false }
      : parseIsPublished(record.isPublished);
  if ("error" in isPublished) {
    return NextResponse.json({ error: isPublished.error }, { status: 400 });
  }

  let created;
  try {
    created = await prisma.staticPage.create({
      data: {
        slug: slug.value,
        locale: locale.value,
        title: title.value,
        bodyHtml: bodyHtml.value,
        isPublished: isPublished.value,
      },
      select: STATIC_PAGE_SELECT,
    });
  } catch (error) {
    // Caught rather than pre-checked with a `findUnique`: the constraint is the
    // only thing that can actually settle a race between two admins, and
    // surfacing it as a 409 keeps a routine collision out of the 500 logs.
    if (isDuplicateSlugLocaleError(error)) {
      return NextResponse.json(
        { error: DUPLICATE_PAGE_ERROR },
        { status: 409 },
      );
    }

    throw error;
  }

  await writeAuditLog({
    actorId: authorized.context.actorId,
    action: "static_page.create",
    entityType: "StaticPage",
    entityId: created.id,
    metadata: {
      slug: created.slug,
      locale: created.locale,
      title: created.title,
      isPublished: created.isPublished,
    },
  });

  return NextResponse.json(serializeStaticPage(created), { status: 201 });
}
