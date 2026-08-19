import { NextResponse } from "next/server";

import {
  ContentLocale,
  type AdminRole,
  type HomePageSection,
  type Prisma,
} from "@prisma/client";

import { authorizeAdminApi } from "@/lib/admin/api-auth";
import { writeAuditLog } from "@/lib/admin/audit";
import { parseHomePageSection } from "@/lib/admin/home-page-content";
import { prisma } from "@/lib/prisma";

/**
 * Staff who may compose the public landing page. Stated per route rather than
 * imported from one shared constant so the gate on each endpoint can be read —
 * and audited — without following an import.
 */
const ALLOWED_ROLES: readonly AdminRole[] = ["SUPER_ADMIN", "CONTENT_MANAGER"];

/** Valid `ContentLocale` values, derived from the generated Prisma enum. */
const CONTENT_LOCALES = Object.values(ContentLocale);

/** The same bounds the create route enforces; see its constants for why. */
const MIN_SORT_ORDER = 0;
const MAX_SORT_ORDER = 9999;

/**
 * The wire shape of a section, restated from the collection route rather than
 * imported: a `route.ts` is a Next.js entry point, and importing runtime values
 * across two of them would tie their build-time contracts together. Only the
 * *type* is shared, and it is re-declared here as the response body's type.
 */
type AdminHomePageSectionRow = {
  id: string;
  type: string;
  locale: ContentLocale;
  sortOrder: number;
  isActive: boolean;
  content: unknown;
  createdAt: string;
  updatedAt: string;
};

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
 * Genuinely partial: an absent key leaves the stored value alone, which is what
 * lets the table's active toggle send `{ isActive }` and its reorder buttons
 * send `{ sortOrder }`, while the edit dialog sends the whole form.
 *
 * `type` and `content` are resolved together against `existing`, because they
 * constrain each other and either one may be absent from the patch. Retyping a
 * section without also sending content that fits the new type is rejected
 * rather than stored — a `faq` row holding hero copy would be dropped by the
 * public renderer, which is a silently blank section on the marketing page.
 */
function parseUpdateBody(
  body: unknown,
  existing: HomePageSection,
): { data: Prisma.HomePageSectionUpdateInput } | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: "Request body must be a JSON object." };
  }

  const record = body as Record<string, unknown>;
  const data: Prisma.HomePageSectionUpdateInput = {};

  if ("type" in record || "content" in record) {
    const nextType = "type" in record ? record.type : existing.type;
    if (typeof nextType !== "string") {
      return { error: "type must be a string." };
    }

    const nextContent = "content" in record ? record.content : existing.content;

    const section = parseHomePageSection(nextType, nextContent);
    if ("error" in section) {
      return { error: section.error };
    }

    data.type = section.data.type;
    // Always rewritten, even when only `type` was sent: the parser returns the
    // normalized (trimmed) content, and storing that keeps the column free of
    // whitespace variants of the same copy.
    data.content = section.data.content;
  }

  if ("locale" in record) {
    const { locale } = record;
    if (
      typeof locale !== "string" ||
      !CONTENT_LOCALES.includes(locale as ContentLocale)
    ) {
      return { error: `locale must be one of: ${CONTENT_LOCALES.join(", ")}.` };
    }

    data.locale = locale as ContentLocale;
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

  if ("isActive" in record) {
    const { isActive } = record;
    if (typeof isActive !== "boolean") {
      return { error: "isActive must be a boolean." };
    }

    data.isActive = isActive;
  }

  return { data };
}

/**
 * PATCH /api/admin/content/home-page-sections/[id] — edit a section, in whole
 * or in part.
 *
 * Reordering is the same endpoint: the up/down buttons renumber the affected
 * rows by sending `{ sortOrder }` alone. That case gets its own audit action,
 * since "the page was rearranged" and "this section's copy was rewritten" are
 * different events to anyone reading the trail later.
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

  // Read before write so a section deleted in another tab is a clean 404 rather
  // than a Prisma "record not found" exception, and so the type/content check
  // above can see the values this patch does not carry.
  const existing = await prisma.homePageSection.findUnique({ where: { id } });

  if (!existing) {
    return NextResponse.json(
      { error: "Home page section not found." },
      { status: 404 },
    );
  }

  const parsed = parseUpdateBody(rawBody, existing);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const changed = Object.keys(parsed.data);

  const section = await prisma.homePageSection.update({
    where: { id },
    data: parsed.data,
  });

  // A patch that moves the section and changes nothing else is a reorder; the
  // dialog's full-form save touches more keys and is an update.
  const isReorder = changed.length === 1 && changed[0] === "sortOrder";

  await writeAuditLog({
    actorId: authorized.context.actorId,
    action: isReorder
      ? "home_page_section.reorder"
      : "home_page_section.update",
    entityType: "HomePageSection",
    entityId: section.id,
    // The changed keys plus where the row landed, so the trail says what this
    // specific edit did rather than restating the whole row every time.
    metadata: {
      changed,
      type: section.type,
      locale: section.locale,
      sortOrder: section.sortOrder,
      isActive: section.isActive,
      ...(isReorder ? { previousSortOrder: existing.sortOrder } : {}),
    },
  });

  return NextResponse.json({ section: toSectionRow(section) }, { status: 200 });
}

/**
 * DELETE /api/admin/content/home-page-sections/[id] — remove a section.
 *
 * A hard delete: the model carries no soft-delete flag, and `isActive` already
 * covers "take it off the page but keep it". The section's content survives in
 * the audit-log metadata below, which is the only record of it afterwards.
 *
 * Deleting every section for a locale is allowed, and is not a way to break the
 * public page: with no rows, it renders its built-in default composition.
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

  const existing = await prisma.homePageSection.findUnique({ where: { id } });

  if (!existing) {
    return NextResponse.json(
      { error: "Home page section not found." },
      { status: 404 },
    );
  }

  await prisma.homePageSection.delete({ where: { id } });

  await writeAuditLog({
    actorId: authorized.context.actorId,
    action: "home_page_section.delete",
    entityType: "HomePageSection",
    entityId: id,
    // Recorded in full, content included: after the row is gone this is the
    // only place the copy that was on the page still exists.
    metadata: {
      type: existing.type,
      locale: existing.locale,
      sortOrder: existing.sortOrder,
      isActive: existing.isActive,
      content: existing.content ?? undefined,
    },
  });

  return NextResponse.json({ id }, { status: 200 });
}
