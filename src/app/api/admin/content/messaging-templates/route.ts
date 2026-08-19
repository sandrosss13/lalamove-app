import { NextResponse } from "next/server";

import {
  ContentLocale,
  MessagingChannel,
  Prisma,
  type AdminRole,
  type MessagingTemplate,
} from "@prisma/client";

import { authorizeAdminApi } from "@/lib/admin/api-auth";
import { writeAuditLog } from "@/lib/admin/audit";
import { prisma } from "@/lib/prisma";

/**
 * The editable *content* of the platform's transactional messages — the subject
 * and body an order-confirmed email or a driver-assigned SMS is rendered from,
 * one row per (key, channel, locale).
 *
 * Nothing here sends anything. Wiring a provider up to these rows is a separate,
 * later task; until then this endpoint family is pure CRUD over text, which is
 * why it makes no external calls and knows nothing about `{{variable}}`
 * substitution.
 *
 * Stated per route rather than imported from one shared constant so the gate can
 * be read — and audited — without following an import. Content is the
 * `CONTENT_MANAGER`'s remit; `SUPER_ADMIN` is included as it is everywhere.
 */
const ALLOWED_ROLES: readonly AdminRole[] = ["SUPER_ADMIN", "CONTENT_MANAGER"];

/** Valid values of each enum, derived from the generated Prisma enums. */
const MESSAGING_CHANNELS = Object.values(MessagingChannel);
const CONTENT_LOCALES = Object.values(ContentLocale);

/**
 * Upper bounds on the free-text fields. The schema stores unbounded `text`, so
 * these exist only to keep a mis-scripted client from writing an unreadable row;
 * they are generous enough that no genuine template comes near them. The form
 * mirrors them as `maxLength`.
 *
 * Not exported, here or from the sibling `[id]` route: Next type-checks a route
 * module's exports against the handler names it allows, so a `route.ts` can only
 * export types (which are erased). Anything shared with the UI is therefore
 * restated there, the way the suspend dialog restates its reason limit.
 */
const MAX_KEY_LENGTH = 100;
const MAX_SUBJECT_LENGTH = 200;
const MAX_BODY_LENGTH = 5000;

/**
 * One template as the admin table and edit form use it. Dates are ISO strings
 * because this crosses the wire; the page imports this type (type-only, so
 * nothing of this server module reaches the browser) rather than restating the
 * shape, which is what keeps the two from drifting.
 */
