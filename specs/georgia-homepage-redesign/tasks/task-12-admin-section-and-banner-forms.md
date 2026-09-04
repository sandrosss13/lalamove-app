# Task 12: Admin section forms, banner upload and the hero-banner cap

## Status

complete

## Wave

2

## Description

The redesigned homepage is only "editable from the back office" if every new section type has an
editing UI. task-02 extends the shared content contract with nine new section types (`hero_carousel`,
`partner_marquee`, `stats`, `bento`, `quote_calculator`, `coverage`, `closing_cta`, plus the two page
chrome types `nav` and `footer`) — but `HomePageSectionFormDialog` still only knows the six original
ones, and its `currentContent()` switch is exhaustive over `HomePageSectionType`, so the admin does
not compile until this task lands. Several of the new shapes carry repeatable sub-lists (stats
tiles, bento cards, coverage cities, footer columns and their nested links, nav links), which is the
bulk of the new UI work.

This task also finishes the image story on the banner side: the banner form's image field is a plain
text `<Input>` today, so a content manager has to host a file somewhere else first. task-04's
`AdminImageUpload` replaces it, with the URL box kept as the fallback. And it adds the one rule the
carousel depends on and nothing enforces: **at most 6 active `home_hero` banners per locale**. The
design caps the carousel at 6 slides; without a server-side cap a seventh banner is simply invisible,
which is the worst possible failure mode for a content editor — the save succeeds and nothing happens.

## Dependencies

**Depends on:** task-02-cms-content-contract.md, task-04-media-upload-infra.md
**Blocks:** task-15-seed-initial-content.md

**Context from dependencies:**

**task-02** extends `src/lib/admin/home-page-content.ts` — the single shared, deliberately
dependency-free contract (no Prisma, no `server-only`, because client landing components import it
directly). After task-02 it exports:

- `HOME_PAGE_SECTION_TYPES` — now `hero`, `hero_carousel`, `partner_marquee`, `stats`, `bento`,
  `quote_calculator`, `how_it_works`, `vehicle_types`, `driver_cta`, `coverage`, `faq`,
  `closing_cta`, `category_tiles` (legacy, kept renderable so pre-existing rows still work), plus
  the chrome types `nav` and `footer`.
- `HOME_PAGE_SECTION_TYPE_LABELS` — a human label for each of the above.
- One content TypeScript type per section, a matching entry in `HomePageSectionContentByType`, a
  hand-rolled `parse*` validator per type, and freight-adapted default copy in
  `DEFAULT_HOME_PAGE_CONTENT`.
- `parseHomePageSection(type, content)` returning `{ data } | { error }`, and
  `isHomePageSectionType(value)`.
- `HOME_HERO_BANNER_PLACEMENT = "home_hero"`, `HOME_SECONDARY_BANNER_PLACEMENT = "home_secondary"`,
  **`HOME_PARTNER_LOGO_BANNER_PLACEMENT = "home_partner_logo"`** (new — partner logos are `Banner`
  rows, not a new Prisma model) and **`MAX_HERO_BANNERS = 6`**.

**task-04** adds:

- `src/lib/site-media-storage.ts` — server-only helper over the public Supabase bucket `site-media`
  (created by hand in the dashboard; see `action-required.md`).
- `POST /api/admin/content/media/upload-url` — guarded by `authorizeAdminApi`, mints a signed upload
  and returns `{ path, token, publicUrl }`. The browser then uploads the bytes directly to Supabase
  via `uploadFileToSignedUrl(path, token, file)` from `src/lib/supabase-browser-client.ts`, which is
  how this project bypasses the route-handler body limit.
- `src/components/admin/content/admin-image-upload.tsx` — a reusable `"use client"` component: file
  picker, preview, progress, error reporting, a "paste a URL instead" escape hatch, and graceful
  degradation to URL-only when Supabase Storage is not configured.

**Read `admin-image-upload.tsx` before wiring it up** and use its real prop names. It is a
controlled component over a single image URL string; expect something in the shape of
`value: string`, `onChange: (url: string) => void`, plus a label/hint. Do not guess — match the file.

