import { NextResponse } from "next/server";

import type { AdminRole, ContentLocale, Prisma } from "@prisma/client";

import { authorizeAdminApi } from "@/lib/admin/api-auth";
import { writeAuditLog } from "@/lib/admin/audit";
import { prisma } from "@/lib/prisma";

/**
 * Staff who may read and write site copy. Stated per route rather than imported
 * from one shared constant so the gate on each endpoint can be read — and
 * audited — without following an import; the sibling `[id]` route repeats the
 * same list for the same reason.
 */
const ALLOWED_ROLES: readonly AdminRole[] = ["SUPER_ADMIN", "CONTENT_MANAGER"];

/**
 * Caps on the stored identity fields. A namespace groups a screen's worth of
 * copy (`"landing"`, `"checkout"`) and a key names one string within it, so
 * both are short by nature — the limits exist to keep a malformed client from
 * writing unbounded data into columns the UI renders in a table cell.
 */
const MAX_NAMESPACE_LENGTH = 100;
const MAX_KEY_LENGTH = 200;

/**
 * Cap on a translated string. Generous enough for a paragraph of marketing
 * copy, bounded so the column stays a UI string rather than a document store.
 * Mirrored in the `[id]` route, which enforces the same limit on edits.
 */
const MAX_VALUE_LENGTH = 5000;

/** One locale's row for a key, as the admin table renders it. */
export type AdminTranslationLocaleEntry = {
  /** `TranslationEntry.id` — what the `[id]` PATCH/DELETE routes take. */
  id: string;
  value: string;
  updatedAt: string;
};

/**
 * A translation key with both locales on one row.
 *
 * The table shows Georgian and English side by side, so the grouping happens
 * here rather than in the browser: the page renders what it is given instead of
 * re-deriving the same pivot from a flat list. Either locale can be `null` — a
 * key whose other locale row was deleted still has to be visible, otherwise it
 * would be unreachable from the UI that would let staff restore it.
 */
export type AdminTranslationRow = {
  namespace: string;
  key: string;
  ka: AdminTranslationLocaleEntry | null;
  en: AdminTranslationLocaleEntry | null;
};

/** Body of `GET /api/admin/content/translations`. */
export type AdminTranslationListResponse = {
  items: AdminTranslationRow[];
  /**
   * Every namespace in the table, deliberately *not* narrowed by the current
   * `?namespace=` filter — it populates the filter control itself, which would
   * otherwise collapse to the one option already chosen.
   */
  namespaces: string[];
};

/** Body of `POST /api/admin/content/translations`. */
export type AdminTranslationCreateResponse = {
  item: AdminTranslationRow;
};

/** Validated shape of a create/upsert request body. */
type CreateTranslationInput = {
  namespace: string;
  key: string;
  valueKa: string;
  valueEn: string;
};

/**
 * Composite map key for grouping the two locales of one translation key.
 *
 * `JSON.stringify` of the pair rather than a joined string: a namespace may
 * legitimately contain the separator characters an ad-hoc join would pick
 * (`"a.b" + "." + "c"` and `"a" + "." + "b.c"` collide), whereas the quoted,
 * escaped array form is unambiguous for any input.
 */
function groupKeyFor(namespace: string, key: string): string {
  return JSON.stringify([namespace, key]);
}

/**
 * Hand-rolled body validation, consistent with the rest of the API (the project
 * deliberately uses no validation library).
 *
 * Both locales are required. A key exists to be rendered on a bilingual site,
 * so creating one half-filled would ship a blank string to whichever audience
 * got the missing locale; staff who genuinely have only one translation to hand
 * can put a placeholder in the other and edit it later.
 */
function parseCreateTranslationBody(
  body: unknown,
): { data: CreateTranslationInput } | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: "Request body must be a JSON object." };
  }

  const record = body as Record<string, unknown>;

  const { namespace } = record;
  if (typeof namespace !== "string" || namespace.trim() === "") {
    return { error: "namespace is required and must be a non-empty string." };
  }

  const trimmedNamespace = namespace.trim();
  if (trimmedNamespace.length > MAX_NAMESPACE_LENGTH) {
    return {
      error: `namespace must be ${MAX_NAMESPACE_LENGTH} characters or fewer.`,
    };
  }

  const { key } = record;
  if (typeof key !== "string" || key.trim() === "") {
    return { error: "key is required and must be a non-empty string." };
  }

  const trimmedKey = key.trim();
  if (trimmedKey.length > MAX_KEY_LENGTH) {
    return { error: `key must be ${MAX_KEY_LENGTH} characters or fewer.` };
  }

  const { valueKa } = record;
  if (typeof valueKa !== "string" || valueKa.trim() === "") {
    return { error: "valueKa is required and must be a non-empty string." };
  }

  const { valueEn } = record;
  if (typeof valueEn !== "string" || valueEn.trim() === "") {
    return { error: "valueEn is required and must be a non-empty string." };
  }

  const trimmedValueKa = valueKa.trim();
  const trimmedValueEn = valueEn.trim();

  if (
    trimmedValueKa.length > MAX_VALUE_LENGTH ||
    trimmedValueEn.length > MAX_VALUE_LENGTH
  ) {
    return {
      error: `A translation value must be ${MAX_VALUE_LENGTH} characters or fewer.`,
    };
  }

  return {
    data: {
      namespace: trimmedNamespace,
      key: trimmedKey,
      valueKa: trimmedValueKa,
      valueEn: trimmedValueEn,
    },
  };
}

