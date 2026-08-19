import { NextResponse } from "next/server";

import type { AdminRole, Prisma } from "@prisma/client";

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
} from "../validation";

/**
 * Staff who may edit or remove a static page — the same gate the collection
 * route applies. Stated per route rather than imported from one shared constant
 * so each endpoint's authorization can be read without following an import.
 */
const ALLOWED_ROLES: readonly AdminRole[] = ["SUPER_ADMIN", "CONTENT_MANAGER"];

/**
 * PATCH /api/admin/content/pages/[id] — edit any subset of a page's fields.
 *
 * Partial by design: an absent field is left as it is rather than reset to a
 * default, so a caller that only wants to flip `isPublished` can send that one
 * key without having to round-trip — and risk clobbering — the page body.
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

  if (typeof rawBody !== "object" || rawBody === null) {
    return NextResponse.json(
      { error: "Request body must be a JSON object." },
      { status: 400 },
    );
  }

  const record = rawBody as Record<string, unknown>;
  const data: Prisma.StaticPageUpdateInput = {};

  if (record.slug !== undefined) {
    const slug = parseSlug(record.slug);
    if ("error" in slug) {
      return NextResponse.json({ error: slug.error }, { status: 400 });
    }
    data.slug = slug.value;
  }

  if (record.locale !== undefined) {
    const locale = parseLocale(record.locale);
    if ("error" in locale) {
      return NextResponse.json({ error: locale.error }, { status: 400 });
    }
    data.locale = locale.value;
  }

  if (record.title !== undefined) {
    const title = parseTitle(record.title);
    if ("error" in title) {
      return NextResponse.json({ error: title.error }, { status: 400 });
    }
    data.title = title.value;
  }

  if (record.bodyHtml !== undefined) {
    const bodyHtml = parseBodyHtml(record.bodyHtml);
    if ("error" in bodyHtml) {
      return NextResponse.json({ error: bodyHtml.error }, { status: 400 });
    }
    data.bodyHtml = bodyHtml.value;
  }

  if (record.isPublished !== undefined) {
    const isPublished = parseIsPublished(record.isPublished);
    if ("error" in isPublished) {
      return NextResponse.json({ error: isPublished.error }, { status: 400 });
    }
    data.isPublished = isPublished.value;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: "No editable fields were provided." },
      { status: 400 },
    );
  }

  // Read before write so a stale row id is a clean 404 instead of a Prisma
  // "record not found" exception, and so the audit trail can record what the
  // page looked like beforehand.
  const existing = await prisma.staticPage.findUnique({
    where: { id },
    select: STATIC_PAGE_SELECT,
  });

  if (!existing) {
    return NextResponse.json({ error: "Page not found." }, { status: 404 });
  }

  let updated;
  try {
    updated = await prisma.staticPage.update({
      where: { id },
      data,
      select: STATIC_PAGE_SELECT,
    });
  } catch (error) {
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
    action: "static_page.update",
    entityType: "StaticPage",
    entityId: updated.id,
    // Both sides recorded, since an edit to a legal page is exactly the kind of
    // change someone later needs to reconstruct. The body is left out: it is
    // unbounded, and the audit log is a trail, not a revision history.
    metadata: {
      before: {
        slug: existing.slug,
        locale: existing.locale,
        title: existing.title,
        isPublished: existing.isPublished,
      },
      after: {
        slug: updated.slug,
        locale: updated.locale,
        title: updated.title,
        isPublished: updated.isPublished,
      },
      bodyChanged: existing.bodyHtml !== updated.bodyHtml,
    },
  });

  return NextResponse.json(serializeStaticPage(updated), { status: 200 });
}

/**
 * DELETE /api/admin/content/pages/[id] — remove one page in one locale.
 *
 * A hard delete: `StaticPage` carries no soft-delete column and nothing
 * references it, so the row is the whole record. The audit entry below is what
 * survives, which is why it captures the page's identity rather than just its
 * id.
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

  const existing = await prisma.staticPage.findUnique({
    where: { id },
    select: STATIC_PAGE_SELECT,
  });

  if (!existing) {
    return NextResponse.json({ error: "Page not found." }, { status: 404 });
  }

  await prisma.staticPage.delete({ where: { id } });

  await writeAuditLog({
    actorId: authorized.context.actorId,
    action: "static_page.delete",
    entityType: "StaticPage",
    entityId: id,
    metadata: {
      slug: existing.slug,
      locale: existing.locale,
      title: existing.title,
      isPublished: existing.isPublished,
    },
  });

  return NextResponse.json({ id }, { status: 200 });
}
