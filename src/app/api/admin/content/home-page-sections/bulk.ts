// Reads and writes `HomePageSection` through Prisma; never part of a browser
// bundle.
import "server-only";

import { ContentLocale, Prisma, type HomePageSection } from "@prisma/client";

import { loadMessages } from "@/i18n/messages";
import type { AppLocale } from "@/i18n/routing";
import {
  DEFAULT_HOME_PAGE_SECTION_ORDER,
  HOME_PAGE_CHROME_SECTION_TYPES,
  createMessageLookup,
  localizeDefaultHomePageContent,
  parseHomePageSection,
  type HomePageSectionType,
} from "@/lib/admin/home-page-content";
import { prisma } from "@/lib/prisma";

/**
 * What the four whole-locale section endpoints share — `reorder`,
 * `materialize`, `copy-locale` and `restore-defaults`. A plain sibling module
 * rather than an export from a `route.ts`, for the same reason
 * `../banners/validation.ts` exists: a route module is a Next.js entry point
 * and must not export runtime values for another route to import.
 *
 * The single-row routes (`route.ts`, `[id]/route.ts`) predate this module and
 * keep their own restated `toSectionRow`; the wire shape is identical.
 */

export type Translate = (
  key: string,
  values?: Record<string, string | number>,
) => string;

/** Valid `ContentLocale` values, derived from the generated Prisma enum. */
const CONTENT_LOCALES = Object.values(ContentLocale);

/**
 * Where chrome rows (`nav`, `footer`) sort. The renderer places chrome by type,
 * so this only keeps them at the bottom of the admin list, out of the way of
 * the body sections whose order matters. Same value the seed script uses.
 */
export const CHROME_SORT_ORDER_BASE = 100;

/**
 * The reverse of `toContentLocale` (`@/i18n/routing`), needed to read the
 * catalog a locale's default copy is translated through. An exhaustive
 * `Record`, so adding a `ContentLocale` fails the build here.
 */
const APP_LOCALE_BY_CONTENT_LOCALE: Record<ContentLocale, AppLocale> = {
  KA: "ka",
  EN: "en",
};

/** One section as the admin table renders it — same shape as the list route. */
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

/**
 * Body of every whole-locale endpoint: the target locale's full section list
 * after the operation, in render order — so the admin can replace its cache
 * with it instead of refetching.
 */
export type AdminHomePageSectionBulkResponse = {
  sections: AdminHomePageSectionRow[];
};

export function toSectionRow(
  section: HomePageSection,
): AdminHomePageSectionRow {
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

/** A body field that must name a `ContentLocale` (`"KA"` or `"EN"`). */
export function parseContentLocaleField(
  raw: unknown,
  field: string,
  t: Translate,
): { value: ContentLocale } | { error: string } {
  if (
    typeof raw !== "string" ||
    !CONTENT_LOCALES.includes(raw as ContentLocale)
  ) {
    return {
      error: t("common.shared.fieldMustBeOneOf", {
        field,
        options: CONTENT_LOCALES.join(", "),
      }),
    };
  }

  return { value: raw as ContentLocale };
}

/**
 * Reads a request's JSON body as a plain object, or the message for a 400.
 * Every whole-locale endpoint takes an object body, so an array or a scalar is
 * rejected here rather than in each route.
 */
export async function readJsonObjectBody(
  request: Request,
  t: Translate,
): Promise<{ record: Record<string, unknown> } | { error: string }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { error: t("common.shared.requestBodyMustBeValidJson") };
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { error: t("common.shared.requestBodyMustBeAJson") };
  }

  return { record: body as Record<string, unknown> };
}

/**
 * A locale's rows in render order: `sortOrder`, then oldest — the same order
 * the list route and the public loader use.
 */
export function listLocaleSections(
  locale: ContentLocale,
): Promise<HomePageSection[]> {
  return prisma.homePageSection.findMany({
    where: { locale },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

/** The response body for `locale`, read fresh after a write. */
export async function bulkResponseBody(
  locale: ContentLocale,
): Promise<AdminHomePageSectionBulkResponse> {
  const sections = await listLocaleSections(locale);

  return { sections: sections.map(toSectionRow) };
}

/** One default row: its type, its default position, and validated content. */
export type DefaultSectionPlan = {
  type: HomePageSectionType;
  sortOrder: number;
  content: Prisma.InputJsonValue;
};

/**
 * The v4 default composition for `locale` as rows to write: every body
 * section of `DEFAULT_HOME_PAGE_SECTION_ORDER` at its index, then the chrome
 * from `CHROME_SORT_ORDER_BASE` — the layout `scripts/seed-home-page-content.ts`
 * writes.
 *
 * The copy is the default translated through the locale's catalog with the
 * English layer beneath it — exactly what the public page renders for a type
 * that has no row — so materializing it changes nothing a visitor sees.
 *
 * Each default goes through the same validator the API and the renderer use;
 * a failure means the defaults and the parser in `home-page-content.ts`
 * disagree, which is a build-level bug, so it throws (a 500) rather than
 * writing content the public loader would then skip.
 */
export async function planLocalizedDefaultSections(
  locale: ContentLocale,
): Promise<DefaultSectionPlan[]> {
  const messages = await loadMessages(APP_LOCALE_BY_CONTENT_LOCALE[locale]);
  const content = localizeDefaultHomePageContent(createMessageLookup(messages));

  const entries: { type: HomePageSectionType; sortOrder: number }[] = [
    ...DEFAULT_HOME_PAGE_SECTION_ORDER.map((type, index) => ({
      type,
      sortOrder: index,
    })),
    ...HOME_PAGE_CHROME_SECTION_TYPES.map((type, index) => ({
      type,
      sortOrder: CHROME_SORT_ORDER_BASE + index,
    })),
  ];

  return entries.map(({ type, sortOrder }) => {
    const validated = parseHomePageSection(type, content[type]);

    if ("error" in validated) {
      throw new Error(
        `Default content for home page section "${type}" is invalid: ${validated.error}`,
      );
    }

    return { type, sortOrder, content: validated.data.content };
  });
}

/**
 * A stored `Json` value as something Prisma will write back. The column is
 * non-nullable, but a JSON `null` *literal* is still a legal value of it and
 * has to be spelled `Prisma.JsonNull` on the way in.
 */
export function toInputJson(
  value: Prisma.JsonValue,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}
