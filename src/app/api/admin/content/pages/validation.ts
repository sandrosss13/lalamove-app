import { ContentLocale, Prisma } from "@prisma/client";

/**
 * The wire contract and input rules shared by the static-page collection route
 * (`GET`/`POST`) and the single-page route (`PATCH`/`DELETE`).
 *
 * They live in one module for the same reason
 * `@/app/api/driver-profile/vehicles/validation` does: the two handlers must
 * agree, because a slug rejected on create has to stay rejected on edit, and a
 * row shape the table reads has to be produced identically by all three write
 * paths. Route modules themselves can only export handlers and Next's route
 * config, so shared *runtime* helpers cannot live in `route.ts`.
 */

/** Valid `ContentLocale` values, derived from the generated Prisma enum. */
export const CONTENT_LOCALES = Object.values(ContentLocale);

/**
 * Slugs are the public URL segment (`/pages/<slug>`), so they are restricted to
 * lowercase alphanumerics separated by single hyphens. Anything looser would
 * put case-sensitivity and percent-encoding between what staff typed and what a
 * visitor's link has to match.
 */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Long enough for "terms-and-conditions-for-business-accounts". */
const MAX_SLUG_LENGTH = 120;

/** Cap on the page heading; the body is where the content belongs. */
const MAX_TITLE_LENGTH = 200;

/**
 * Answer to a create or update that collides with `@@unique([slug, locale])`.
 * A constant so both routes phrase it identically.
 */
export const DUPLICATE_PAGE_ERROR =
  "A page with this slug already exists for this locale.";

/** One static page as the admin table and the form dialog read it. */
export type AdminStaticPageRow = {
  id: string;
  slug: string;
  locale: ContentLocale;
  title: string;
  bodyHtml: string;
  isPublished: boolean;
  /** ISO string — this crosses the wire, so it is never a `Date`. */
  updatedAt: string;
};

/** The columns every handler here selects, kept in step with the row type. */
export const STATIC_PAGE_SELECT = {
  id: true,
  slug: true,
  locale: true,
  title: true,
  bodyHtml: true,
  isPublished: true,
  updatedAt: true,
} as const;

/** Turns a selected `StaticPage` into the JSON body the admin UI consumes. */
export function serializeStaticPage(page: {
  id: string;
  slug: string;
  locale: ContentLocale;
  title: string;
  bodyHtml: string;
  isPublished: boolean;
  updatedAt: Date;
}): AdminStaticPageRow {
  return {
    id: page.id,
    slug: page.slug,
    locale: page.locale,
    title: page.title,
    bodyHtml: page.bodyHtml,
    isPublished: page.isPublished,
    updatedAt: page.updatedAt.toISOString(),
  };
}

/**
 * Hand-rolled body validation, consistent with the rest of the API (the project
 * deliberately uses no validation library). Each parser returns either the
 * cleaned value or the message to send back with a 400.
 */
export function parseSlug(
  value: unknown,
): { value: string } | { error: string } {
  if (typeof value !== "string") {
    return { error: "slug is required and must be a string." };
  }

  // Lowercased rather than rejected on case alone: "Terms" is a typo, not a
  // different page, and the unique constraint has to see the canonical form.
  const slug = value.trim().toLowerCase();

  if (slug.length > MAX_SLUG_LENGTH) {
    return { error: `slug must be ${MAX_SLUG_LENGTH} characters or fewer.` };
  }

  if (!SLUG_PATTERN.test(slug)) {
    return {
      error:
        "slug must be lowercase letters, numbers and single hyphens, e.g. “terms-of-service”.",
    };
  }

  return { value: slug };
}

export function parseLocale(
  value: unknown,
): { value: ContentLocale } | { error: string } {
  if (
    typeof value !== "string" ||
    !CONTENT_LOCALES.includes(value as ContentLocale)
  ) {
    return { error: `locale must be one of: ${CONTENT_LOCALES.join(", ")}.` };
  }

  return { value: value as ContentLocale };
}

export function parseTitle(
  value: unknown,
): { value: string } | { error: string } {
  if (typeof value !== "string" || value.trim() === "") {
    return { error: "title is required and must be a non-empty string." };
  }

  const title = value.trim();

  if (title.length > MAX_TITLE_LENGTH) {
    return { error: `title must be ${MAX_TITLE_LENGTH} characters or fewer.` };
  }

  return { value: title };
}

/**
 * The page body. Deliberately uncapped: a Terms or Privacy page is legitimately
 * long, and the author is a vetted `SystemUserProfile` rather than a public
 * user. Not trimmed beyond the emptiness check either — leading whitespace in
 * HTML is meaningless, but the markup is stored exactly as written.
 */
export function parseBodyHtml(
  value: unknown,
): { value: string } | { error: string } {
  if (typeof value !== "string" || value.trim() === "") {
    return { error: "bodyHtml is required and must be a non-empty string." };
  }

  return { value };
}

export function parseIsPublished(
  value: unknown,
): { value: boolean } | { error: string } {
  if (typeof value !== "boolean") {
    return { error: "isPublished must be a boolean." };
  }

  return { value };
}

/**
 * True when `error` is the `@@unique([slug, locale])` violation — i.e. staff
 * tried to give a locale a slug it already has. `meta.target` is checked so an
 * unrelated P2002 is not mislabelled; Postgres reports either the column list
 * or the index name ("StaticPage_slug_locale_key"), so both shapes are handled.
 */
export function isDuplicateSlugLocaleError(error: unknown): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    return false;
  }

  const target = error.meta?.target;

  if (Array.isArray(target)) {
    return target.includes("slug");
  }

  return typeof target === "string" && target.includes("slug");
}