export type AdminMessagingTemplateRow = {
  id: string;
  /** The event/trigger identifier, e.g. `"order.confirmed"`. */
  key: string;
  channel: MessagingChannel;
  locale: ContentLocale;
  /** Null for every SMS row — only an email has a subject line. */
  subject: string | null;
  body: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

/** Body of `GET /api/admin/content/messaging-templates`. */
export type AdminMessagingTemplateListResponse = {
  items: AdminMessagingTemplateRow[];
};

/** Validated shape of a create-template request body. */
type CreateMessagingTemplateInput = {
  key: string;
  channel: MessagingChannel;
  locale: ContentLocale;
  subject: string | null;
  body: string;
  isActive: boolean;
};

/** Narrows an arbitrary string to a `MessagingChannel`. */
function isMessagingChannel(value: string): value is MessagingChannel {
  return (MESSAGING_CHANNELS as string[]).includes(value);
}

/** Narrows an arbitrary string to a `ContentLocale`. */
function isContentLocale(value: string): value is ContentLocale {
  return (CONTENT_LOCALES as string[]).includes(value);
}

/** The wire form of a template row. */
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
 * — i.e. a template for that event, channel and locale already exists. It is the
 * only unique constraint on the table besides the primary key, so any P2002 here
 * is that one.
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
 * `subject` is accepted as optional on purpose: an SMS never has one, and the
 * "an email needs a subject" rule is enforced in the form rather than here,
 * matching the schema's nullable column. A blank string is normalized to null so
 * the two ways of saying "no subject" cannot both end up in the table.
 */
function parseCreateBody(
  body: unknown,
): { data: CreateMessagingTemplateInput } | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: "Request body must be a JSON object." };
  }

  const record = body as Record<string, unknown>;

  const { key } = record;
  if (typeof key !== "string" || key.trim() === "") {
    return { error: "key is required and must be a non-empty string." };
  }
  if (key.trim().length > MAX_KEY_LENGTH) {
    return { error: `key must be ${MAX_KEY_LENGTH} characters or fewer.` };
  }

  const { channel } = record;
  if (typeof channel !== "string" || !isMessagingChannel(channel)) {
    return {
      error: `channel must be one of: ${MESSAGING_CHANNELS.join(", ")}.`,
    };
  }

  const { locale } = record;
  if (typeof locale !== "string" || !isContentLocale(locale)) {
    return { error: `locale must be one of: ${CONTENT_LOCALES.join(", ")}.` };
  }

  const { subject } = record;
  if (
    subject !== undefined &&
    subject !== null &&
    typeof subject !== "string"
  ) {
    return { error: "subject must be a string when provided." };
  }
  const trimmedSubject =
    typeof subject === "string" && subject.trim() !== ""
      ? subject.trim()
      : null;
  if (trimmedSubject !== null && trimmedSubject.length > MAX_SUBJECT_LENGTH) {
    return {
      error: `subject must be ${MAX_SUBJECT_LENGTH} characters or fewer.`,
    };
  }

  const messageBody = record.body;
  if (typeof messageBody !== "string" || messageBody.trim() === "") {
    return { error: "body is required and must be a non-empty string." };
  }
  if (messageBody.length > MAX_BODY_LENGTH) {
    return { error: `body must be ${MAX_BODY_LENGTH} characters or fewer.` };
  }

  const { isActive } = record;
  if (isActive !== undefined && typeof isActive !== "boolean") {
    return { error: "isActive must be a boolean when provided." };
  }

  return {
    data: {
      key: key.trim(),
      channel,
      locale,
      subject: trimmedSubject,
      // Not trimmed to a single line: leading/trailing blank lines are the
      // author's formatting, but the surrounding whitespace of an accidental
      // paste is not, hence `trim()` on the whole value only.
      body: messageBody.trim(),
      isActive: isActive ?? true,
    },
  };
}

/**
 * GET /api/admin/content/messaging-templates?channel= — every template, or just
 * one channel's.
 *
 * Unpaginated: the row count is bounded by the number of lifecycle events times
 * two channels times two locales, so paging would be ceremony over a list that
 * fits on one screen. Ordered by key so an event's variants sit together.
 *
 * An unrecognized `?channel=` is a 400 rather than being ignored — silently
 * returning the unfiltered list would show the caller rows it believes it
 * filtered out.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const authorized = await authorizeAdminApi(ALLOWED_ROLES);
  if (!authorized.ok) {
    return authorized.response;
  }

  const channelParam = new URL(request.url).searchParams.get("channel");

  if (channelParam !== null && !isMessagingChannel(channelParam)) {
    return NextResponse.json(
      { error: `channel must be one of: ${MESSAGING_CHANNELS.join(", ")}.` },
      { status: 400 },
    );
  }

  const templates = await prisma.messagingTemplate.findMany({
    where: channelParam === null ? {} : { channel: channelParam },
    orderBy: [{ key: "asc" }, { channel: "asc" }, { locale: "asc" }],
  });

  const body: AdminMessagingTemplateListResponse = {
    items: templates.map(serializeTemplate),
  };

  return NextResponse.json(body, { status: 200 });
}

/** POST /api/admin/content/messaging-templates — author a new template. */
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

  let created: MessagingTemplate;
  try {
    created = await prisma.messagingTemplate.create({ data: parsed.data });
  } catch (error) {
    // Left to the database rather than pre-checked: a read-then-write would
    // still race, and the unique index is the actual guarantee.
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
    action: "messaging_template.create",
    entityType: "MessagingTemplate",
    entityId: created.id,
    // Identity only. The message text itself lives on the row and would bloat
    // every audit entry for no gain.
    metadata: {
      key: created.key,
      channel: created.channel,
      locale: created.locale,
      isActive: created.isActive,
    },
  });

  return NextResponse.json(
    { template: serializeTemplate(created) },
    { status: 201 },
  );
}
