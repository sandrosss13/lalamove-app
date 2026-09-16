import type {
  BusinessApplicationStatus,
  DriverApplicationStatus,
} from "@prisma/client";

/**
 * The colour half of the two application-review surfaces — the status chips on
 * `/admin/drivers/applications` and `/admin/business/applications`, and the
 * "approved" green their detail drawers paint on a cleared document or vehicle.
 *
 * These lived as four separate copies (one chip map and one `STATUS_GREEN` per
 * surface), each carrying the light artboard's literals. That was survivable
 * while the back office was light-only. It is not survivable now that the
 * `dark` class reaches every surface: a translucent light tint with near-black
 * text is illegible on a dark card, so each value needs a dark counterpart —
 * and four copies of a two-theme value drift the moment one of them is touched.
 *
 * Two things deliberately did *not* move here:
 *
 * - The *labels* (`STATUS_LABELS`) stay per-page. They genuinely differ —
 *   `APPROVED` reads "Approved" for a driver and "Fleet active" for a fleet —
 *   so they are copy, not palette, and belong with the screen that writes them.
 * - The flagged/destructive treatments stay inline as `text-destructive` /
 *   `bg-destructive/5`. Those are already shadcn tokens that flip on their own;
 *   routing them through this module would add indirection and buy nothing.
 */

/**
 * Every status a *submitted* application can be in, across both application
 * kinds. Derived from the two Prisma enums rather than spelled out, so the maps
 * below stay total: if either enum gains a status, `Record<…, string>` fails to
 * compile here instead of silently rendering an unstyled chip at runtime. Both
 * enums currently resolve to the same three members; the union is written out
 * anyway so they are free to diverge.
 *
 * `DRAFT` is excluded for the reason the two API routes exclude it: a draft has
 * not been submitted, so no reviewer screen can ever receive one.
 */
export type ReviewableApplicationStatus = Exclude<
  DriverApplicationStatus | BusinessApplicationStatus,
  "DRAFT"
>;

/**
 * Each status chip's colours, as Tailwind classes passed to `Badge`'s
 * `className`. `cn()` inside `Badge` runs them through tailwind-merge, so they
 * replace the variant's own `bg-*`/`text-*` rather than racing it.
 *
 * Two of the three inks are tokens, and each for its own reason.
 *
 * `ACTION_REQUIRED` uses `--destructive`: shadcn's light `--destructive` is
 * *literally* `oklch(0.577 0.245 27.325)`, the same value the old arbitrary
 * class spelled by hand, so that was a rename rather than a colour change — and
 * it is the pair that gets its dark half for free. These three classes are
 * exactly the colour half of `badgeVariants`' `destructive` variant, kept as a
 * class string rather than switched to `variant="destructive"` so all three
 * statuses are configured the same way in one map.
 *
 * `APPROVED` uses `--status-success`, and that one DID change a rendered colour.
 * Its dark ink used to be a local `oklch(0.8 0.13 150)`, picked here while four
 * surfaces were independently inventing a green; the token carries the
 * `oklch(0.72 0.15 145)` that twelve of those copies agreed on. Slightly darker
 * and a few degrees greener, so the chip reads 5.7:1 on its dark tint rather
 * than 7.5:1 — both comfortably past the 4.5:1 this text needs, and now the same
 * green a reviewer sees in the onboarding wizards. Note there is no `dark:` half
 * left to write: the token flips on its own.
 *
 * `PENDING` deliberately keeps its literals and is NOT folded into
 * `--status-warning`. It looks like the same semantic, but the values are not
 * the same colour: this chip's light ink is `oklch(0.48 0.13 70)`, four shades
 * darker than the wizards' `oklch(0.62 0.15 70)`, because it sits on a 12% amber
 * tint rather than on a plain card. On that tint it reads 6.0:1; the shared
 * amber would read 3.34:1 there, under the 4.5:1 a chip label needs. Folding it
 * in would be both a light-mode repaint and an accessibility regression, so the
 * amber pair stays local until someone redesigns the chip itself.
 *
 * The `bg-*` tints stay hand-written rgba for a plainer reason: they are not
 * this green at any alpha. `rgba(16,120,70)` is `#107846`, a notably bluer green
 * than the token's `#27762f`, so `bg-status-success/10` would quietly restyle
 * the chip in light mode. Each dark tint roughly doubles its alpha, because a
 * 10% wash is invisible against a dark ground.
 */
export const APPLICATION_STATUS_CHIP_CLASSES: Record<
  ReviewableApplicationStatus,
  string
> = {
  PENDING:
    "bg-[rgba(200,140,20,0.12)] text-[oklch(0.48_0.13_70)] dark:bg-[rgba(200,140,20,0.22)] dark:text-[oklch(0.84_0.12_80)]",
  ACTION_REQUIRED: "bg-destructive/10 text-destructive dark:bg-destructive/20",
  APPROVED:
    "bg-[rgba(16,120,70,0.1)] text-status-success dark:bg-[rgba(40,170,105,0.2)]",
};

/**
 * The "approved" state line inside both review drawers — the green under a
 * cleared document, vehicle or company.
 *
 * A class rather than the inline `style={{ color: STATUS_GREEN }}` these call
 * sites used to carry. An inline style has no way to express "and this other
 * value in dark mode", and the single value it could express was the light
 * artboard's ~0.5-lightness green — 2.9:1 on the dark `--card`, i.e. unreadable.
 *
 * Now a single token class, because `--status-success` already holds both halves
 * of that decision: 5.7:1 on the light card and 7.7:1 on the dark one. The
 * `dark:` variant this used to carry is gone rather than pointed at the token —
 * writing `dark:text-status-success` beside `text-status-success` would restate
 * the same value in both themes and imply a distinction that is not there.
 */
export const APPLICATION_APPROVED_TEXT_CLASSES = "text-status-success";

/**
 * The border of an approved document/vehicle card in both review drawers, as a
 * `border-color` value for an inline `style` (the flagged and default cases are
 * plain `border-destructive` / `border-border` classes at the call sites).
 *
 * Still a `color-mix`, still 45%, still mixed into `var(--card)` — the token for
 * the surface this border is actually drawn on, so the one string covers both
 * themes: in light mode `--card` is `oklch(1 0 0)` and this renders exactly as
 * the artboard drew it, while in dark mode it mixes toward `oklch(0.205 0 0)`
 * and lands near the `--border` token beside it rather than glowing.
 *
 * The green operand is `--status-success-SOLID`, not `--status-success`, and the
 * distinction is the point: a wash wants the design's green in both themes. The
 * flipping token would mix the lifted `oklch(0.72 …)` into the dark card and
 * push this border from `#233f24` to `#395c3a`, turning a quiet rail into a
 * visible green edge — see the `-solid` rationale in `globals.css`.
 *
 * Custom properties resolve in inline styles against the element's inherited
 * computed values, and both tokens are declared on `:root`/`html.dark`, so no JS
 * branch is needed.
 */
export const APPLICATION_APPROVED_BORDER_COLOR =
  "color-mix(in oklch, var(--color-status-success-solid) 45%, var(--card))";