This task does not touch any landing component; wave-2 tasks 05–11 own those, and task-14 composes
them.

## Files to Create

- `src/app/api/admin/content/banners/validation.ts` — the shared hero-banner capacity check used by
  both banner routes. A sibling `validation.ts` beside a route module is an established pattern here
  (`src/app/api/admin/content/pages/validation.ts` is the canonical example); it exists because a
  `route.ts` is a Next.js entry point and must not export runtime values for another route to import.
  Only the *new* capacity rule goes here — do not move the existing inline field validation out of
  the two banner route files as part of this task.

## Files to Modify

- `src/components/admin/content/home-page-section-form-dialog.tsx` (832 lines) — add a sub-form per
  new section type, a repeatable-list editor with add/remove/**reorder**, and nested repeaters for
  the footer's columns → links. **Extend it; do not rewrite it.** The existing six sub-forms, the
  per-type draft behaviour, the `parseHomePageSection` pre-check on submit and the "no `open` state,
  parent keys the dialog" contract all stay exactly as they are.
- `src/components/admin/content/banner-form-dialog.tsx` (406 lines) — swap the image-URL `<Input>`
  for `AdminImageUpload`; add `home_partner_logo` to the placement suggestions and import the three
  placement constants from `@/lib/admin/home-page-content` instead of restating string literals.
- `src/app/admin/(sections)/content/home-page/page.tsx` (571 lines) — fix `summarize()`, which will
  not compile against the new union (see Technical Details), and mention in the page blurb that `nav`
  and `footer` are page chrome whose position in the list does not affect the page.
- `src/app/admin/(sections)/content/banners/page.tsx` (430 lines) — show the active `home_hero` count
  against `MAX_HERO_BANNERS`, per locale.
- `src/app/api/admin/content/banners/route.ts` — enforce the cap in `POST`.
- `src/app/api/admin/content/banners/[id]/route.ts` — enforce the cap in `PATCH`, including the
  partial `{ isActive: true }` patch the table's checkbox sends.

## Technical Details

### House rules this task must follow (all already true of the files being edited)

- **No server actions.** `"use server"` appears nowhere in this repo and neither does
  `revalidatePath`/`revalidateTag`. Every admin page is `"use client"`, `fetch`es a REST route under
  `src/app/api/admin/**`, and after a mutation closes its dialog and bumps a local `reloadToken`
  counter to re-run the list fetch.
- **No validation library.** Hand-rolled `parse*` helpers returning `{ value } | { error }` (or
  `{ data } | { error }`), turned into a `400` by the route.
- Every route restates its gate locally:
  `const ALLOWED_ROLES: readonly AdminRole[] = ["SUPER_ADMIN", "CONTENT_MANAGER"];` then
  `const authorized = await authorizeAdminApi(ALLOWED_ROLES); if (!authorized.ok) return authorized.response;`
- Every mutation calls
  `writeAuditLog({ actorId: authorized.context.actorId, action, entityType, entityId, metadata })`
  with a dotted action name, deliberately **not** wrapped in try/catch.
- List pages import their row type *type-only* from the route that produces it
  (`import type { AdminBannerRow } from "@/app/api/admin/content/banners/route"`).
- Form dialogs take a discriminated target from the parent, are mounted only while a target exists,
  and are `key`ed by it so no reset effects are needed.

The banner actions already exist and keep their names: `banner.create`, `banner.update`,
`banner.delete`. No new audit actions are introduced by this task.

### Part 1 — the section form dialog

#### 1a. Replace the fifteen `useState` drafts with one keyed draft record

The dialog currently holds one `useState` per type (`hero`, `categoryTiles`, `vehicleTypes`,
`howItWorks`, `faq`, `driverCta`) so that flipping the type picker to look at another shape and back
does not discard what was typed. That behaviour is deliberate and must be preserved — but fifteen
`useState` calls and a fifteen-arm `currentContent()` switch is not. Collapse them into one record
keyed by section type:

```ts
const [drafts, setDrafts] = useState<HomePageSectionContentByType>(() => ({
  ...DEFAULT_HOME_PAGE_CONTENT,
  // The row being edited overrides only its own type's draft; every other type
  // starts from the copy currently on the public page, so a new section is
  // pre-filled with something real to edit rather than empty boxes.
  ...(existing ? { [existing.type]: existing.content } : {}),
}));

/** Replaces one type's draft, leaving every other type's untouched. */
function updateDraft<Type extends HomePageSectionType>(
  type: Type,
  next: HomePageSectionContentByType[Type],
) {
  setDrafts((current) => ({ ...current, [type]: next }));
}
```

`currentContent()` then becomes `drafts[type]`, typed as the `HomePageSectionContent` union, which is
exactly what `parseHomePageSection(type, content)` takes. Inside each sub-form, `drafts.stats`,
`drafts.footer` etc. are narrowed to that type's exact shape by the key, so no casts are needed.

A lazy initializer (`useState(() => …)`) rather than a computed value: the object is built once per
mount, and the parent already keys the dialog by target so a different row is a different mount.

#### 1b. A repeatable-list editor with reorder

The dialog already has `RepeatableEntry` (a bordered frame with a **Remove** button), `replaceAt` and
`removeAt`. It has **no reorder**, and several new shapes are order-significant (stats tiles read
left to right, footer columns read left to right, nav links read in order). Add:

```ts
/**
 * Moves one entry of a repeatable list by one position. Returns the list
 * unchanged when the move would run off either end, so the caller does not have
 * to bounds-check before calling.
 */
