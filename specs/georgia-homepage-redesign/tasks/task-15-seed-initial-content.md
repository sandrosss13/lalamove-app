# Task 15: Seed the initial homepage content

## Status

complete

## Wave

4

## Description

The CMS has existed for this page since the admin back office shipped, and it has **never been
populated**. `prisma/seed.ts` writes only `VehicleTypeSpec` and `PricingRule` rows; zero
`HomePageSection`, `Banner`, `StaticPage` or `TranslationEntry` rows have ever been created. That is
why the live site always renders the TypeScript fallbacks in
`src/components/landing/landing-page.tsx` — the CMS is a bypassed layer, not a source of truth. A
content manager opening `/admin/content/home-page` today sees an empty table, and the only way to edit
a line of homepage copy is to add every section by hand first.

This task closes that loop: an idempotent, explicitly-invoked seed that creates one `HomePageSection`
row per section type, in the order task-14 renders them, using the freight-adapted defaults task-02
already wrote. After it runs, the public page renders **from the database**; deleting the rows returns
it to the fallbacks; editing a string in the admin changes the public page. That round trip is the
acceptance test for the whole feature.

## Dependencies

**Depends on:** task-12-admin-section-and-banner-forms.md, task-13-admin-vehicle-photos.md,
task-14-page-composition.md
**Blocks:** None (final task).

**Context from dependencies:**

**task-02 (wave 1)** extended `src/lib/admin/home-page-content.ts` — the single shared contract,
deliberately dependency-free (no Prisma, no `server-only`). It exports:

- `HOME_PAGE_SECTION_TYPES` — `hero`, `hero_carousel`, `partner_marquee`, `stats`, `bento`,
  `quote_calculator`, `how_it_works`, `vehicle_types`, `driver_cta`, `coverage`, `faq`, `closing_cta`,
  legacy `category_tiles`, plus the chrome types `nav` and `footer`.
- `DEFAULT_HOME_PAGE_CONTENT: HomePageSectionContentByType` — the freight-adapted default copy for
  every one of them, already written in the correct voice (the handoff's courier claims — "book a
  courier in twelve seconds", "54s median match time", "20 stops per booking", "insured up to ₾5,000",
  "6,400 courier partners", "half price on your first three", a public REST API, "Kwun Tong St" — are
  removed or replaced).
- `parseHomePageSection(type, content)` → `{ data } | { error }`, the same validator the API routes and
  the public renderer use.
- `HOME_HERO_BANNER_PLACEMENT = "home_hero"`, `HOME_SECONDARY_BANNER_PLACEMENT = "home_secondary"`,
  `HOME_PARTNER_LOGO_BANNER_PLACEMENT = "home_partner_logo"`, `MAX_HERO_BANNERS = 6`.

**task-14 (wave 3)** set the rendered order: `hero → hero_carousel → partner_marquee → stats → bento →
quote_calculator → how_it_works → vehicle_types → driver_cta → coverage → faq → closing_cta`, and
pulls `nav` and `footer` out of the section list **by type** so they render as page chrome regardless
of their `sortOrder`. `category_tiles` stays renderable for pre-existing rows but is not part of the
default order.

**task-12 (wave 2)** gave every one of those types an editing UI in
`src/components/admin/content/home-page-section-form-dialog.tsx`, added real image upload to the banner
form, and made the API reject more than `MAX_HERO_BANNERS` active `home_hero` banners per locale.

**task-13 (wave 2)** added `/admin/content/vehicle-photos`, where a content manager attaches a photo to
each of the 11 `VehicleTypeSpec` rows.

**Schema facts this task depends on** (`prisma/schema.prisma:1009`):

```prisma
model HomePageSection {
  id        String        @id @default(cuid())
  type      String        // free-form on purpose
  locale    ContentLocale // KA | EN only
  sortOrder Int           @default(0)
  isActive  Boolean       @default(true)
  content   Json
  createdAt DateTime      @default(now())
  updatedAt DateTime      @updatedAt

  @@index([locale, isActive, sortOrder])
}
```

**There is no unique constraint on `(type, locale)`** — only a non-unique index. That single fact
drives the idempotency design below: `upsert` is not available, so the seed cannot be written the way
`prisma/seed.ts`'s `upsert where: { code }` is.

## Files to Create

- `scripts/seed-home-page-content.ts` — the seed. Standalone, explicitly invoked, idempotent.

## Files to Modify

- `package.json` — add `"seed:home-page": "tsx scripts/seed-home-page-content.ts"` alongside the
  existing `"seed:super-admin"`.
