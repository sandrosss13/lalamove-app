# Task 10: City coverage, FAQ accordion and closing CTA

## Status

complete

## Wave

2

## Description

Builds the three sections that close the redesigned marketing homepage: a new **city coverage** section (design handoff section 10) pairing an accent-gradient pitch card with a wrapping grid of city chips, a **restyled FAQ accordion** (design handoff section 11), and a new **closing CTA panel** (design handoff section 12).

The FAQ is the sensitive one: `src/components/landing/landing-faq.tsx` already implements a correct single-open accordion — `useId`-derived ids, `aria-expanded`/`aria-controls` wiring, the panel kept in the DOM and hidden with the `hidden` attribute so it always exists for assistive tech, and item 0 open on load with clicking the open item collapsing it. **That accessibility implementation is kept as-is and only the styling changes.** Do not rewrite the state machine.

Coverage is the section where the design and the data diverge hardest: the handoff shows eleven cities split into "Same hour" and "Scheduled" tiers, but the `GeorgianCity` enum has 25 values and carries no service-tier data at all, so the split cannot be computed. Coverage is therefore CMS content, not derived data.

All three sections are self-contained files. This task does not touch `landing-page.tsx`; task-14 composes them.

## Dependencies

**Depends on:** `task-01-theme-tokens-and-toggle.md`, `task-02-cms-content-contract.md`
**Blocks:** `task-14-page-composition.md`

**Context from dependencies:**

**task-01** adds a `.dark`-scoped landing palette to `src/app/globals.css` and exposes it through `@theme inline`. The app declares `@custom-variant dark (&:is(.dark *))` at line 5 of `globals.css` but nothing has ever set `.dark` — task-01 lights it up, with a persisted flash-free toggle in the nav pill. The consequence for this task: **the page has two themes, so you may never hardcode a dark `rgba()` value.** Every colour is a token.

| Utility | Dark value | Role |
|---|---|---|
| `bg-ink` | `#08090A` | Page background |
| `text-paper` | `#F4F4F2` | Primary text / foreground |
| `bg-surface` | `rgba(255,255,255,0.04)` | Cards, chips, accordion items |
| `bg-surface-sunken` | `rgba(8,9,10,0.55)` | Inner sunken panels (not used here) |
| `bg-glass` | `rgba(16,18,20,0.72)` | Nav pill (not used here) |
| `border-line` | `rgba(255,255,255,0.08)` | Card and chip borders |
| `border-line-strong` | `rgba(255,255,255,0.12)`–`0.18` | Panel borders |
| `text-accent` / `bg-accent` | `#F58220` | Eyebrows, `+`/`–` glyph, primary CTA, glow |
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

If task-01 shipped a token under a different name, **use the name it actually shipped** — read the `@theme inline` block in `src/app/globals.css` and map by role. Do not add tokens of your own; task-01 owns that file and this task must not edit it.

**task-02** extends `src/lib/admin/home-page-content.ts` — the dependency-free shared contract (no Prisma, no `server-only`, because client landing components import it directly). It adds the new section types to `HOME_PAGE_SECTION_TYPES`, a content type per section, a `parse*Content` validator and default copy in `DEFAULT_HOME_PAGE_CONTENT`. This task consumes three:

```ts
/** One city chip: the city and the service tier it is offered at. */
export type CoverageCity = {
  name: string;
  /** e.g. "Same hour", "Scheduled", "Intercity". Free text — see notes. */
  tier: string;
};

export type CoverageContent = {
  eyebrow: string;
  heading: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
  cities: CoverageCity[];
};

export type FaqItem = { question: string; answer: string };

export type FaqContent = {
  eyebrow: string;
  heading: string;
  /** The support line under the heading. */
  intro: string;
  /** Inline link that closes the support line. */
  supportLinkLabel: string;
  supportLinkHref: string;
  items: FaqItem[];
};

export type ClosingCtaContent = {
  heading: string;
  body: string;
  primaryCtaLabel: string;
  primaryCtaHref: string;
  secondaryCtaLabel: string;
  secondaryCtaHref: string;
};
```

`FaqContent` already exists today with `eyebrow`, `heading`, `intro` and `items`; task-02 adds `supportLinkLabel` / `supportLinkHref`.

**Verify the shapes before you write JSX.** Open `src/lib/admin/home-page-content.ts` and follow the types task-02 actually landed. If a field name differs, adjust your references — do not edit that shared file to match this document.