function moveAt<Item>(items: Item[], index: number, direction: -1 | 1): Item[] {
  const target = index + direction;

  if (target < 0 || target >= items.length) {
    return items;
  }

  const next = [...items];
  const [moved] = next.splice(index, 1);
  // `splice` on an in-range index always removes one element; the guard is what
  // says so to the compiler, which types the read as possibly undefined.
  if (moved === undefined) {
    return items;
  }
  next.splice(target, 0, moved);

  return next;
}
```

Extend `RepeatableEntry` with `onMoveUp`/`onMoveDown` (both optional, and rendered `disabled` at the
ends) so the control row reads `↑ ↓ … Remove`. Match the up/down button treatment the sections table
already uses at `src/app/admin/(sections)/content/home-page/page.tsx:449-470`:
`<Button variant="outline" size="sm" aria-label="Move … up">↑</Button>`. Keep `aria-label`s specific
("Move stat 2 up", not "Move up") — there are several of these lists in one dialog.

Keep the existing `key={index}` convention and its comment: two entries may hold identical text, and
the list is only ever edited through these controls.

**Every field needs a unique `id`.** The existing sub-forms use `id={`step-title-${index}`}`. Nested
lists need both indices: `id={`footer-col-${columnIndex}-link-${linkIndex}-label`}`. Duplicate ids
break the `<Label htmlFor>` association and are the easiest thing to get wrong here.

Keep the dialog scrollable — `DialogContent` already carries
`className="max-h-[85vh] overflow-y-auto sm:max-w-2xl"`. The footer sub-form is the tallest; widening
to `sm:max-w-3xl` is acceptable if the nested rows are cramped, but do not remove `max-h-[85vh]`.

#### 1c. One sub-form per new type

Follow the existing pattern exactly: a `{type === "…" ? ( … ) : null}` block using `TextField` /
`TextAreaField` for scalars and `RepeatableEntry` for lists.

**Derive the field list from `HomePageSectionContentByType` in `src/lib/admin/home-page-content.ts`,
not from this table** — task-02 owns those shapes and this task compiles against them. As task-02
specifies them, the shapes are:

| Type | Scalar fields | Repeatable list(s) |
| --- | --- | --- |
| `hero` *(edit the existing sub-form)* | `eyebrow`, `headline`, `subtext`, `primaryCtaLabel/Href`, `secondaryCtaLabel/Href`, optional `statusChipText`, `statusChipTag` | none |
| `hero_carousel` | optional `fallbackCaption` only | none — the slides are `home_hero` `Banner` rows, each slide's caption is that banner's `title` |
| `partner_marquee` | `eyebrow` | none — the logos are `home_partner_logo` `Banner` rows |
| `stats` | none at all | **Tiles** (`value`, `label`) |
| `bento` | `eyebrow`, `heading`, `body`, plus the nested `trackingPanel` object (`orderLabel`, `etaLabel`, `progressPercent`, `fromLabel`, `toLabel`) | **`sideCards`** and **`rowCards`** — two separate lists of `BentoCard` (`eyebrow`, `title`, `body`, optional `linkLabel`/`linkHref`) |
| `quote_calculator` | `eyebrow`, `heading`, `intro` | none — the widget is live |
| `how_it_works` *(edit the existing sub-form)* | `eyebrow`, `heading`, optional `aside` | **Steps** (`title`, `body`) — already built |
| `vehicle_types` *(edit the existing sub-form)* | `eyebrow`, `heading`, optional `intro`, optional `businessPanel` object | none |
| `driver_cta` *(edit the existing sub-form)* | `eyebrow`, `headline`, `subtext`, `ctaLabel`, optional `secondaryCtaLabel`/`secondaryCtaHref`, optional **`imageUrl`** | **Points** (plain strings) — already built |
| `coverage` | `eyebrow`, `heading`, `body`, `ctaLabel`, `ctaHref` | **Cities** (`name`, `tier`) |
| `faq` *(edit the existing sub-form)* | `eyebrow`, `heading`, `intro`, optional `supportLinkLabel`/`supportLinkHref` | **Items** (`question`, `answer`) — already built |
| `closing_cta` | `heading`, `body`, `primaryCtaLabel/Href`, `secondaryCtaLabel/Href` | none |
| `nav` | `wordmark`, `signInLabel`, `signInHref`, `signUpLabel`, `signUpHref` | **`links`** (`label`, `href`) |
| `footer` | `brandName`, `brandBlurb`, `copyright` | **`columns`** (`title`) → each with a nested **`links`** list; and a second flat **`legalLinks`** list |

Four of these need more than a text box:

- **`driver_cta.imageUrl`** — the courier/driver photograph filling the panel's right column. Use
  task-04's `AdminImageUpload` here too, exactly as the banner form does. This makes the section dialog
  the second consumer of that component; it is optional, so an empty value must be sent as omitted (or
  as whatever "absent" the parser expects), not as `""`.
- **`bento.trackingPanel.progressPercent`** — task-02 flags it as *the only non-string field in the
  whole contract*. Render it as `<Input type="number" min={0} max={100} step={1}>` held as a string in
  state and parsed on submit (the same pattern the `sortOrder` field already uses so the box can be
  cleared while typing), and range-check it client-side before calling `parseHomePageSection`.
- **`bento`'s two card lists** — `sideCards` (row A, right column, two cards) and `rowCards` (row B,
  three cards) are separate arrays because the two rows have different card sizes and grid tracks.
  Render them as two separately-labelled repeaters, not one merged list, and say in a hint which row
  each feeds.
- **`footer.columns`** — the nested case: a repeater of columns, each containing its own repeater of
  links. `legalLinks` is a third, flat list for the bottom bar.

Optional fields (`statusChipText`, `aside`, `intro`, `businessPanel`, `secondaryCta*`,
`supportLink*`, `fallbackCaption`, `linkLabel`/`linkHref`) still get a field in the form — "optional"
means the parser tolerates absence, not that an editor cannot set it. Send an empty box as absent
rather than as an empty string, since task-02's `readStrings` rejects empty strings for required keys
and the optional readers will do the same.

`hero.headlineHighlight` is marked `@deprecated` by task-02 — kept only so pre-existing rows survive
validation. **Do not give it a field.** Saving an old hero row through this form drops it, which is
the intended retirement path.

`footer.copyright` supports a literal `{year}` token that the renderer substitutes with the current
year. Say so in a hint under the field — otherwise the first editor to see it will "fix" it to `2026`.

Plus hints where a field is not what it looks like:

- `hero_carousel` and `partner_marquee` carry framing copy only. Add
  `<p className="text-xs text-muted-foreground">` under the sub-form saying the slides/logos come from
  Banners at the `home_hero` / `home_partner_logo` placement, edited under **Content → Banners**, and
  that the carousel shows at most {MAX_HERO_BANNERS} of them. This is the same convention the existing
  `vehicle_types` and `category_tiles` sub-forms use for taxonomy-driven content.
- `quote_calculator` is the live pricing widget; only its framing copy is editable.
- `coverage` cities are free text, **not** the `GeorgianCity` enum, and the tier ("Same hour" /
  "Scheduled") is content, not data — there is no service-tier field anywhere in the schema. Say so in
  a hint so nobody wires it to the enum later.
- `nav` and `footer` are page chrome: task-14 pulls them out of the section list *by type* and renders
  them outside the ordered loop, so their sort order does not move anything. Say that in the sub-form.

#### 1d. Things that will not compile until you fix them

- `currentContent()` — an exhaustive switch over `HomePageSectionType`. Replaced by `drafts[type]`
  per 1a.
- `summarize()` in `src/app/admin/(sections)/content/home-page/page.tsx:66-82`. Its `default:` arm
  returns `parsed.data.content.heading`, which does not exist on `nav`, `footer`, `stats` or
  `closing_cta`. Rewrite it as a full switch over `parsed.data.type` returning the most useful single
  line per type: `nav` → the wordmark; `footer` → the brand name; `stats` → the tile values joined by
  ` · ` (it has no heading and no eyebrow — its only field is `items`); `closing_cta` → the heading;
  `partner_marquee` → the eyebrow; `hero_carousel` → a fixed "Slides come from Banners
  (`home_hero`)", since its only field is an optional `fallbackCaption`. Do not reintroduce a
  `default:` arm — the exhaustive switch is what makes the next added type a compile error here rather
  than a runtime surprise.
- The type `<Select>` is driven by `HOME_PAGE_SECTION_TYPES` and needs no change; every new type
  appears automatically once task-02 lands.

### Part 2 — the banner form

Replace the Image URL block at `banner-form-dialog.tsx:298-308` with `AdminImageUpload`, controlled
by the existing `imageUrl` state. Keep:

- `required` semantics — the routes reject an empty `imageUrl`, so the submit path must still refuse
  an empty value with a message rather than posting and taking a 400.
- The URL escape hatch. task-04's component ships one; if it needs to be enabled by a prop, enable it.
  A content manager pasting a URL is a supported flow, not a fallback for a broken bucket, and it is
  the only flow that works before the `site-media` bucket is created by hand.
- `disabled={pending}` while the save is in flight.

Placement suggestions: import the constants rather than restating literals —

```ts
import {
  HOME_HERO_BANNER_PLACEMENT,
  HOME_PARTNER_LOGO_BANNER_PLACEMENT,
  HOME_SECONDARY_BANNER_PLACEMENT,
  MAX_HERO_BANNERS,
} from "@/lib/admin/home-page-content";

