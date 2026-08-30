/**
 * Populates the landing page CMS with the copy the page already renders, as
 * editable `HomePageSection` rows.
 *
 * The `HomePageSection` model has existed since the back office shipped and has
 * never held a row, so `/` has always rendered the TypeScript fallbacks in
 * `src/components/landing/landing-page.tsx` — the CMS was a bypassed layer
 * rather than a source of truth. This script closes that loop: after it runs the
 * public page is composed from the database, deleting the rows returns it to the
 * fallbacks, and editing a string in `/admin/content/home-page` changes the
 * public page without a deploy.
 *
 *   pnpm seed:home-page            # create anything missing; never overwrite
 *   pnpm seed:home-page --force    # rewrite the seeded rows back to the defaults
 *
 * Nothing runs this automatically. It is not part of `pnpm build`, not part of
 * `prisma migrate`, and not part of `postinstall`.
 *
 * ---------------------------------------------------------------------------
 * Why a separate script rather than `prisma/seed.ts`
 * ---------------------------------------------------------------------------
 *
 * `prisma/seed.ts` is registered under `"prisma": { "seed": … }` in
 * `package.json`, so the Prisma CLI runs it *automatically* on
 * `prisma migrate reset` and after `prisma migrate dev` creates a fresh
 * database. Three reasons that is the wrong home for marketing copy:
 *
 * 1. It is the operational-data seed. It writes the vehicle taxonomy and the
 *    pricing rules the matching engine and `src/lib/pricing.ts` depend on, which
 *    every environment — CI and throwaway test databases included — needs. None
 *    of them need homepage marketing copy, and a developer resetting their
 *    database to fix a migration should not be silently re-authoring content.
 * 2. Coupling. `prisma/seed.ts` imports only `@prisma/client`. Folding this in
 *    would make it depend on `@/lib/admin/home-page-content`, so a change to the
 *    content contract could break `prisma migrate reset`.
 * 3. Precedent. `scripts/seed-super-admin.ts` (+ `pnpm seed:super-admin`) is
 *    exactly this pattern: a deliberately-invoked seed outside the reset path.
 *
 * ---------------------------------------------------------------------------
 * Why English only
 * ---------------------------------------------------------------------------
 *
 * `DEFAULT_HOME_PAGE_CONTENT` is written in English and there is no Georgian
 * translation of it anywhere in the repository, so seeding `KA` would mean
 * writing English strings into rows labelled Georgian. It would also change
 * nothing on the page: `@/lib/admin/home-page-data` defaults to `EN`, and a
 * `?locale=ka` request with no `KA` rows already falls back to the same English
 * defaults — English-in-a-KA-row and no-KA-row render identically today. What it
 * *would* do is make the admin worse: fifteen rows in the KA tab that look
 * authored and translated, each needing to be found and corrected, versus an
 * empty tab whose empty state reads "No sections for this locale yet — the
 * landing page is showing its default composition", which is both true and
 * actionable. Translating is a content job, and the section dialog makes it a
 * pleasant one: New Section pre-fills every field with the current English copy,
 * so a translator picks the type and overwrites the strings in place. Tracked in
 * `specs/georgia-homepage-redesign/action-required.md`.
 *
 * There is deliberately no `--locale` flag: guessing at that interface before a
 * translator has asked for it is speculation.
 *
 * ---------------------------------------------------------------------------
 * Why no `Banner` rows
 * ---------------------------------------------------------------------------
 *
 * A `Banner` needs a non-empty `imageUrl` (the API rejects an empty one) and no
 * images exist yet, so seeding would mean inventing URLs that resolve to
 * nothing and rendering broken image boxes in the hero carousel and the partner
 * marquee. With no banner rows at all, both components render nothing, which is
 * the correct empty state and the one they are built for. The upload steps a
 * content manager takes instead are written up in `action-required.md`.
 *
 * ---------------------------------------------------------------------------
 * Not audited
 * ---------------------------------------------------------------------------
 *
 * `AuditLog.actorId` is a `User.id` and the audit log records what a
 * `SUPER_ADMIN`/`CONTENT_MANAGER` did through the back office. This script has
 * no actor and does not invent a synthetic one; `prisma/seed.ts` and
 * `scripts/seed-super-admin.ts` set the same precedent. The rows it creates are
 * therefore not represented in the audit log — every subsequent edit, made
 * through the admin, is.
 */
