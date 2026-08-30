# Task 08: Bento feature grid and the numbered how-it-works list

## Status

complete

## Wave

2

## Description

Builds two adjacent sections of the redesigned marketing homepage: a new **bento feature grid** (design handoff section 6) that sells the product's four differentiators in a three-row card mosaic anchored by a large accent-tinted "live tracking" card with a mock tracking panel, and a **rewritten how-it-works list** (design handoff section 7) that replaces today's three boxed step cards with a full-width numbered list of ruled rows.

Both sections are pure presentation over CMS content — no data fetching, no client state, so both are server components. Every visible string (including the mock tracking panel's order label, ETA, addresses and progress percentage) comes from the `bento` and `how_it_works` `HomePageSection` content types, falling back to `DEFAULT_HOME_PAGE_CONTENT` when the locale has no rows, which is the normal state until task-15 seeds the database.

The section files are self-contained: this task does not touch `landing-page.tsx`. Task-14 imports and composes them.

## Dependencies

**Depends on:** `task-01-theme-tokens-and-toggle.md`, `task-02-cms-content-contract.md`
**Blocks:** `task-14-page-composition.md`

**Context from dependencies:**

**task-01** adds a `.dark`-scoped landing palette to `src/app/globals.css` and exposes it through `@theme inline`. The app declares `@custom-variant dark (&:is(.dark *))` at line 5 of `globals.css` but nothing has ever set `.dark` — task-01 is what lights it up, along with a persisted, flash-free toggle in the nav pill. The consequence for this task is the single most important constraint in it: **the page has two themes, so you may never hardcode a dark `rgba()` value.** Every colour in the handoff is a token.

The tokens task-01 exposes, and the handoff value each one carries in the dark theme:

| Utility | Dark value | Role |
|---|---|---|
| `bg-ink` | `#08090A` | Page background |
| `text-paper` | `#F4F4F2` | Primary text / foreground |
| `bg-surface` | `rgba(255,255,255,0.04)` | Cards, chips, tiles |
| `bg-surface-sunken` | `rgba(8,9,10,0.55)` | The mock tracking panel |
| `bg-glass` | `rgba(16,18,20,0.72)` | Nav pill (not used here) |
| `border-line` | `rgba(255,255,255,0.08)` | Card borders |
| `border-line-strong` | `rgba(255,255,255,0.12)`–`0.18` | Row rules, frames |
| `text-accent` / `bg-accent` | `#F58220` | Eyebrows, numbers, progress bar |
| `text-accent-hover` | `#FFA45C` | Link hover |
| `bg-surface-raised` | `rgba(255,255,255,0.06)` | Secondary button |
| `text-on-accent` / `bg-on-accent` | `#0A0B0A` | Text on an orange button |

**Translating the handoff's greyed text, rules and gradients.** The handoff writes body copy as `rgba(244,244,242,0.55)` and card borders as `rgba(255,255,255,0.08)`. **Do not express these as opacity modifiers on `text-paper` / `border-paper`.** task-01 ships a named token for every tier, because the light theme needs a warmer, more opaque value than a plain alpha of near-black would give — and because a component must never branch on the theme in TSX:

| Handoff value | Utility | Role |
|---|---|---|
| `rgba(244,244,242,0.62)` | `text-subtle` | Lead / secondary copy |
| `rgba(244,244,242,0.55)` | `text-muted` | Body copy |
| `rgba(244,244,242,0.42)` | `text-faint` | Eyebrows, meta |
| `rgba(244,244,242,0.36)` | `text-faintest` | Smallest meta |
| `rgba(255,255,255,0.07)` | `border-line-hairline` | Inner dividers |
| `rgba(255,255,255,0.08)` | `border-line` | Card borders |
| `rgba(255,255,255,0.12)` | `border-line-strong` | Row rules, panel borders |
| `rgba(255,255,255,0.18)` | `border-line-stronger` | Frames, arrows |
| `rgba(245,130,32,0.22)` | `border-line-accent` | Accent card borders |
| `rgba(245,130,32,0.28)` | `border-line-accent-strong` | CTA panel border |

Every `--color-*` name yields `bg-*` and `text-*` utilities as well as `border-*`, so a 1px rule drawn as a filled element is `bg-line-strong`, not a bordered one.

The handoff's four named gradients and three shadows are also tokens, declared per theme, so a component never writes a colour stop of its own:

| Handoff gradient / shadow | Utility |
|---|---|
| Accent card — `linear-gradient(160deg, rgba(245,130,32,0.14), rgba(255,255,255,0.03) 46%)` | `bg-[image:var(--landing-gradient-accent-card)]` |
| Coverage card — `linear-gradient(160deg, rgba(245,130,32,0.12), rgba(255,255,255,0.03) 50%)` | `bg-[image:var(--landing-gradient-coverage-card)]` |
| CTA panel — `linear-gradient(150deg, rgba(245,130,32,0.2), rgba(255,255,255,0.03) 58%)` | `bg-[image:var(--landing-gradient-cta-panel)]` |
| Hero spotlight | `bg-[image:var(--landing-gradient-spotlight)]` |
| Carousel frame shadow | `shadow-frame` |
| Nav pill shadow | `shadow-pill` |
| Primary CTA glow — `0 10px 30px rgba(245,130,32,0.28)` | `shadow-cta` |
| `backdrop-filter: blur(18px) saturate(140%)` | `backdrop-blur-glass` |

Opacity modifiers on `accent` itself (`bg-accent/10`, `text-accent/40`, `hover:border-accent/40`) are fine — `--color-accent` flips per theme, so the tint flips with it.

If task-01 shipped a token under a different name than the table above, **use the name it actually shipped** — read the `@theme inline` block in `src/app/globals.css` first and map by role, not by guessing. Do not add tokens of your own to `globals.css`; task-01 owns that file and this task must not edit it.

**task-02** extends `src/lib/admin/home-page-content.ts` — the dependency-free shared contract (no Prisma, no `server-only`, because client landing components import it directly). It adds the new section types to `HOME_PAGE_SECTION_TYPES`, a content type per section in `HomePageSectionContentByType`, a `parse*Content` validator, and default copy in `DEFAULT_HOME_PAGE_CONTENT`. This task consumes two of them:

```ts
/** One small bento card. */
export type BentoCard = {
  eyebrow: string;
  title: string;
  body: string;
};

export type BentoContent = {
  eyebrow: string;
  heading: string;
  /** Row A, left — the large accent-tinted card. */
  featureEyebrow: string;
  featureTitle: string;
  featureBody: string;
  /** The mock tracking panel inside the large card. */
  trackingOrderLabel: string;
  trackingEta: string;
  /** 0–100. Drives the width of the progress bar. */
  trackingProgressPercent: number;
  trackingFrom: string;
  trackingTo: string;
  /** Row A, right — stacked. Seeded with 2. */
  sideCards: BentoCard[];
  /** Row B — the wide card row. Seeded with 3. */
  rowCards: BentoCard[];
};
```

and the **existing, unchanged** `HowItWorksContent`:

```ts
export type HowItWorksStep = { title: string; body: string };

export type HowItWorksContent = {
  eyebrow: string;
  heading: string;
  /** The short paragraph set opposite the heading. */
  aside: string;
  /** Steps in order; the displayed number is the position, not a field. */
  steps: HowItWorksStep[];
};
```

task-02 reseeds `DEFAULT_HOME_PAGE_CONTENT.how_it_works.steps` with **four** entries (the handoff's four; today's default has three) and adapts the copy to the freight product. Do not hardcode four steps — map over `content.steps` so the section stays correct whatever a content manager saves.

**Verify the shapes before you write JSX.** Open `src/lib/admin/home-page-content.ts` and read the types task-02 actually landed. If a field name differs from the block above, follow the shipped type and adjust your field references — do not edit `home-page-content.ts` to match this file. task-02 owns it, and another Wave 2 task is editing it concurrently is *not* true (task-02 is Wave 1 and is finished), but it is still a shared contract file that this task has no business modifying.

## Files to Create

- `src/components/landing/landing-bento.tsx` — the bento feature grid (design handoff section 6). Server component.

## Files to Modify

- `src/components/landing/landing-how-it-works.tsx` — rewritten from the current 65-line boxed-card layout to the handoff's ruled numbered list (design handoff section 7). Stays a server component; keeps its index-derived numbering.

## Technical Details

### Read these first

1. `UI:UX/homepage/design_handoff_georgia_homepage/README.md`, sections **6. Bento feature grid** (line 160) and **7. How it works** (line 191), plus **Responsive behaviour** (line 386), **Design Tokens → Spacing / Radius / Typography** (line 417 onward) and **Known prototype-only compromises** (line 556).
2. `src/components/landing/landing-how-it-works.tsx` — all 65 lines. It is the file you are rewriting.
3. `src/app/globals.css` — the `@theme inline` block, to confirm the token names task-01 shipped.
4. `src/lib/admin/home-page-content.ts` — the `BentoContent` and `HowItWorksContent` types and their defaults.

### What the current `landing-how-it-works.tsx` does, and what must survive

It is a plain (non-`"use client"`) server component that takes `content?: HowItWorksContent` defaulted to `DEFAULT_HOME_PAGE_CONTENT.how_it_works`, renders an eyebrow, an H2, the `aside` paragraph opposite it, and an `<ol>` of three cards. **The one behavioural property that is load-bearing and must be preserved verbatim** is documented in its own header comment:

> A step's displayed number is its position in the list rather than a field, so reordering or removing a step in the admin form can never leave the sequence reading 1, 2, 4.

So: the number is `index + 1`, never a `content` field, and the list is keyed by `index` (with the existing comment explaining why — two steps are free to share a title, and the list is static for the lifetime of the render). Carry both the property and an equivalent explanatory comment into the rewrite. Everything else — the card chrome, the rounded orange number badge, the `hover:-translate-y-1`, the `border-b border-line bg-surface` section shell, the `#how-it-works` id — is replaced.

### Universal rules for both sections

These apply to every landing section in this redesign. They are repeated in each Wave 2 task on purpose.

- **Tailwind v4 utilities only.** There is no `tailwind.config.*`; tokens live in `src/app/globals.css` under `@theme inline`. **No `style={{ ... }}` inline styles anywhere.** The handoff's prototype uses inline styles only because its preview renderer requires it (`README.md` line 556, compromise #4) — that is explicitly listed as a prototype-only compromise not to carry over.
- **No hardcoded dark `rgba()` values.** Both themes must work. Use the tokens above.
- **No media queries.** Everything is fluid: `clamp()` for type and spacing, `grid auto-fit` / `flex-wrap` for layout (handoff line 387).
- **Equal-width card rows are CSS Grid, never flex.** The handoff calls this out as a lesson learned (line 389): use `grid-template-columns: repeat(auto-fit, minmax(Xpx, 1fr))`, **not** `flex: 1 1 Xpx`. A wrapped flex item with `flex-grow: 1` inflates to the full row width and reads as a broken layout. In Tailwind: `grid gap-[14px] [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]`.
  - The one exception in this task is **bento Row A**, which is a *two-item asymmetric split* (a large card beside a stack), not an equal-width card row. There, flex-wrap is correct and the inflation failure mode does not apply, because a wrapped item going full width is exactly the intended stacked behaviour. Row A uses `flex flex-wrap gap-[14px]` with `flex-[1_1_420px]` and `flex-[1_1_300px]`, matching the handoff.
- **Section shell.** Each component renders its own `<section>`:
  - vertical padding `clamp(56px, 7vw, 104px)`, horizontal `clamp(20px, 4vw, 48px)` → `px-[clamp(20px,4vw,48px)] py-[clamp(56px,7vw,104px)]`
  - an inner wrapper `mx-auto w-full max-w-[1200px]` (content max width is 1200px)
  - `scroll-mt-28` on any section with an `id`, so the fixed floating nav pill does not cover the heading when an in-page anchor is followed.
- **Scroll reveal.** Task-14 owns the IntersectionObserver. Put `data-reveal` on the top-level block of each section (and, for the bento, on each row) so task-14 can pick them up. Do **not** write the observer, the transition CSS or any hiding styles here — and in particular do not add an `opacity-0` starting state, because task-14's rule is that anything already inside the viewport on load must never be hidden.
- **Typography helpers.** `text-balance` on headings, `text-pretty` on paragraphs (handoff line 466).
- **Fonts.** `font-display` (IBM Plex Sans) for headings and body, `font-price` (IBM Plex Mono) for every mono eyebrow, number, ETA and id. Both are already wired in `src/app/layout.tsx` via `next/font/google`; the handoff's bundled `fonts/*.woff2` are ignored.
- **Card chrome** (used by every card in this task except the accent one): `rounded-3xl` (`1.5rem` = 24px) `bg-surface` `border border-line` `p-[clamp(24px,2.6vw,32px)]`.
- **Card type scale** (handoff line 187, applies to every small bento card):
  - eyebrow — `font-price text-[10.5px] tracking-[.18em] uppercase text-faint`
  - H3 — `text-[18px] font-semibold text-paper`
  - body — `text-[14.5px] leading-[1.6] text-muted`

### Implementation — `src/components/landing/landing-bento.tsx`

Signature, matching the convention every existing landing section uses:

```tsx
import {
  DEFAULT_HOME_PAGE_CONTENT,
  type BentoContent,
} from "@/lib/admin/home-page-content";

export function LandingBento({
  content = DEFAULT_HOME_PAGE_CONTENT.bento,
}: {
  content?: BentoContent;
}) { /* … */ }
```

No `"use client"` — there is no state and no browser API here.

**Structure.** Section shell → optional header (`content.eyebrow` as an accent mono eyebrow, `content.heading` as an H2 at the section scale `clamp(30px, 4.6vw, 62px)` / `leading-none` / `tracking-[-.045em]` / `font-semibold`) → three rows, each `gap: 14px`, stacked with the same 14px gap.

**Row A, left — the large accent-tinted card.** Handoff lines 164–174.

- `flex-[1_1_420px]`, `rounded-3xl`, `p-[clamp(26px,3vw,38px)]`
- background `linear-gradient(160deg, rgba(245,130,32,0.14), rgba(255,255,255,0.03) 46%)` → `bg-[image:var(--landing-gradient-accent-card)]`. task-01 declares this whole `background-image` value once per theme, so the card gets the light restatement for free — never write the colour stops yourself.
- border `1px solid rgba(245,130,32,0.22)` → `border border-line-accent`
- `flex flex-col` so the mock panel can be bottom-pinned with `mt-auto`
- eyebrow: `content.featureEyebrow` in **accent** (`font-price text-[10.5px] tracking-[.18em] uppercase text-accent`) — note this eyebrow is orange, unlike the small cards' faint ones
- H3: `content.featureTitle` at `text-[clamp(22px,2.5vw,32px)] leading-[1.12] tracking-[-.03em] font-semibold text-paper`
- body: `content.featureBody` at the card body scale
- then the mock tracking panel, `mt-auto`

**The mock tracking panel.** `rounded-2xl` (`1rem` = 16px), `bg-surface-sunken`, `px-5 py-[18px]` (`padding: 18px 20px`):

1. A top row, `flex items-baseline justify-between gap-4`: `content.trackingOrderLabel` on the left (14px, `text-subtle`-ish — use `text-[14px] text-subtle`), `content.trackingEta` on the right in `font-price text-accent text-[14px]`.
2. A 4px progress bar: an outer `mt-3.5 h-1 w-full rounded-full bg-line-strong overflow-hidden` and an inner `h-full rounded-full bg-accent` whose width is `content.trackingProgressPercent`.
   - **Width is the one dynamic value that cannot be a static utility class.** Tailwind cannot generate a class from a runtime number. Use a CSS custom property set via the `style` prop *for this single value only* — `style={{ "--bento-progress": `${percent}%` }}` with `className="… w-[var(--bento-progress)]"` — or, equivalently, `style={{ width: `${percent}%` }}`. This is the sole permitted use of the `style` prop in this task, because it carries data, not design. Every colour, radius and height around it stays a utility.
   - **Clamp defensively in the component** regardless of what the parser guarantees: `const percent = Math.min(100, Math.max(0, content.trackingProgressPercent));`. A `Json` column can be edited straight in the database, and a negative or >100 value must not paint outside the track.
   - Give the bar `role="progressbar"` with `aria-valuenow={percent}` `aria-valuemin={0}` `aria-valuemax={100}` and an `aria-label` describing it as an illustration, or mark the whole panel `aria-hidden="true"`. **Prefer `aria-hidden="true"` on the entire mock panel** — it is decorative product art depicting a fictional order, not live status, and announcing a fake order id and ETA to a screen reader is worse than silence.
3. A from/to pair at `text-[12px]`, `text-muted`: `content.trackingFrom` then `content.trackingTo`, `mt-3 flex items-center gap-2` with a small accent arrow or dot separator between them.

> ⚠️ **The handoff's mock panel reads "Kwun Tong St, Vake" → "Didube".** Kwun Tong is a Hong Kong district; it is a copy-paste artefact from the source UI kit and **must not ship**. task-02 seeds Georgian street names in `DEFAULT_HOME_PAGE_CONTENT.bento` (`trackingFrom` / `trackingTo`). Render whatever the content type gives you and never reintroduce the handoff's literal string. If the seeded default you find still says "Kwun Tong", stop and fix the default in task-02's file rather than hardcoding around it.

**Row A, right — two stacked cards.** `flex-[1_1_300px] flex flex-col gap-[14px]`. Map `content.sideCards`, each rendered with the standard card chrome and the card type scale. Do not index into the array (`sideCards[0]`, `sideCards[1]`) — map it, so a content manager saving one card or three does not crash the page or silently drop content. Each card is `flex-1` so the pair fills the row's height alongside the tall left card.

The handoff's copy for these two cards ("**20** / Stops per booking", "Business API / Dispatch from your own stack — REST endpoints, webhooks, monthly invoicing in lari" + a "Read the docs →" link) is **not** what ships. This platform does not implement 20-stop bookings or a public REST API — both are on the removed-claims list in `specs/georgia-homepage-redesign/action-required.md`. task-02 seeds replacements. Render the seeded content; do not re-add the handoff's strings, and do not add a "Read the docs" link — `BentoCard` has no href field on purpose.

**Row B — three cards.** This *is* an equal-width card row, so it is a grid:

```
grid gap-[14px] [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]
```

Map `content.rowCards` with the same card chrome and type scale. The handoff's third card claims "Insured up to ₾5,000" — another removed claim; task-02 seeds a replacement.

**Semantics.** The row containers are plain `<div>`s. Each card is an `<article>` or a `<li>` inside a `<ul className="contents">`-free list — simplest correct choice: make Row A right and Row B `<ul>`s with `<li>` children carrying the card chrome, and the large Row A left card an `<article>`. Headings inside cards are `<h3>`, under the section's `<h2>`.

### Implementation — rewriting `src/components/landing/landing-how-it-works.tsx`

Keep the existing props signature and the default-content fallback exactly as they are:

```tsx
export function LandingHowItWorks({
  content = DEFAULT_HOME_PAGE_CONTENT.how_it_works,
}: {
  content?: HowItWorksContent;
}) { /* … */ }
```

**Change the section id from `how-it-works` to `how`** — the redesigned nav links to `#how` (handoff line 191). Task-05 builds the nav pill and task-14 wires it; this task just needs to emit the id the design specifies. Keep `scroll-mt-28`.

**Header.** The handoff shows only an H2. This implementation additionally renders `content.eyebrow` and `content.aside`, because both fields already exist in the shipped `HowItWorksContent` contract and are already populated in `DEFAULT_HOME_PAGE_CONTENT` — dropping them from the markup would orphan CMS fields that the admin form still offers, which is a worse outcome than a two-element deviation from the handoff. Lay them out as:

- eyebrow — `font-price text-[11px] tracking-[.18em] uppercase text-accent`
- H2 — `content.heading` at `text-[clamp(30px,4.6vw,62px)] leading-none tracking-[-.045em] font-semibold text-paper max-w-[20ch] text-balance` (handoff line 192)
- aside — `content.aside` at `text-[16px] leading-[1.6] text-muted max-w-[44ch] text-pretty`, set opposite the heading in a `flex flex-wrap items-end justify-between gap-8` header row (two items, wrap-to-stack — flex is correct here for the same reason as bento Row A)

**The rows.** An `<ol>` with one `<li>` per `content.steps` entry. Each row (handoff lines 194–200):

- `border-t border-line-strong` (the handoff's `1px solid rgba(255,255,255,0.1)`)
- `py-[clamp(24px,2.8vw,34px)]`
- `flex flex-wrap items-baseline gap-[clamp(18px,3vw,44px)]`
- **number** — `font-price text-[13px] tracking-[.1em] text-accent w-11 shrink-0` (44px wide). Value is `String(index + 1).padStart(2, "0")` → `01`, `02`, `03`, `04`; the two-digit form fills the 44px mono slot and matches the tracking the handoff specifies. Mark it `aria-hidden="true"` — it is `<ol>` position restated visually, and a screen reader already numbers the list.
- **title** — `flex-[1_1_260px] text-[clamp(21px,2.4vw,30px)] leading-[1.15] tracking-[-.03em] font-semibold text-paper`, rendered as an `<h3>`
- **body** — `flex-[1_1_320px] text-[15.5px] leading-[1.65] text-muted text-pretty`

The first row's `border-t` is intentional — it separates the list from the header block, matching the handoff's ruled treatment.

Keep `key={index}` on the `<li>` with the existing justification comment, and keep (or restate) the header comment about the number coming from the position rather than a field. The list may be any length; do not assume four.

### Code Snippets

The card chrome and card type scale, as shared constants at the top of `landing-bento.tsx` (the landing page uses zero shadcn primitives — every control is hand-styled, and this is how the other landing components share repeated class strings; see `FIELD_CLASSES` in `landing-quote-calculator.tsx`):

```tsx
const CARD_CLASSES =
  "rounded-3xl border border-line bg-surface p-[clamp(24px,2.6vw,32px)]";

const CARD_EYEBROW_CLASSES =
  "font-price text-[10.5px] tracking-[.18em] text-faint uppercase";

const CARD_TITLE_CLASSES = "mt-3 text-[18px] font-semibold text-paper";

const CARD_BODY_CLASSES =
  "mt-2.5 text-[14.5px] leading-[1.6] text-muted text-pretty";
```

The Row B grid, spelled out so the `auto-fit` rule is unmissable:

```tsx
<ul className="grid gap-[14px] [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
```

The progress bar, the one place a runtime value reaches CSS:

```tsx
const percent = Math.min(100, Math.max(0, content.trackingProgressPercent));

<div className="mt-3.5 h-1 w-full overflow-hidden rounded-full bg-line-strong">
  <div className="h-full rounded-full bg-accent" style={{ width: `${percent}%` }} />
</div>
```

### Environment Variables

None.

### API Endpoints

None. Both sections are static server components.

## Acceptance Criteria

- [ ] `src/components/landing/landing-bento.tsx` exists, exports `LandingBento`, is a server component (no `"use client"`), and takes `content?: BentoContent` defaulted to `DEFAULT_HOME_PAGE_CONTENT.bento`.
- [ ] The bento renders three rows at `gap: 14px`: Row A as a two-item `flex-wrap` split (`flex-[1_1_420px]` large card + `flex-[1_1_300px]` stack of `content.sideCards`), Row B as `grid` with `[grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]` over `content.rowCards`.
- [ ] The large Row A card uses `bg-[image:var(--landing-gradient-accent-card)]`, `border border-line-accent`, `rounded-3xl`, `p-[clamp(26px,3vw,38px)]`, an accent eyebrow, an H3 at `clamp(22px,2.5vw,32px)`, and a bottom-pinned (`mt-auto`) mock panel.
- [ ] The mock panel is `rounded-2xl bg-surface-sunken px-5 py-[18px]`, carries the order label / accent-mono ETA row, a 4px progress bar in `bg-accent` on `bg-line-strong` at `content.trackingProgressPercent` (clamped 0–100), and a 12px from/to pair — and is `aria-hidden="true"`.
- [ ] The mock panel's addresses come from `content.trackingFrom` / `content.trackingTo`. The string "Kwun Tong" appears nowhere in the repo's landing components or in the seeded defaults.
- [ ] Every bento string — including the progress percentage — is read from `content`. No card copy is hardcoded in the component.
- [ ] Card eyebrows are `font-price text-[10.5px] tracking-[.18em] uppercase text-faint`; card H3s are `text-[18px] font-semibold`; card bodies are `text-[14.5px] leading-[1.6] text-muted`.
- [ ] `landing-how-it-works.tsx` renders an H2 at `text-[clamp(30px,4.6vw,62px)] leading-none tracking-[-.045em] font-semibold max-w-[20ch]` and an `<ol>` of ruled rows: `border-t border-line-strong`, `py-[clamp(24px,2.8vw,34px)]`, `gap-[clamp(18px,3vw,44px)]`, `items-baseline`.
- [ ] Each row has a 44px-wide (`w-11`) `font-price text-[13px] tracking-[.1em] text-accent` number, a `clamp(21px,2.4vw,30px)`/600 title and a `15.5px`/`1.65` body.
- [ ] The step number is still derived from the array index, not from a `content` field, and the `<li>` is still keyed by index with an explanatory comment. Removing or reordering a step in the admin cannot produce `1, 2, 4`.
- [ ] The how-it-works section's `id` is `how` (was `how-it-works`), with `scroll-mt-28`.
- [ ] The component renders `content.steps` of any length — four is the seeded default, not an assumption in the code.
- [ ] No `style` attribute anywhere except the single progress-bar width.
- [ ] No hardcoded `rgba(...)`, `#F58220`, `#F4F4F2`, `#08090A` or any other literal colour. Grep the two files for `rgba(` and `#` and confirm only the `--font-*`-free utility classes remain.
- [ ] No `@media` query and no `sm:` / `md:` / `lg:` breakpoint prefixes — layout is `clamp()`, `auto-fit` and `flex-wrap` only.
- [ ] Both sections render correctly in light and dark: toggle the theme (task-01's control, or add `class="dark"` to `<html>` by hand while developing) and confirm no element becomes invisible or loses contrast.
- [ ] `data-reveal` is present on the section-level blocks (and each bento row) for task-14's observer, with no `opacity-0` starting state authored here.
- [ ] `pnpm check` (lint + typecheck) passes.

## Notes

- **Do not touch `src/components/landing/landing-page.tsx`.** Task-14 owns composition, the `LandingSectionRenderer` switch and the section ordering. This task only produces the two section components. Until task-14 lands, `landing-bento.tsx` will be an unreferenced export — that is expected, and `pnpm check` tolerates it (an unused *export* is not an unused variable).
- **Do not touch `src/lib/admin/home-page-content.ts`, `src/app/globals.css`, or `prisma/schema.prisma`.** Those are task-02, task-01 and task-03 respectively. If you find a genuine gap in the contract (a field the design needs and task-02 did not land), report it in your final message rather than patching the shared file — another Wave 2 task may be reading it at the same moment.
- **Do not touch `src/components/home/booking-form.tsx` (1,367 lines) or `src/components/home/route-preview-map.tsx` (522 lines).** Those render the signed-in booking app for CLIENT sessions and are explicitly out of scope for the whole feature.
- **Do not reproduce the prototype's workarounds.** `Home-Georgia-v3.dc.html` assigns `scrollLeft` directly, paints state imperatively via `document.querySelectorAll`, and styles everything inline — all three are documented preview-renderer compromises (`README.md` line 556), not design intent. Production uses state-driven styling, CSS transitions and Tailwind utilities.
- **`<image-slot>` elements in the prototype are drag-and-drop placeholders.** Neither section in this task has one, so nothing to replace here — but do not invent an image area for the bento; the design has none.
- **Claims removed from the handoff's copy.** The handoff's bento and how-it-works text is written for a courier product and asserts things this freight platform does not implement: "20 stops per booking", a public REST API with webhooks, "insured up to ₾5,000", "54s median match time", "usually inside a minute". Per the planning decision these are removed or replaced, and task-02 seeds the replacements in `DEFAULT_HOME_PAGE_CONTENT`. Your job is to render the content type faithfully — if you find yourself typing a marketing claim into a `.tsx` file, something has gone wrong.
- **The existing light landing palette is good enough as the light theme** and is not being redesigned. If a card looks flat in light mode, that is task-01's tuning to make, not yours; report it rather than sprinkling light-only overrides.
- **Sanity-check on the real host.** The landing page renders for signed-out visitors at `localhost:3000` (the CLIENT host). `merchant.localhost:3000` redirects away from `/`. `package.json`'s `"dev": "next dev -H ::"` is load-bearing — without `-H ::` the cross-host redirects collapse into `ERR_TOO_MANY_REDIRECTS`. Do not change that script. `/home` (`src/app/home/page.tsx`, `force-dynamic`) renders the landing page as a staff preview and is a convenient place to look at these sections while signed in.