- `specs/georgia-homepage-redesign/action-required.md` — record the Georgian-translation follow-up and
  the banner-upload steps (see §2 and §4).

## Technical Details

### 1. Why a separate script, not `prisma/seed.ts`

**Decision: a new `scripts/seed-home-page-content.ts` with its own `pnpm seed:home-page` entry point.**

`prisma/seed.ts` is registered in `package.json` under `"prisma": { "seed": "tsx prisma/seed.ts" }`,
which means the Prisma CLI runs it **automatically** on `prisma migrate reset` and after
`prisma migrate dev` creates a fresh database. Three reasons that is the wrong home for marketing copy:

1. **It is the operational-data seed.** It writes the vehicle taxonomy and the pricing rules the
   matching engine and `src/lib/pricing.ts` depend on. Every environment — including CI and a
   throwaway test database — needs those rows. None of them need homepage marketing copy, and a
   developer resetting their database to fix a migration should not be silently re-authoring content.
2. **Coupling.** `prisma/seed.ts` currently imports only `@prisma/client`. Folding this in makes the
   Prisma seed depend on `src/lib/admin/home-page-content.ts` — an app module — so a change in the
   content contract can break `prisma migrate reset`.
3. **Precedent.** `scripts/seed-super-admin.ts` (+ `pnpm seed:super-admin`) is exactly this pattern:
   a one-off, deliberately-invoked seed that is not part of the automatic reset path.

State this decision, with its reasoning, in the script's header comment.

### 2. Locale: seed `EN` only

**Decision: seed English rows only. Do not create `KA` rows.**

The reasoning, which belongs in the script's header comment verbatim:

- `DEFAULT_HOME_PAGE_CONTENT` is written in English, and there is no Georgian translation of it
  anywhere in the repository. Seeding `KA` rows would mean writing English strings into rows labelled
  Georgian.
- **It would change nothing on the page.** `src/lib/admin/home-page-data.ts` defaults to `EN`, and a
  `?locale=ka` request with no `KA` rows falls back to `DEFAULT_LANDING_SECTIONS` — which is the same
  English copy. So English-in-a-KA-row and no-KA-row render identically today.
- It would actively make things worse in the admin: fifteen rows in the KA tab that look authored,
  each needing to be found and translated, versus an empty tab whose empty state already reads *"No
  sections for this locale yet — the landing page is showing its default composition."* — which is
  true and actionable.
- Translating is a content job, and task-12's dialog makes it a pleasant one: **New Section** pre-fills
  every field with the current English copy, so a translator picks the type and overwrites the strings
  in place.

Add to `action-required.md` under "After Implementation":

> - [ ] **Translate the homepage into Georgian.** The seed creates English (`EN`) rows only; the `KA`
>       tab at `admin.localhost:3000` → Content → Home Page is intentionally empty, and `?locale=ka`
>       falls back to the English defaults until it is filled. To translate: open the KA tab, add one
>       section per type (the form pre-fills the English copy), and translate the fields in place. The
>       order to reproduce is hero, hero carousel, partner marquee, stats, bento, quote calculator, how
>       it works, vehicle types, driver CTA, coverage, FAQ, closing CTA, plus a nav and a footer row.

Do not add a locale flag to the script for this. If a future translator wants a KA scaffold, they can
say so; guessing at the interface now is speculation.

### 3. The seed itself

#### Script shape — follow `scripts/seed-super-admin.ts`

That file documents two non-obvious requirements for a `tsx`-run script in this repo; both apply here:

```ts
/**
 * Env files to load, highest precedence first — `process.loadEnvFile` never
 * overwrites a variable that is already set, so the first file to define a key
 * wins, and any variable already in the real environment beats both.
 */
const ENV_FILES = [".env.local", ".env"] as const;

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
```

- Paths are resolved against the module (`fileURLToPath(new URL("../…", import.meta.url))`), not
  `process.cwd()`, and via `fileURLToPath` rather than `URL.pathname` — the latter hands
  `loadEnvFile` a percent-encoded path and fails for any checkout whose directory contains a space.
  **This repository's path contains a `UI:UX` directory and could sit anywhere; do not shortcut this.**
- `@/lib/prisma` constructs a `PrismaClient` at module-evaluation time, so it must be imported
  **dynamically, after** `loadEnvFiles()`:
  `const { prisma } = await import("@/lib/prisma");`. Hoisting it to a static import breaks the script
  on a missing `DATABASE_URL`.