/** The per-locale fields every response in this route family exposes. */
const ENTRY_SELECT = {
  id: true,
  namespace: true,
  key: true,
  locale: true,
  value: true,
  updatedAt: true,
} satisfies Prisma.TranslationEntrySelect;

type SelectedEntry = Prisma.TranslationEntryGetPayload<{
  select: typeof ENTRY_SELECT;
}>;

/** Narrows a stored row to the per-locale slice the table renders. */
function toLocaleEntry(entry: SelectedEntry): AdminTranslationLocaleEntry {
  return {
    id: entry.id,
    value: entry.value,
    updatedAt: entry.updatedAt.toISOString(),
  };
}

/**
 * Pivots the flat `TranslationEntry` rows into one row per `(namespace, key)`
 * with a slot per locale. Input order is preserved, so the caller's `orderBy`
 * decides how the table reads.
 */
function groupByKey(entries: SelectedEntry[]): AdminTranslationRow[] {
  const rowsByGroupKey = new Map<string, AdminTranslationRow>();

  for (const entry of entries) {
    const groupKey = groupKeyFor(entry.namespace, entry.key);

    let row = rowsByGroupKey.get(groupKey);
    if (!row) {
      row = { namespace: entry.namespace, key: entry.key, ka: null, en: null };
      rowsByGroupKey.set(groupKey, row);
    }

    if (entry.locale === "KA") {
      row.ka = toLocaleEntry(entry);
    } else {
      row.en = toLocaleEntry(entry);
    }
  }

  return [...rowsByGroupKey.values()];
}

/**
 * GET /api/admin/content/translations?namespace= — every translation key, or
 * just one namespace's, with both locales per row.
 *
 * Unpaginated on purpose: this table holds the site's own copy, written by
 * staff one key at a time, and the namespace filter is the tool for narrowing
 * it. Paging a list whose whole value is being scannable side by side would
 * cost more than it saves at this size.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const authorized = await authorizeAdminApi(ALLOWED_ROLES);
  if (!authorized.ok) {
    return authorized.response;
  }

  const url = new URL(request.url);
  const namespace = (url.searchParams.get("namespace") ?? "").trim();

  const [entries, namespaceRows] = await Promise.all([
    prisma.translationEntry.findMany({
      // An exact match, not `contains`: the filter is fed by the picker below,
      // which only ever offers namespaces that exist.
      where: namespace === "" ? {} : { namespace },
      select: ENTRY_SELECT,
      // Groups the two locales of a key adjacently, which is what lets
      // `groupByKey` keep its single pass and the table read alphabetically.
      orderBy: [{ namespace: "asc" }, { key: "asc" }, { locale: "asc" }],
    }),
    prisma.translationEntry.findMany({
      distinct: ["namespace"],
      select: { namespace: true },
      orderBy: { namespace: "asc" },
    }),
  ]);

  const body: AdminTranslationListResponse = {
    items: groupByKey(entries),
    namespaces: namespaceRows.map((row) => row.namespace),
  };

  return NextResponse.json(body, { status: 200 });
}

/**
 * POST /api/admin/content/translations — create (or overwrite) both locale rows
 * of one translation key in a single action.
 *
 * Two upserts keyed on `@@unique([namespace, key, locale])` inside one
 * transaction, so a key is never left existing in Georgian but not English
 * because the second write failed. Upsert rather than create because the same
 * submit is what fills a locale back in after its row was deleted — retrying a
 * create there would 409 on the surviving locale and leave staff stuck.
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

  const parsed = parseCreateTranslationBody(rawBody);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { namespace, key, valueKa, valueEn } = parsed.data;

  /** Builds one locale's upsert; both share the composite key but the value. */
  const upsertFor = (locale: ContentLocale, value: string) =>
    prisma.translationEntry.upsert({
      where: { namespace_key_locale: { namespace, key, locale } },
      create: { namespace, key, locale, value },
      update: { value },
      select: ENTRY_SELECT,
    });

  // Written as a tuple literal rather than a mapped array so the destructuring
  // below stays typed as two definite rows.
  const [kaEntry, enEntry] = await prisma.$transaction([
    upsertFor("KA", valueKa),
    upsertFor("EN", valueEn),
  ]);

  // One audit row per locale row, not one per submit: `entityId` is what ties a
  // log line to the record it changed, and a single line could only name one of
  // the two ids — leaving the other row's history silently empty.
  for (const entry of [kaEntry, enEntry]) {
    await writeAuditLog({
      actorId: authorized.context.actorId,
      action: "translation.create",
      entityType: "TranslationEntry",
      entityId: entry.id,
      metadata: {
        namespace: entry.namespace,
        key: entry.key,
        locale: entry.locale,
        value: entry.value,
      },
    });
  }

  const body: AdminTranslationCreateResponse = {
    item: {
      namespace,
      key,
      ka: toLocaleEntry(kaEntry),
      en: toLocaleEntry(enEntry),
    },
  };

  return NextResponse.json(body, { status: 201 });
}