import { fileURLToPath } from "node:url";

import type { ContentLocale } from "@prisma/client";

import {
  DEFAULT_HOME_PAGE_CONTENT,
  DEFAULT_HOME_PAGE_SECTION_ORDER,
  HOME_PAGE_CHROME_SECTION_TYPES,
  parseHomePageSection,
  type HomePageSectionContent,
  type HomePageSectionType,
} from "@/lib/admin/home-page-content";

/**
 * Env files to load, highest precedence first — `process.loadEnvFile` never
 * overwrites a variable that is already set, so the first file to define a key
 * wins, and any variable already in the real environment beats both. That
 * ordering reproduces Next.js' own precedence (`.env.local` over `.env`) and
 * lets a one-off run point the script elsewhere inline:
 *
 *   DATABASE_URL=... pnpm seed:home-page
 */
const ENV_FILES = [".env.local", ".env"] as const;

/**
 * The only locale seeded. See the header for why `KA` is left empty.
 *
 * Typed as `ContentLocale` (a type-only import, so nothing from
 * `@prisma/client` is evaluated before the env files are loaded) rather than
 * left as a bare string, so a future rename of the enum member is a compile
 * error here instead of a silent no-op at runtime.
 */
const SEED_LOCALE: ContentLocale = "EN";

/**
 * Body sections, in the order the page renders them. Taken from the shared
 * contract rather than restated, so the seed cannot drift from the composition
 * the fallback already shows — the seed exists to reproduce exactly that, as
 * editable rows.
 *
 * `category_tiles` is absent because the contract's order omits it: it stays
 * renderable so a row authored against the previous design still works, but it
 * is not part of this design and is never created fresh.
 */
const ORDERED_SECTION_TYPES: readonly HomePageSectionType[] =
  DEFAULT_HOME_PAGE_SECTION_ORDER;

/**
 * Page chrome. `landing-page.tsx` pulls these out of the section list *by type*
 * and renders them outside the ordered loop, so their `sortOrder` never moves
 * anything on the page — it is set high purely so they sort to the bottom of the
 * admin table, out of the way of the sections whose order does matter.
 */
const CHROME_SECTION_TYPES: readonly HomePageSectionType[] =
  HOME_PAGE_CHROME_SECTION_TYPES;

/** Where the chrome rows' `sortOrder` starts, well clear of the body sections. */
const CHROME_SORT_ORDER_BASE = 100;

/** Column width for the type name in the per-row progress lines. */
const TYPE_COLUMN_WIDTH = 18;

/**
 * An expected, explainable failure — a bad flag, or defaults that no longer
 * satisfy their own validator. Reported as a bare message, since a stack trace
 * for these is noise that hides the actual problem. Anything that is not a
 * `SeedError` is a genuine fault and is printed in full.
 */
class SeedError extends Error {}

const USAGE = `Usage: pnpm seed:home-page [--force]`;

/**
 * One row the seed intends to write: a section type, the position it takes, and
 * its default content already normalized by the shared validator.
 */
type PlannedSection = {
  type: HomePageSectionType;
  sortOrder: number;
  content: HomePageSectionContent;
};

/** What happened to one planned row. */
type SeedOutcome = "created" | "skipped" | "overwritten";

/**
 * Flag parsing, kept deliberately minimal — this is a one-off operational
 * script, not a CLI. `--force` is spelled the same way `seed-super-admin.ts`
 * spells its escape hatch.
 */
function parseArgs(argv: readonly string[]): { force: boolean } {
  let force = false;

  for (const arg of argv) {
    if (arg === "--force") {
      force = true;
      continue;
    }

    throw new SeedError(`Unknown argument "${arg}".\n${USAGE}`);
  }

  return { force };
}

