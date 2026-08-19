import { NextResponse } from "next/server";

import {
  ContentLocale,
  MessagingChannel,
  Prisma,
  type AdminRole,
  type MessagingTemplate,
} from "@prisma/client";

// Type-only, so this route does not pull the sibling module in at runtime — it
// exists purely so both endpoints answer with the identical row shape.
import type { AdminMessagingTemplateRow } from "@/app/api/admin/content/messaging-templates/route";
import { authorizeAdminApi } from "@/lib/admin/api-auth";
import { writeAuditLog } from "@/lib/admin/audit";
import { prisma } from "@/lib/prisma";

/**
 * Editing and removing a single transactional-message template. See the parent
 * route for what these rows are (and for why nothing here sends anything).
 *
 * Stated per route rather than imported from one shared constant so the gate can
 * be read — and audited — without following an import; it deliberately matches
 * the list/create endpoint, since anyone who may author a template may correct
 * one.
 */
const ALLOWED_ROLES: readonly AdminRole[] = ["SUPER_ADMIN", "CONTENT_MANAGER"];

/** Valid values of each enum, derived from the generated Prisma enums. */
const MESSAGING_CHANNELS = Object.values(MessagingChannel);
const CONTENT_LOCALES = Object.values(ContentLocale);

/**
 * Restated from the parent route rather than imported: Next type-checks a route
 * module's exports against the handler names it allows, so a `route.ts` can only
 * export types. Both files must agree — the same limits appear in the form.
 */
const MAX_KEY_LENGTH = 100;
const MAX_SUBJECT_LENGTH = 200;
const MAX_BODY_LENGTH = 5000;

/** Narrows an arbitrary string to a `MessagingChannel`. */
function isMessagingChannel(value: string): value is MessagingChannel {
  return (MESSAGING_CHANNELS as string[]).includes(value);
}

/** Narrows an arbitrary string to a `ContentLocale`. */
function isContentLocale(value: string): value is ContentLocale {
  return (CONTENT_LOCALES as string[]).includes(value);
}

/** The wire form of a template row, matching the list endpoint exactly. */
function serializeTemplate(
  template: MessagingTemplate,
): AdminMessagingTemplateRow {
  return {
    id: template.id,
    key: template.key,
    channel: template.channel,
    locale: template.locale,
    subject: template.subject,
    body: template.body,
    isActive: template.isActive,
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
  };
}

/**
 * True when `error` is the `[key, channel, locale]` unique-constraint violation
 * — i.e. the edit would collide with an existing template. It is the only unique
 * constraint on the table besides the primary key, so any P2002 here is that
 * one.
 */
function isDuplicateTemplateError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

/**
 * Hand-rolled body validation, consistent with the rest of the API (the project
 * deliberately uses no validation library).
 *
 * A patch, not a replace: only the fields actually present are validated and
 * written, so the form can send what it edited and an absent field is "leave it
 * alone". `subject: null` is therefore meaningfully different from an omitted
 * `subject` — it is how switching a template to SMS clears the line, which is
 * why an explicit null is accepted rather than rejected as a missing string.
 *
 * The "an email needs a subject" rule is enforced in the form rather than here,
 * matching the schema's nullable column.
 */