- `@/lib/admin/home-page-content` **can** be a normal static import: it is dependency-free, reads no
  environment variable and touches no database. (The `@/` alias resolves under `tsx` via `tsconfig`
  paths — `seed-super-admin.ts` proves it.)
- `console.log` is disallowed by the project's lint rules. Write progress to stdout with
  `process.stdout.write(...)`, as both existing seeds do. `console.error` is permitted for failures.
- Always `await prisma.$disconnect()` in a `finally` — a bare `tsx` process has no Next.js runtime to
  tear the pool down and will otherwise hang.

#### The ordered list

```ts
import {
  DEFAULT_HOME_PAGE_CONTENT,
  parseHomePageSection,
  type HomePageSectionType,
} from "@/lib/admin/home-page-content";

/**
 * The composition the public page renders, in order. Mirrors the default order
 * in `src/components/landing/landing-page.tsx` — the seed exists to reproduce
 * what the fallback already shows, as editable rows.
 *
 * `category_tiles` is deliberately absent: it is kept renderable so
 * pre-existing rows still work, but it is not part of this design.
 */
const ORDERED_SECTION_TYPES: HomePageSectionType[] = [
  "hero",
  "hero_carousel",
  "partner_marquee",
  "stats",
  "bento",
  "quote_calculator",
  "how_it_works",
  "vehicle_types",
  "driver_cta",
  "coverage",
  "faq",
  "closing_cta",
];

/**
 * Page chrome. `landing-page.tsx` pulls these out of the section list *by type*
 * and renders them outside the ordered loop, so their `sortOrder` never moves
 * anything — it is set high purely so they sort to the bottom of the admin
 * table, out of the way of the sections whose order does matter.
 */
const CHROME_SECTION_TYPES: HomePageSectionType[] = ["nav", "footer"];
const CHROME_SORT_ORDER_BASE = 100;
```

`sortOrder` for the ordered types is the array index (0…11), which is exactly what the admin's
reorder buttons renumber to — so the table opens already normalized and the first ↑/↓ click costs the
minimum number of writes.

#### Idempotency without a unique constraint

`HomePageSection` has no `@@unique([type, locale])`, so `upsert` cannot be used. Match by hand:

```ts
const existing = await prisma.homePageSection.findFirst({
  where: { type, locale },
  select: { id: true },
});
```

**Default behaviour when a row already exists: leave it completely alone.** Do not update its
`content`, its `sortOrder` or its `isActive`. The whole purpose of this feature is that a human edits
this copy in the back office; a seed that re-stamps the defaults on every run is a footgun that
silently destroys their work, and "safe to re-run" has to mean *actually* safe.

Provide `--force` for the genuine reset case — the same escape hatch and the same spelling
`seed-super-admin.ts` uses — which rewrites `content`, `sortOrder` and `isActive` on the matched row
(by `id`, so a duplicate row set is not multiplied). Document it in the usage string as destructive to
authored copy.

Print a per-type summary so a re-run is legible:

```
Home page content seed (locale EN)
  created  hero               sortOrder 0
  skipped  hero_carousel      (already exists — use --force to overwrite)
  ...
12 sections + 2 chrome rows. 3 created, 11 left as they were.
```

#### Validate before writing

Run each default through the shared validator before it becomes a row:

```ts
const validated = parseHomePageSection(type, DEFAULT_HOME_PAGE_CONTENT[type]);
if ("error" in validated) {
  throw new SeedError(`Default content for "${type}" is invalid: ${validated.error}`);
}
```

This costs nothing and closes a real gap: `loadHomePageSections` **skips** any row whose content fails
validation (with a `console.warn` nobody will see), so a defaults/validator mismatch introduced in
task-02 would otherwise show up as a section silently missing from the live page. Write
`validated.data.content` — the normalized, trimmed value — not the raw default, so the `Json` column
matches exactly what the API would have stored.

No cast is needed to satisfy `Prisma.InputJsonValue`; `src/app/api/admin/content/home-page-sections/route.ts`
already assigns a parser result into that field.

Every row is created with `isActive: true`.

#### Not audited

The audit log records actions taken by a `SUPER_ADMIN`/`CONTENT_MANAGER` through the back office;
`AuditLog.actorId` is a `User.id` and this script has no actor. `prisma/seed.ts` and
`scripts/seed-super-admin.ts` set the same precedent. Do not invent a synthetic actor. Note this in the
script header so the omission reads as a decision.

### 4. Do **not** seed `Banner` rows