/**
 * Populate `process.env` from the project's env files.
 *
 * Next.js does this itself; a bare `tsx` process does not, and neither does
 * `@prisma/client` (only the Prisma CLI loads `.env`, which is why
 * `prisma/seed.ts` gets away without this). Without it `new PrismaClient()`
 * fails on a missing `DATABASE_URL`.
 *
 * Paths are resolved against this file rather than `process.cwd()` so the script
 * works when invoked from a subdirectory — via `fileURLToPath`, not
 * `URL.pathname`, which would hand `loadEnvFile` a percent-encoded path and fail
 * for any checkout whose directory contains a space or a `:`. A missing file is
 * not an error: `.env.local` is gitignored and absent on CI, and in a real
 * deployment every variable may come from the environment instead.
 */
function loadEnvFiles(): void {
  for (const file of ENV_FILES) {
    try {
      process.loadEnvFile(fileURLToPath(new URL(`../${file}`, import.meta.url)));
    } catch {
      // Absent or unreadable: fall through to the next file, and ultimately to
      // whatever the real environment provides.
    }
  }
}

/**
 * Builds the full list of rows to write, validating every default on the way.
 *
 * Running the defaults through the same validator the API and the public
 * renderer use costs nothing and closes a real gap: `loadHomePageSections`
 * *skips* any row whose content fails validation, so a defaults/validator
 * mismatch would otherwise surface as a section silently missing from the live
 * page. The normalized (trimmed) value it returns is what gets stored, so the
 * `Json` column holds exactly what the API would have written.
 *
 * The whole plan is built before anything is written, so an invalid default
 * aborts the run without leaving a half-seeded page behind.
 */
function planSections(): PlannedSection[] {
  const planned: PlannedSection[] = [];

  const entries: { type: HomePageSectionType; sortOrder: number }[] = [
    // `sortOrder` is the array index, which is exactly what the admin's reorder
    // buttons renumber to — so the table opens already normalized and the first
    // ↑/↓ click costs the minimum number of writes.
    ...ORDERED_SECTION_TYPES.map((type, index) => ({
      type,
      sortOrder: index,
    })),
    ...CHROME_SECTION_TYPES.map((type, index) => ({
      type,
      sortOrder: CHROME_SORT_ORDER_BASE + index,
    })),
  ];

  for (const { type, sortOrder } of entries) {
    const validated = parseHomePageSection(type, DEFAULT_HOME_PAGE_CONTENT[type]);

    if ("error" in validated) {
      // The defaults and the validator both live in
      // `@/lib/admin/home-page-content`; if they disagree, that contract is
      // broken and needs fixing there — never by weakening this check.
      throw new SeedError(
        `Default content for "${type}" is invalid: ${validated.error}\n` +
          "Nothing was written. Fix the defaults or the parser in " +
          "src/lib/admin/home-page-content.ts.",
      );
    }

    planned.push({ type, sortOrder, content: validated.data.content });
  }

  return planned;
}

/** One right-padded progress line, e.g. `  created  hero    sortOrder 0`. */
function formatOutcomeLine(
  outcome: SeedOutcome,
  planned: PlannedSection,
): string {
  const type = planned.type.padEnd(TYPE_COLUMN_WIDTH);

  switch (outcome) {
    case "created":
      return `  created  ${type} sortOrder ${planned.sortOrder}`;
    case "overwritten":
      return `  forced   ${type} sortOrder ${planned.sortOrder} (content, sortOrder and isActive reset to the defaults)`;
    case "skipped":
      return `  skipped  ${type} (already exists — use --force to overwrite)`;
  }
}