const DEFAULT_PLACEMENT = HOME_HERO_BANNER_PLACEMENT;
const PLACEMENT_SUGGESTIONS = [
  HOME_HERO_BANNER_PLACEMENT,
  HOME_SECONDARY_BANNER_PLACEMENT,
  HOME_PARTNER_LOGO_BANNER_PLACEMENT,
];
```

The field stays a free-text `<Input list={PLACEMENT_LIST_ID}>` with a `<datalist>`. **Do not turn it
into a `<Select>`.** `Banner.placement` is a free-form key by design (see the model doc in
`prisma/schema.prisma:922`) precisely so adding a slot is a content change, not a code change; the
existing comment at `banner-form-dialog.tsx:38-43` says so and must survive.

Add a hint under the placement field: `home_hero` feeds the homepage carousel (max
{MAX_HERO_BANNERS} active per locale), `home_partner_logo` feeds the partner marquee,
`home_secondary` is the legacy inline slot.

### Part 3 — the `MAX_HERO_BANNERS` cap

Today nothing stops a seventh active `home_hero` banner. It saves, the carousel silently drops it,
and the editor has no way to find out. Enforce it server-side, in both write paths.

Create `src/app/api/admin/content/banners/validation.ts`:

```ts
import { HOME_HERO_BANNER_PLACEMENT, MAX_HERO_BANNERS } from "@/lib/admin/home-page-content";
import { prisma } from "@/lib/prisma";
import type { ContentLocale } from "@prisma/client";