There are no images yet — `action-required.md` still asks a human to supply 6 hero banners at
2400×900, up to 8 partner logos at 360×96 and 11 vehicle photos at 720×560. A `Banner` row needs a
non-empty `imageUrl` (the API rejects an empty one), so seeding would mean inventing URLs that resolve
to nothing, and the page would render broken image boxes in the carousel and the marquee. With **no**
banner rows, task-06's carousel and task-07's marquee render nothing at all, which is the correct
empty state and the one the components are built for.

Instead, document the human steps. Add to `action-required.md` under "After Implementation":

> - [ ] **Add the homepage banners.** At `admin.localhost:3000` → Content → Banners → **New Banner**:
>       upload the image, set **Placement** to `home_hero` for a carousel slide (max 6 active per
>       locale — the form and the API both enforce it) or `home_partner_logo` for a partner logo, set
>       **Locale** to match the page locale (`EN` today), set **Sort order** to the position you want,
>       and leave the dates empty for a banner with no start or end. The **Title** becomes the
>       carousel's caption chip, so write it as display copy, not as a filename.
> - [ ] **Add the vehicle photos.** At `admin.localhost:3000` → Content → Vehicle Photos, upload one
>       photo per vehicle type (11 of them). Types with no photo fall back to their illustrated glyph.

### 5. Running it

```bash
pnpm seed:home-page            # create anything missing; never overwrite
pnpm seed:home-page --force    # rewrite the seeded rows back to the defaults
```

Nothing runs this automatically. It is not part of `pnpm build`, not part of `prisma migrate`, and not
part of `postinstall`.

## Acceptance Criteria

- [ ] `pnpm seed:home-page` on a database with no `HomePageSection` rows creates 12 ordered sections
      plus `nav` and `footer`, all `locale: EN`, all `isActive: true`, `sortOrder` 0…11 for the ordered
      ones.
- [ ] Running it a second time creates nothing, changes nothing, and reports every type as skipped.
- [ ] Editing a section's copy in the admin, then re-running the seed **without** `--force`, leaves the
      edit intact.
- [ ] `--force` restores the defaults on the seeded rows, and only those rows.
- [ ] `/admin/content/home-page` (EN tab) lists all 14 rows in order, each with a readable content
      summary and no "Content does not match this type" cell.
- [ ] `localhost:3000` renders the same page it rendered before the seed — the copy is identical,
      because the seed writes the same defaults the fallback used.
- [ ] Changing one heading in the admin and reloading `/home` shows the change (`/home` is
      `force-dynamic`; `/` is `revalidate = 60`, so give it a minute or use `/home`).
- [ ] Deleting every `HomePageSection` row still renders the full page, from the fallbacks.
- [ ] Deactivating a single section removes only that section from the public page.
- [ ] No `Banner` rows are created, and with none present the carousel and the marquee render nothing
      rather than broken image boxes.
- [ ] `action-required.md` carries the Georgian-translation item, the banner-upload steps and the
      vehicle-photo step.
- [ ] `pnpm check` (lint + typecheck) passes; the new script is covered by `eslint .` and
      `tsc --noEmit`.

## Notes

- **`ContentLocale` is `KA | EN` only.** No Russian, despite the handoff's marketing copy mentioning
  Russian-language support. Adding a locale is a migration plus a full translation effort and is
  explicitly out of scope (`requirements.md` non-goals).
- The seeded copy is a **starting point, not final marketing text**. `action-required.md` already asks a
  human to read it through for tone and factual accuracy, and to confirm the brand name (the handoff is
  written for "Lalamove Georgia" throughout — wordmark, footer brand block, `© 2026 …` line), the real
  service-coverage figures and the four stat values. The `GeorgianCity` enum has 25 cities; the handoff
  shows 11 with a "Same hour"/"Scheduled" tier split that **does not exist anywhere in the data**, which
  is exactly why coverage is CMS content and not derived from the enum.
- Verify on the right host: `localhost:3000` is the client host and serves the homepage;
  `merchant.localhost:3000` redirects away from `/`; `admin.localhost:3000` serves `/admin/**`.
  `package.json`'s `"dev": "next dev -H ::"` is load-bearing — without `-H ::` the cross-host redirects
  collapse into `ERR_TOO_MANY_REDIRECTS`. Do not change it while adding the new script entry.
- If `pnpm seed:home-page` reports a validation failure for a type, that is task-02's defaults
  disagreeing with task-02's validator — fix the contract, do not weaken the check in the seed.