async function main(): Promise<void> {
  // Parsed before anything else so a typo costs nothing and opens no database
  // connection.
  const { force } = parseArgs(process.argv.slice(2));

  // Likewise validated before a connection exists: a broken contract should
  // fail instantly, not after a round trip.
  const planned = planSections();

  loadEnvFiles();

  // Imported dynamically, and only after `loadEnvFiles()`: `@/lib/prisma`
  // constructs a `PrismaClient` at module-evaluation time, so hoisting it to a
  // static `import` would evaluate it before `DATABASE_URL` is set and break the
  // script. Do not "tidy" this into the import block above.
  // (`@/lib/admin/home-page-content` above is a normal static import on purpose:
  // it is dependency-free, reads no environment variable and touches no
  // database.)
  const { prisma } = await import("@/lib/prisma");

  try {
    // Written line by line as the run progresses rather than buffered to the
    // end. `DATABASE_URL` points at a pgbouncer pooler and this makes a couple
    // of dozen sequential round trips, so a run can stall or drop its connection
    // part-way — at which point an operator needs to see how far it got, not an
    // empty terminal followed by a stack trace.
    //
    // `console.log` is disallowed by the project's lint rules; this is a CLI
    // script, so write to stdout directly (same as the other two seeds).
    const write = (line: string): void => {
      process.stdout.write(`${line}\n`);
    };

    write("");
    write(`Home page content seed (locale ${SEED_LOCALE})`);

    let created = 0;
    let overwritten = 0;
    let skipped = 0;

    for (const section of planned) {
      // `HomePageSection` has no `@@unique([type, locale])` — only a non-unique
      // `@@index([locale, isActive, sortOrder])` — so `upsert` is unavailable
      // and the match is made by hand. Matching on `id` below also means a
      // database that somehow holds duplicate rows for a type has one of them
      // rewritten rather than gaining another.
      const existing = await prisma.homePageSection.findFirst({
        where: { type: section.type, locale: SEED_LOCALE },
        select: { id: true },
      });

      if (existing === null) {
        await prisma.homePageSection.create({
          data: {
            type: section.type,
            locale: SEED_LOCALE,
            sortOrder: section.sortOrder,
            isActive: true,
            content: section.content,
          },
          select: { id: true },
        });

        created += 1;
        write(formatOutcomeLine("created", section));
        continue;
      }

      if (!force) {
        // Deliberately a complete no-op: not the content, not the `sortOrder`,
        // not `isActive`. The entire point of this feature is that a human edits
        // this copy in the back office, and a seed that re-stamps the defaults
        // on every run silently destroys their work. "Safe to re-run" has to
        // mean actually safe.
        skipped += 1;
        write(formatOutcomeLine("skipped", section));
        continue;
      }

      await prisma.homePageSection.update({
        where: { id: existing.id },
        data: {
          sortOrder: section.sortOrder,
          isActive: true,
          content: section.content,
        },
        select: { id: true },
      });

      overwritten += 1;
      write(formatOutcomeLine("overwritten", section));
    }

    const summary =
      `${ORDERED_SECTION_TYPES.length} sections + ${CHROME_SECTION_TYPES.length} chrome rows. ` +
      `${created} created, ` +
      (force ? `${overwritten} overwritten.` : `${skipped} left as they were.`);

    write("");
    write(summary);

    if (created === 0 && overwritten === 0) {
      write(
        "Nothing to do — every section already exists. This run changed nothing.",
      );
    }

    write("");
  } finally {
    // Always release the pool, including on the failure paths above — a bare
    // `tsx` process has no Next.js runtime to tear it down and would otherwise
    // hang on an open connection.
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  if (error instanceof SeedError) {
    // Raised before any write (bad flag, invalid defaults), so nothing has been
    // created and there is nothing to say about partial state.
    console.error(`\n${error.message}\n`);
  } else {
    // Anything else — most likely a dropped connection, since `DATABASE_URL`
    // points at a pgbouncer pooler and this makes a couple of dozen sequential
    // round trips. The rows are written one at a time and deliberately NOT in a
    // transaction (Prisma's interactive transactions are not supported on a
    // transaction-mode pooler), so a failure here can leave the seed
    // half-applied. That is recoverable precisely because the script is
    // idempotent, which is worth saying out loud rather than leaving the
    // operator to work out whether a re-run is safe.
    console.error("\nSeeding the home page content failed:", error);
    console.error(
      "\nThe run may have stopped part-way through. Re-running is safe: " +
        "sections that already exist are left untouched, and the missing ones " +
        "are created.\n",
    );
  }

  process.exitCode = 1;
});