function parseUpdateBody(
  body: unknown,
): { data: Prisma.MessagingTemplateUpdateInput } | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: "Request body must be a JSON object." };
  }

  const record = body as Record<string, unknown>;
  const data: Prisma.MessagingTemplateUpdateInput = {};

  if (record.key !== undefined) {
    const { key } = record;
    if (typeof key !== "string" || key.trim() === "") {
      return { error: "key must be a non-empty string." };
    }
    if (key.trim().length > MAX_KEY_LENGTH) {
      return { error: `key must be ${MAX_KEY_LENGTH} characters or fewer.` };
    }
    data.key = key.trim();
  }

  if (record.channel !== undefined) {
    const { channel } = record;
    if (typeof channel !== "string" || !isMessagingChannel(channel)) {
      return {
        error: `channel must be one of: ${MESSAGING_CHANNELS.join(", ")}.`,
      };
    }
    data.channel = channel;
  }

  if (record.locale !== undefined) {
    const { locale } = record;
    if (typeof locale !== "string" || !isContentLocale(locale)) {
      return { error: `locale must be one of: ${CONTENT_LOCALES.join(", ")}.` };
    }
    data.locale = locale;
  }

  if (record.subject !== undefined) {
    const { subject } = record;
    if (subject !== null && typeof subject !== "string") {
      return { error: "subject must be a string or null." };
    }
    // A blank string is normalized to null so the two ways of saying "no
    // subject" cannot both end up in the table.
    const trimmedSubject =
      typeof subject === "string" && subject.trim() !== ""
        ? subject.trim()
        : null;
    if (trimmedSubject !== null && trimmedSubject.length > MAX_SUBJECT_LENGTH) {
      return {
        error: `subject must be ${MAX_SUBJECT_LENGTH} characters or fewer.`,
      };
    }
    data.subject = trimmedSubject;
  }

  if (record.body !== undefined) {
    const messageBody = record.body;
    if (typeof messageBody !== "string" || messageBody.trim() === "") {
      return { error: "body must be a non-empty string." };
    }
    if (messageBody.length > MAX_BODY_LENGTH) {
      return { error: `body must be ${MAX_BODY_LENGTH} characters or fewer.` };
    }
    data.body = messageBody.trim();
  }

  if (record.isActive !== undefined) {
    const { isActive } = record;
    if (typeof isActive !== "boolean") {
      return { error: "isActive must be a boolean." };
    }
    data.isActive = isActive;
  }

  if (Object.keys(data).length === 0) {
    return { error: "No editable fields were provided." };
  }

  return { data };
}

/**
 * PATCH /api/admin/content/messaging-templates/[id] — edit a template's key,
 * channel, locale, subject, body or active flag.
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

  const parsed = parseUpdateBody(rawBody);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  // Read first so a missing row is a plain 404 rather than a P2025 thrown out of
  // the update, and so the audit entry can record what the row looked like
  // before the edit.
  const existing = await prisma.messagingTemplate.findUnique({
    where: { id },
    select: { id: true, key: true, channel: true, locale: true },
  });

  if (!existing) {
    return NextResponse.json(
      { error: "That messaging template was not found." },
      { status: 404 },
    );
  }

  let updated: MessagingTemplate;
  try {
    updated = await prisma.messagingTemplate.update({
      where: { id },
      data: parsed.data,
    });
  } catch (error) {
    if (isDuplicateTemplateError(error)) {
      return NextResponse.json(
        {
          error:
            "A template with that key already exists for this channel and locale.",
        },
        { status: 409 },
      );
    }

    throw error;
  }

  await writeAuditLog({
    actorId: authorized.context.actorId,
    action: "messaging_template.update",
    entityType: "MessagingTemplate",
    entityId: updated.id,
    // Which fields moved, plus the identity before and after — enough for a
    // later reader to see what changed without copying whole message bodies
    // into every audit row.
    metadata: {
      changedFields: Object.keys(parsed.data),
      before: {
        key: existing.key,
        channel: existing.channel,
        locale: existing.locale,
      },
      after: {
        key: updated.key,
        channel: updated.channel,
        locale: updated.locale,
        isActive: updated.isActive,
      },
    },
  });

  return NextResponse.json({ template: serializeTemplate(updated) });
}

/**
 * DELETE /api/admin/content/messaging-templates/[id] — remove a template.
 *
 * A hard delete: unlike a user account there is no history hanging off the row
 * that deactivating would preserve, and staff who only want to stop a message
 * being used have the `isActive` flag. Any CRM campaign pointing at it has
 * `onDelete: SetNull`, so removing a template loosens those references rather
 * than being blocked by them.
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

  const existing = await prisma.messagingTemplate.findUnique({
    where: { id },
    select: { id: true, key: true, channel: true, locale: true },
  });

  if (!existing) {
    return NextResponse.json(
      { error: "That messaging template was not found." },
      { status: 404 },
    );
  }

  await prisma.messagingTemplate.delete({ where: { id } });

  await writeAuditLog({
    actorId: authorized.context.actorId,
    action: "messaging_template.delete",
    entityType: "MessagingTemplate",
    entityId: existing.id,
    // The row is gone, so its identity is recorded here — it is the only trace
    // left of which template was removed.
    metadata: {
      key: existing.key,
      channel: existing.channel,
      locale: existing.locale,
    },
  });

  return NextResponse.json({ id: existing.id });
}
