import { NextResponse } from "next/server";

import type { AdminRole } from "@prisma/client";

import { authorizeAdminApi } from "@/lib/admin/api-auth";
import { writeAuditLog } from "@/lib/admin/audit";
import { prisma } from "@/lib/prisma";

/**
 * Staff who may read and write site copy. Restated here rather than imported
 * from the collection route so the gate on this endpoint can be read — and
 * audited — without following an import, matching how the rest of the admin API
 * states its roles.
 */
const ALLOWED_ROLES: readonly AdminRole[] = ["SUPER_ADMIN", "CONTENT_MANAGER"];

/** Mirrors the collection route's cap, which applies the same limit on create. */
const MAX_VALUE_LENGTH = 5000;

/** Body of `PATCH /api/admin/content/translations/[id]`. */
export type AdminTranslationUpdateResponse = {
  id: string;
  value: string;
  updatedAt: string;
};

/**
 * PATCH /api/admin/content/translations/[id] — change one locale row's value.
 *
 * Deliberately narrow: only `value` is editable. `namespace`, `key` and
 * `locale` are the row's identity (and its unique constraint), so letting a
 * PATCH move a row between them would be a rename with no way to tell it apart
 * from a collision with an existing key — staff create a new key instead.
 *
 * This is what makes each locale independently editable: correcting the
 * Georgian string touches only the `KA` row, leaving the English one and its
 * `updatedAt` untouched.
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

  const { value } = rawBody as Record<string, unknown>;

  if (typeof value !== "string" || value.trim() === "") {
    return NextResponse.json(
      { error: "value is required and must be a non-empty string." },
      { status: 400 },
    );
  }

  const trimmedValue = value.trim();

  if (trimmedValue.length > MAX_VALUE_LENGTH) {
    return NextResponse.json(
      {
        error: `A translation value must be ${MAX_VALUE_LENGTH} characters or fewer.`,
      },
      { status: 400 },
    );
  }

  // Read before write so a stale id from an already-deleted row is a clean 404
  // instead of a Prisma "record not found" exception, and so the audit entry can
  // record what the string used to say.
  const existing = await prisma.translationEntry.findUnique({
    where: { id },
    select: { id: true, namespace: true, key: true, locale: true, value: true },
  });

  if (!existing) {
    return NextResponse.json(
      { error: "Translation entry not found." },
      { status: 404 },
    );
  }

  const updated = await prisma.translationEntry.update({
    where: { id },
    data: { value: trimmedValue },
    select: { id: true, value: true, updatedAt: true },
  });

  await writeAuditLog({
    actorId: authorized.context.actorId,
    action: "translation.update",
    entityType: "TranslationEntry",
    entityId: updated.id,
    // Both sides recorded: for editable copy, "what did this used to say" is
    // the question the trail exists to answer.
    metadata: {
      namespace: existing.namespace,
      key: existing.key,
      locale: existing.locale,
      previousValue: existing.value,
      value: updated.value,
    },
  });

  const body: AdminTranslationUpdateResponse = {
    id: updated.id,
    value: updated.value,
    updatedAt: updated.updatedAt.toISOString(),
  };

  return NextResponse.json(body, { status: 200 });
}

/**
 * DELETE /api/admin/content/translations/[id] — remove one locale row.
 *
 * Scoped to a single row rather than the whole key, because the two locales are
 * separate records and staff may legitimately want to drop just one. The
 * surviving locale keeps the key visible in the admin table, so the deleted
 * side can be filled back in through the same create form (its upsert restores
 * the missing row without disturbing the other).
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

  // Read before delete for the same reasons as the PATCH above: a clean 404 for
  // an id that is already gone, and the row's content for the audit entry —
  // which is the only place it survives after this call.
  const existing = await prisma.translationEntry.findUnique({
    where: { id },
    select: { id: true, namespace: true, key: true, locale: true, value: true },
  });

  if (!existing) {
    return NextResponse.json(
      { error: "Translation entry not found." },
      { status: 404 },
    );
  }

  await prisma.translationEntry.delete({ where: { id } });

  await writeAuditLog({
    actorId: authorized.context.actorId,
    action: "translation.delete",
    entityType: "TranslationEntry",
    entityId: existing.id,
    metadata: {
      namespace: existing.namespace,
      key: existing.key,
      locale: existing.locale,
      value: existing.value,
    },
  });

  return NextResponse.json({ id: existing.id }, { status: 200 });
}