/**
 * Whether one more active hero banner would fit in a locale's carousel.
 *
 * The landing carousel renders at most `MAX_HERO_BANNERS` slides, so a seventh
 * active `home_hero` banner is invisible: it saves cleanly and does nothing,
 * which is the one failure a content editor cannot debug from the UI. This is
 * the guard that turns it into a message.
 *
 * Counted on `isActive` alone, ignoring `startsAt`/`endsAt`: a window-aware
 * count would happily accept twelve banners whose windows overlap and put the
 * page right back where it started, and the display window is a scheduling
 * tool, not a slot reservation. Excluding `ignoreId` is what lets an existing
 * hero banner be edited without counting itself.
 *
 * Returns `null` when there is room, or the message to return with a 409.
 */
export async function checkHeroBannerCapacity({
  locale,
  placement,
  isActive,
  ignoreId,
}: {
  locale: ContentLocale;
  placement: string;
  isActive: boolean;
  ignoreId?: string;
}): Promise<string | null> {
  if (!isActive || placement !== HOME_HERO_BANNER_PLACEMENT) {
    return null;
  }

  const active = await prisma.banner.count({
    where: {
      locale,
      placement: HOME_HERO_BANNER_PLACEMENT,
      isActive: true,
      ...(ignoreId === undefined ? {} : { id: { not: ignoreId } }),
    },
  });

  if (active < MAX_HERO_BANNERS) {
    return null;
  }

  return (
    `The ${locale} hero carousel already has ${MAX_HERO_BANNERS} active banners, ` +
    `which is the maximum it can show. Switch one off before adding another.`
  );
}
```

Wire it in:

- **`POST /api/admin/content/banners`** — after `parseCreateBannerBody` succeeds and before
  `prisma.banner.create`, call it with the parsed `locale`, `placement`, `isActive` and no
  `ignoreId`.
- **`PATCH /api/admin/content/banners/[id]`** — after `parseUpdateBannerBody` succeeds and before
  `prisma.banner.update`. The patch is genuinely partial, so compute the values the row will **end up
  with**, exactly the way the existing `startsAt`/`endsAt` window check does:
  `const nextLocale = data.locale ?? existing.locale`, likewise `placement` and `isActive`. Pass
  `ignoreId: id`. **This path is the one that matters most**: the banners table's Active checkbox
  sends `{ isActive: true }` on its own, and that is how a seventh hero banner would otherwise get
  switched on.

Respond `409` with `{ error: message }` — the body is well-formed, the conflict is with other rows,
and both the dialog and the table already surface any non-ok response's `{ error }` through their
`readErrorMessage` helpers, so no client change is required to display it.

The cap is an authoring guard, not a render invariant: the carousel still slices to
`MAX_HERO_BANNERS` on the public side (task-06 owns that), because scheduled windows and direct
database edits can still produce more.

### Part 4 — the count in the banners list

`src/app/admin/(sections)/content/banners/page.tsx` lists every locale in one unpaginated table.
Above it (next to the existing description paragraph), render a summary derived from the already
loaded `banners` — no new endpoint, no second fetch:

- For each `ContentLocale` that has at least one `home_hero` banner, a line reading
  `Hero carousel · Georgian: 4 of 6 active`.
- At the cap, mark it — a `<Badge variant="outline">` reading `Full`, or `text-destructive` on the
  count. Something visible, so the editor learns the rule before hitting the 409.

Import `MAX_HERO_BANNERS` and `HOME_HERO_BANNER_PLACEMENT` from `@/lib/admin/home-page-content`; the
module is dependency-free and safe in a client bundle.

### API Endpoints

No new endpoints. Changed behaviour only:

- `POST /api/admin/content/banners` — now `409 { error }` when the locale already has
  `MAX_HERO_BANNERS` active `home_hero` banners.
- `PATCH /api/admin/content/banners/[id]` — same, evaluated against the row's post-patch
  locale/placement/active state, excluding itself.
- `POST /api/admin/content/home-page-sections` and `PATCH .../[id]` — unchanged code, but they now
  accept every new type for free, because they delegate `(type, content)` validation to
  `parseHomePageSection`.

## Acceptance Criteria

- [ ] Every value in `HOME_PAGE_SECTION_TYPES` has a working sub-form in
      `HomePageSectionFormDialog`; selecting each type in turn renders fields, and switching away and
      back preserves what was typed.
- [ ] Repeatable lists (stats tiles, bento cards, coverage cities, FAQ items, how-it-works steps,
      driver bullets, nav links, footer columns and their nested links) support add, remove and
      reorder, with the ↑/↓ buttons disabled at the ends.
- [ ] Every input in the dialog has a unique `id` matched by its `<Label htmlFor>`, including inside
      nested footer link rows.
- [ ] The `driver_cta` sub-form uploads the driver photograph through `AdminImageUpload` and stores the
      resulting URL in `imageUrl`; leaving it empty saves the section without the field.
- [ ] `bento.trackingPanel.progressPercent` accepts only a whole number 0–100, and a bad value is named
      in the form rather than coming back as a 400.
- [ ] Creating one section of every type, then reloading `/admin/content/home-page`, shows a sensible
      one-line summary for each row and no "Content does not match this type" cell.
- [ ] The banner form uploads a file from the machine and stores the resulting public URL; pasting a
      URL still works; both paths save and the image renders in the admin table thumbnail.
- [ ] `home_partner_logo` appears in the placement suggestions and saves without a code change.
- [ ] With 6 active `home_hero` banners in a locale: creating a seventh returns 409 with a readable
      message; switching a seventh on from the table checkbox returns the same 409; editing one of the
      existing six (e.g. changing its title) still saves.
- [ ] Deactivating one of the six frees a slot immediately.
- [ ] The banners page shows the active hero count against the cap, per locale.
- [ ] `pnpm check` (lint + typecheck) passes.

## Notes

- **The dialog is edited, never rewritten.** Its header comment explains three decisions worth
  keeping: the per-type draft, the `parseHomePageSection` pre-check so an empty field is named in the
  form instead of coming back as a 400, and the "holds no `open` state, the parent keys it" contract.
  Preserve all three, and the comments that explain them.
- **The two banner route modules duplicate their field validation on purpose** (the comment at the
  top of `[id]/route.ts` says why: a `route.ts` is a Next.js entry point and must not import runtime
  values from another one). Do not "fix" that duplication in this task. The new `validation.ts` is a
  plain sibling module — not a route — which is the same shape as
  `src/app/api/admin/content/pages/validation.ts`, and it holds a database count that would be genuinely
  wrong to write twice.
- `MAX_TITLE_LENGTH`, `MAX_PLACEMENT_LENGTH`, `MAX_URL_LENGTH`, `MIN_SORT_ORDER` and `MAX_SORT_ORDER`
  are restated in both banner routes and in the form. Leave them alone.
- No rich-text editor. Section copy stays plain-text fields, consistent with the rest of the admin
  (see `requirements.md` non-goals).
- `ContentLocale` is `KA | EN` only. Do not add a third.
- Debug on the right host: the back office is `admin.localhost:3000`, and `package.json`'s
  `"dev": "next dev -H ::"` is load-bearing — without `-H ::` the cross-host redirects collapse into
  `ERR_TOO_MANY_REDIRECTS`.
- Image upload fails at runtime until a human creates the public `site-media` bucket in the Supabase
  dashboard (`action-required.md`, "Before Implementation"). Buckets are never provisioned in code in
  this project. task-04's component degrades to URL-only when Storage is unconfigured, so this does not
  block the task — but it does mean the upload half cannot be verified end-to-end locally without the
  bucket and `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `NEXT_PUBLIC_SUPABASE_URL` /
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` set.