## Files to Create

- `src/components/landing/landing-coverage.tsx` — city coverage (design handoff section 10). Server component.
- `src/components/landing/landing-closing-cta.tsx` — the closing CTA panel (design handoff section 12). Server component.

## Files to Modify

- `src/components/landing/landing-faq.tsx` — restyled to the handoff's two-column card accordion (design handoff section 11). **Behaviour and accessibility unchanged.**

## Technical Details

### Read these first

1. `UI:UX/homepage/design_handoff_georgia_homepage/README.md`, sections **10. Coverage** (line 260), **11. FAQ** (line 281) and **12. Closing CTA** (line 311), plus **FAQ accordion** (line 373), **Responsive behaviour** (line 386) and **Design Tokens** (line 417 onward).
2. `src/components/landing/landing-faq.tsx` — **all 101 lines, before you change anything.** It is the file you are restyling.
3. `src/app/globals.css` — the `@theme inline` block, to confirm task-01's token names.
4. `src/lib/admin/home-page-content.ts` — the three content types and their defaults.

### Universal rules for all three sections

Repeated in each Wave 2 task on purpose.

- **Tailwind v4 utilities only.** There is no `tailwind.config.*`; tokens live in `src/app/globals.css` under `@theme inline`. **No `style={{ ... }}` inline styles anywhere in this task.** The prototype uses inline styles only because its preview renderer requires it (handoff line 556, compromise #4) — an explicitly prototype-only compromise.
- **No hardcoded dark `rgba()` values.** Both themes must work.
- **No media queries, no `sm:` / `md:` / `lg:` prefixes.** Everything is fluid: `clamp()` for type and spacing, `grid auto-fit` / `flex-wrap` for layout (handoff line 387).
- **Equal-width card rows are CSS Grid, never flex.** The handoff calls this out as a lesson learned (line 389): use `grid-template-columns: repeat(auto-fit, minmax(Xpx, 1fr))`, **not** `flex: 1 1 Xpx`. A wrapped flex item with `flex-grow: 1` inflates to the full row width and reads as a broken layout. **This bites the city chips**, which the handoff itself specifies as `flex: 1 1 150px` — convert them to a grid (see below). Two-column *panel* splits (coverage's card + chip list, the FAQ's heading column + accordion) stay `flex-wrap`, because there are exactly two items and full-width-when-stacked is the intended behaviour.
- **Section shell.** Each component renders its own `<section>` with `px-[clamp(20px,4vw,48px)] py-[clamp(56px,7vw,104px)]`, an inner `mx-auto w-full max-w-[1200px]`, and `scroll-mt-28` so the fixed nav pill does not cover the heading on an anchor jump.
- **Scroll reveal.** Task-14 owns the IntersectionObserver. Put `data-reveal` on the top-level blocks so task-14 can pick them up. Do not write the observer, the transition CSS, or any `opacity-0` starting state — task-14's rule is that anything already inside the viewport on load must never be hidden.
- **Typography.** `text-balance` on headings, `text-pretty` on paragraphs. `font-display` (IBM Plex Sans) for headings and body, `font-price` (IBM Plex Mono) for eyebrows, tiers and the `+`/`–` glyph — both already wired via `next/font/google` in `src/app/layout.tsx`; the handoff's bundled `fonts/*.woff2` are ignored.

### Implementation — `src/components/landing/landing-coverage.tsx`

Server component. Section `id="coverage"`, `scroll-mt-28`.

```tsx
export function LandingCoverage({
  content = DEFAULT_HOME_PAGE_CONTENT.coverage,
}: {
  content?: CoverageContent;
}) { /* … */ }
```

**Layout** (handoff line 261): two columns, `flex flex-wrap gap-[14px]`.

**Left card** — `flex-[1_1_340px] flex flex-col rounded-3xl p-[clamp(28px,3.2vw,44px)]`:

- background `linear-gradient(160deg, rgba(245,130,32,0.12), rgba(255,255,255,0.03) 50%)` → `bg-[image:var(--landing-gradient-coverage-card)]`. task-01 declares this whole `background-image` value once per theme, so the card gets the light restatement for free — never write the colour stops yourself.
- border `1px solid rgba(255,255,255,0.1)` → `border border-line-strong`
- eyebrow — `content.eyebrow`, `font-price text-[11px] tracking-[.18em] uppercase text-accent`
- H2 — `content.heading` at `text-[clamp(26px,3.4vw,44px)] leading-[1.04] tracking-[-.04em] font-semibold text-paper max-w-[16ch] text-balance`
- body — `content.body` at `text-[16px] leading-[1.6] text-muted text-pretty`
- CTA — an accent pill with `self-start` (the handoff's `align-self: flex-start`, so it hugs its label instead of stretching the column): `<Link href={content.ctaHref} className="mt-auto self-start inline-flex items-center rounded-full bg-accent px-6 py-3 text-[15px] font-semibold text-on-accent transition-transform hover:-translate-y-0.5">{content.ctaLabel}</Link>`. `mt-auto` pins it to the bottom of the card so it lines up with the chip grid's baseline.

**Right column** — `flex-[1_1_360px]`, a wrapping list of city chips:

```tsx
<ul className="grid content-start gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
```

`content-start` is the handoff's `align-content: flex-start`, so a short list sits at the top of the column rather than spreading vertically.

Each chip is an `<li className="rounded-2xl border border-line bg-surface px-5 py-[18px]">` (`border-radius: 1rem` = `rounded-2xl`; `padding: 18px 20px`) containing:

- city name — `text-[16px] font-semibold text-paper`
- tier — `mt-1 font-price text-[10.5px] tracking-[.1em] uppercase text-faint`

Map `content.cities`; key by index (two cities cannot share a name in practice, but the list is static for the lifetime of the render and index-keying matches the convention the rest of the landing components already use for CMS arrays). If `content.cities` is empty, render the left card alone and skip the `<ul>` entirely — an empty section with a heading is better than an empty grid.

> ⚠️ **Cities and tiers are CMS content, not derived data.** Do **not** import `GeorgianCity` from `@prisma/client` and do not map the enum. The enum has 25 values (TBILISI, BATUMI, KUTAISI, RUSTAVI, ZUGDIDI, GORI, POTI, SAMTREDIA, KHASHURI, SENAKI, ZESTAPONI, MARNEULI, TELAVI, AKHALTSIKHE, OZURGETI, KOBULETI, CHIATURA, TSKALTUBO, SAGAREJO, GARDABANI, BOLNISI, AKHALKALAKI, BORJOMI, KASPI, MTSKHETA) and carries **no service-tier field anywhere in the schema**, so the handoff's "Same hour" / "Scheduled" split literally cannot be computed from it. Publishing all 25 as "served" would also be a factual claim nobody has verified. `specs/georgia-homepage-redesign/action-required.md` has an open item asking the user to confirm which cities are actually served and at what tier; task-02 seeds a flagged placeholder list until that lands. Render `content.cities` faithfully and leave the question to the content manager.

### Implementation — restyling `src/components/landing/landing-faq.tsx`

**Read all 101 lines first.** This is a restyle, not a rewrite.

**Keep, unchanged:**

- the `"use client"` directive;
- `const [openIndex, setOpenIndex] = useState<number | null>(0);` — item 0 open on load, `null` meaning all collapsed, and the existing comment explaining why;
- `const idPrefix = useId();` and the derived `${idPrefix}-question-${index}` / `${idPrefix}-answer-${index}` ids;
- `onClick={() => setOpenIndex(isOpen ? null : index)}` — clicking the open item collapses it (the handoff's "index → -1"; `null` is this codebase's equivalent and is already correct — do not switch to `-1`);
- `aria-expanded={isOpen}` and `aria-controls={panelId}` on the trigger `<button type="button" id={buttonId}>`;
- the panel `<div id={panelId} role="region" aria-labelledby={buttonId} hidden={!isOpen}>` — **kept in the DOM and hidden with the attribute**, so the element the button points at always exists for assistive tech. Do not switch to conditional rendering; that would leave `aria-controls` dangling.
- the `<h3>` wrapping the trigger button, so the questions are real headings under the section `<h2>`;
- `key={index}` on each item, with its existing comment (two entries are free to repeat a question, and the open panel is already tracked by index);
- the `content?: FaqContent` prop defaulted to `DEFAULT_HOME_PAGE_CONTENT.faq`.

**Change:** the section shell, the two-column layout, and every class string.

**Layout** (handoff line 282): section `id="faq"`, `scroll-mt-28`, then `flex flex-wrap gap-[clamp(28px,4vw,64px)]`.

**Left column** — `flex-[1_1_280px]`:

- optional accent mono eyebrow from `content.eyebrow`
- H2 — `content.heading` at `text-[clamp(28px,4vw,52px)] leading-[1.02] tracking-[-.045em] font-semibold text-paper text-balance`
- support line — `content.intro` at `text-[15px] leading-[1.6] text-muted text-pretty`, closing with an inline `<Link href={content.supportLinkHref}>` labelled `content.supportLinkLabel` and styled `text-accent underline underline-offset-4 transition-colors hover:text-accent-hover` (the handoff's anchor hover, line 383: `#F58220` → `#FFA45C`).
- Keep the existing `lg:sticky lg:top-24` ONLY if you can express it without a breakpoint prefix — you cannot, and breakpoints are banned in this redesign, so **drop the sticky treatment**. A plain column is correct here.

**Right column** — `flex-[1_1_460px]`, the accordion `<ul className="flex flex-col gap-2.5">` (10px gap).

Each `<li>` is now its own card rather than a ruled row: `rounded-2xl border border-line bg-surface` (`border-radius: 1rem`). Drop the old `border-t`/`border-b` list rules entirely.

The trigger button: `flex w-full items-center justify-between gap-6 px-6 py-5 text-left` (the handoff's `padding: 20px 24px`), with

- the question at `text-[16px] font-semibold text-paper transition-colors group-hover:text-accent` (keep the `group` class on the button);
- **the toggle glyph replaced**: today it is two absolutely-positioned bars whose vertical stroke collapses via `scale-y-0`, with a comment explaining that choice ("collapsing the vertical one is a transition, where swapping characters would be a jump"). The handoff specifies a **mono `+` / `–` at 19px in accent** on the right (line 291). Implement it as `<span aria-hidden="true" className="font-price text-[19px] leading-none text-accent shrink-0">{isOpen ? "–" : "+"}</span>`. Use U+2013 EN DASH (`–`), which is what the handoff prints, not a hyphen. Replace the old comment with a short one noting the design specifies the character pair, so the next reader knows the two-bar version was a considered alternative rather than an oversight.

The answer panel: `px-6 pb-[22px] text-[15px] leading-[1.7] text-muted max-w-[72ch] text-pretty` (the handoff's `padding: 0 24px 22px`). Keep `hidden={!isOpen}`, `role="region"`, `aria-labelledby`.

### Implementation — `src/components/landing/landing-closing-cta.tsx`

Server component. No `id` anchor is specified by the design for this section; give it none (the nav does not link to it).

```tsx
export function LandingClosingCta({
  content = DEFAULT_HOME_PAGE_CONTENT.closing_cta,
}: {
  content?: ClosingCtaContent;
}) { /* … */ }
```

**The panel** (handoff line 312): inside the standard section shell, one centred panel:

- `rounded-[2rem]`
- border `1px solid rgba(245,130,32,0.28)` → `border border-line-accent-strong`
- background `linear-gradient(150deg, rgba(245,130,32,0.2), rgba(255,255,255,0.03) 58%)` → `bg-[image:var(--landing-gradient-cta-panel)]`
- `px-[clamp(26px,4vw,64px)] py-[clamp(40px,6vw,88px)]`
- `flex flex-col items-center text-center gap-6`

Contents:

- H2 — `content.heading` at `text-[clamp(30px,5.2vw,72px)] leading-[.96] tracking-[-.05em] font-semibold text-paper max-w-[20ch] text-balance`
- body — `content.body` at `text-[16.5px] leading-[1.6] text-subtle max-w-[44ch] text-pretty`
- a `flex flex-wrap justify-center gap-3` CTA row:
  - **primary, accent pill with a glow** → `content.primaryCtaHref` / `content.primaryCtaLabel`. Glow is the handoff's `0 10px 30px rgba(245,130,32,0.3)` (line 490, "0.3 on the closing CTA"). task-01 ships one accent-glow token at the handoff's base `0.28` — use `shadow-cta` and do not hand-roll a second shadow for the two-hundredths difference. Full classes: `inline-flex items-center rounded-full bg-accent px-7 py-3.5 text-[15px] font-semibold text-on-accent shadow-cta transition-transform hover:-translate-y-0.5`.
  - **secondary, glass pill** → `content.secondaryCtaHref` / `content.secondaryCtaLabel`, classes `inline-flex items-center rounded-full border border-line-strong bg-surface px-7 py-3.5 text-[15px] font-semibold text-paper transition-colors hover:border-accent/40`

Both CTAs are `next/link`.

> 🚫 **The handoff's closing copy does not ship.** Its H2 is "Your first delivery is twelve seconds away." and its body is "Half price on your first three. No card needed to get a quote." The twelve-second booking claim and the half-price promotion are **not implemented by this platform** — they are on the removed-claims list in `specs/georgia-homepage-redesign/action-required.md` and `requirements.md`. task-02 seeds replacement copy written in the freight voice that `DEFAULT_HOME_PAGE_CONTENT` already uses. Render `content`; never type the handoff's strings into a `.tsx` file, and do not reintroduce them if you see them in a prototype.

### Code Snippets

The city chip grid — the one place the handoff's own spec (`flex: 1 1 150px`) is deliberately overridden, per its own lesson-learned note:

```tsx
<ul className="grid content-start gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
  {content.cities.map((city, index) => (
    <li
      key={index}
      className="rounded-2xl border border-line bg-surface px-5 py-[18px]"
    >
      <p className="text-[16px] font-semibold text-paper">{city.name}</p>
      <p className="mt-1 font-price text-[10.5px] tracking-[.1em] text-faint uppercase">
        {city.tier}
      </p>
    </li>
  ))}
</ul>
```

The FAQ toggle glyph, replacing the current two-bar span:

```tsx
{/* The design specifies a mono +/– pair rather than the animated two-bar
    glyph this component used to draw — a character swap, deliberately. */}
<span
  aria-hidden="true"
  className="shrink-0 font-price text-[19px] leading-none text-accent"
>
  {isOpen ? "–" : "+"}
</span>
```

The closing CTA's glow, split so the colour comes from the accent token:

```tsx
className="… bg-accent text-on-accent shadow-cta …"
```

### Environment Variables

None.

### API Endpoints

None. All three sections are static; the FAQ's only state is component-local.

## Acceptance Criteria

- [ ] `src/components/landing/landing-coverage.tsx` exists, exports `LandingCoverage`, takes `content?: CoverageContent` defaulted to `DEFAULT_HOME_PAGE_CONTENT.coverage`, and has `id="coverage"` with `scroll-mt-28`.
- [ ] Coverage is `flex flex-wrap gap-[14px]` with a `flex-[1_1_340px]` gradient card and a `flex-[1_1_360px]` chip column.
- [ ] The left card uses `bg-[image:var(--landing-gradient-coverage-card)]`, `border border-line-strong`, `rounded-3xl`, `p-[clamp(28px,3.2vw,44px)]`, an H2 at `clamp(26px,3.4vw,44px)` with `max-w-[16ch]`, and an accent pill CTA with `self-start`.
- [ ] City chips are a **grid**: `[grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]` with `gap-2.5` and `content-start`. There is no `flex-[1_1_150px]` anywhere.
- [ ] Each chip is `rounded-2xl border border-line bg-surface px-5 py-[18px]` with a 16px/600 name and a `font-price text-[10.5px] tracking-[.1em] uppercase text-faint` tier below.
- [ ] `GeorgianCity` is not imported and the enum is not mapped. Cities and tiers come only from `content.cities`.
- [ ] `landing-faq.tsx` still uses `useId()`, `aria-expanded`, `aria-controls`, `role="region"` + `aria-labelledby`, the `hidden` attribute (not conditional rendering), a `<h3>`-wrapped trigger button, `useState<number | null>(0)`, and `setOpenIndex(isOpen ? null : index)`. Diff the file and confirm the only behavioural change is the toggle glyph's markup.
- [ ] Item 0 is open on load; clicking the open item collapses it; opening another closes the first.
- [ ] The FAQ is `flex flex-wrap gap-[clamp(28px,4vw,64px)]` with a `flex-[1_1_280px]` heading column and a `flex-[1_1_460px]` accordion at `gap-2.5`; items are `rounded-2xl border border-line bg-surface`; triggers are `px-6 py-5` with a 16px/600 question and a `font-price text-[19px] text-accent` `+`/`–` on the right; answers are `px-6 pb-[22px] text-[15px] leading-[1.7] max-w-[72ch]`.
- [ ] The FAQ's support line renders `content.intro` followed by an inline accent link using `content.supportLinkLabel` / `content.supportLinkHref`.
- [ ] The `lg:sticky lg:top-24` treatment is gone (no breakpoint prefixes survive in the file).
- [ ] `src/components/landing/landing-closing-cta.tsx` exists, exports `LandingClosingCta`, and renders a centred `rounded-[2rem]` panel with `border-line-accent-strong`, `bg-[image:var(--landing-gradient-cta-panel)]`, `px-[clamp(26px,4vw,64px)] py-[clamp(40px,6vw,88px)]`.
- [ ] Its H2 is `text-[clamp(30px,5.2vw,72px)] leading-[.96] tracking-[-.05em] max-w-[20ch]`; its body is `text-[16.5px] max-w-[44ch]`; it renders an accent pill with `shadow-cta` and a glass pill.
- [ ] Neither "twelve seconds" nor "Half price on your first three" nor "No card needed to get a quote" appears anywhere in the repo's landing components or in the seeded defaults.
- [ ] No `style` attribute in any of the three files.
- [ ] No hardcoded `rgba(...)` or hex colour literals. Grep all three files for `rgba(` and `#`.
- [ ] No `@media`, no `sm:` / `md:` / `lg:` prefixes in any of the three files.
- [ ] All three sections render correctly in light and dark (toggle with task-01's control, or set `class="dark"` on `<html>` by hand while developing) — in particular check that the two accent gradients and the glow are still legible on a light ground.
- [ ] `pnpm check` (lint + typecheck) passes.

## Notes

- **Do not touch `src/components/landing/landing-page.tsx`.** Task-14 owns composition, the `LandingSectionRenderer` switch and the section ordering. Until it lands, `landing-coverage.tsx` and `landing-closing-cta.tsx` are unreferenced exports — expected, and lint tolerates it.
- **Do not touch `src/lib/admin/home-page-content.ts` or `src/app/globals.css`.** Those are task-02 and task-01. If the contract has a genuine gap, report it in your final message rather than patching a shared file another task may be reading.
- **Do not touch `src/components/home/booking-form.tsx` (1,367 lines) or `src/components/home/route-preview-map.tsx` (522 lines).** They render the signed-in booking app for CLIENT sessions and are out of scope for the whole feature.
- **The FAQ is the highest-risk file in this task.** The temptation is to "modernise" it into a shadcn `Accordion` — do not. The landing page uses **zero** shadcn primitives by design (every control is hand-styled with landing tokens), and the existing implementation is already correct on the accessibility points a rewrite usually loses: the panel stays in the DOM so `aria-controls` never dangles, the trigger is inside a heading so the questions appear in the document outline, and the ids are `useId`-derived so two accordions on one page cannot collide. Restyle in place.
- **Do not reproduce the prototype's workarounds.** `Home-Georgia-v3.dc.html` styles everything inline, assigns `scrollLeft` directly and paints state imperatively via `document.querySelectorAll` — all documented preview-renderer compromises (handoff line 556), not design intent. Production uses state-driven styling with CSS transitions.
- **Claims removed from the handoff's copy.** Besides the closing CTA, the handoff's coverage body and FAQ answers assert things this platform does not implement — "Same-hour delivery in the four largest cities", "Median match time in Tbilisi is 54 seconds", "the booking cancels automatically … within five minutes", "seat-based access and a REST API", and support "in Georgian, English and Russian" (there is no Russian locale; `ContentLocale` is `KA | EN` only and adding a third is explicitly out of scope). task-02 seeds replacements adapted from the existing freight-voice defaults already in `DEFAULT_HOME_PAGE_CONTENT.faq`. Render the content type; if you find yourself typing a marketing claim into a `.tsx` file, something has gone wrong.
- **Coverage tiers are free text on purpose.** `CoverageCity.tier` is a string, not an enum, precisely because the tier taxonomy is not a modelled concept — it is whatever a content manager decides to print on the chip. Do not add a union type or a lookup table for it.
- **Sanity-check on the real host.** The landing page renders for signed-out visitors at `localhost:3000` (the CLIENT host); `merchant.localhost:3000` redirects away from `/`. `package.json`'s `"dev": "next dev -H ::"` is load-bearing — without `-H ::` the cross-host redirects collapse into `ERR_TOO_MANY_REDIRECTS`. Do not change it. `/home` (`src/app/home/page.tsx`, `force-dynamic`) renders the landing page as a staff preview while signed in. Exercise the accordion with a keyboard (Tab to a trigger, Enter/Space to toggle) and confirm the `+`/`–` and `aria-expanded` stay in sync.
