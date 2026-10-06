import { cn } from "@/lib/utils";

/**
 * The zomo logo as inline SVG.
 *
 * The geometry is copied verbatim from the production assets in
 * `logo and brandbook/design_handoff_zomo_rebrand/svg/` (minus their C2PA
 * `<metadata>` blocks). Every variant there shares the same paths and differs
 * only in colour, so the geometry lives once below and each variant is a
 * colour pair. The wordmark is custom lettering, not a font — never replace it
 * with "zomo" set in text.
 *
 * Inline rather than `<img src="/brand/...svg">` so the mark paints with the
 * first HTML byte (no extra request, no layout shift) and so the light/dark
 * pair in `ZomoLockupThemed` can be swapped with a class instead of a second
 * download.
 *
 * Size it with a height class (`h-6`, …): the width follows from the viewBox,
 * so the aspect ratio can never be stretched. Brand-book minimums: horizontal
 * lockup 80px wide (height ≥ 21px), stacked lockup 48px wide, symbol 16px.
 */

/** Fixed brand palette — see the handoff's "Design tokens". */
const BRAND = {
  orange: "#ff5a1f",
  bright: "#f58220",
  ink: "#201f1c",
  offwhite: "#f5f2ea",
  white: "#ffffff",
} as const;

type BrandColour = (typeof BRAND)[keyof typeof BRAND];

/** symbol colour + wordmark colour, per handoff lockup file. */
const LOCKUP_COLOURS = {
  /** `lockup-*-primary.svg` — light backgrounds. */
  primary: { symbol: BRAND.orange, wordmark: BRAND.ink },
  /** `lockup-*-dark.svg` — the #15140f dark panel and dark theme. */
  dark: { symbol: BRAND.bright, wordmark: BRAND.offwhite },
  /** `lockup-*-ink.svg` — single colour on light. */
  ink: { symbol: BRAND.ink, wordmark: BRAND.ink },
  /** `lockup-*-white.svg` — orange or photographic backgrounds. */
  white: { symbol: BRAND.white, wordmark: BRAND.white },
} as const satisfies Record<
  string,
  { symbol: BrandColour; wordmark: BrandColour }
>;

export type ZomoLockupVariant = keyof typeof LOCKUP_COLOURS;

const SYMBOL_COLOURS = {
  orange: BRAND.orange,
  bright: BRAND.bright,
  ink: BRAND.ink,
  offwhite: BRAND.offwhite,
  white: BRAND.white,
} as const;

export type ZomoSymbolVariant = keyof typeof SYMBOL_COLOURS;

/** Default accessible name. The brand is never translated (see GLOSSARY.md). */
const BRAND_LABEL = "zomo";

type A11yProps = {
  className?: string;
  /**
   * Accessible name. Ignored when `decorative` is set. Defaults to "zomo".
   */
  label?: string;
  /**
   * Hide the mark from assistive tech — use when visible text beside it (or
   * the enclosing link's own label) already names the brand.
   */
  decorative?: boolean;
};

function a11yAttributes({ label, decorative }: A11yProps) {
  return decorative
    ? ({ "aria-hidden": true, focusable: false } as const)
    : ({ role: "img", "aria-label": label ?? BRAND_LABEL } as const);
}

/** The "route z" symbol, drawn in the 100×100 symbol space. */
function SymbolShapes({ colour }: { colour: string }) {
  return (
    <>
      <path
        d="M20,26 H70 L30,74 H50"
        fill="none"
        stroke={colour}
        strokeWidth="18"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="20" cy="26" r="13" fill={colour} />
      <circle cx="80" cy="74" r="12" fill={colour} />
    </>
  );
}

/** The "zomo" lettering, drawn in the 482×100 wordmark space. */
function WordmarkShapes({ colour }: { colour: string }) {
  return (
    <>
      <g
        fill="none"
        stroke={colour}
        strokeWidth="22"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M11,11 H89 L11,89 H89" />
        <circle cx="164" cy="50" r="39" />
        <path d="M239,89 V39 A29.5,28 0 0 1 298,39 V89 M298,39 A29.5,28 0 0 1 357,39 V89" />
        <circle cx="432" cy="50" r="39" />
      </g>
      <circle cx="15" cy="15" r="15" fill={colour} />
    </>
  );
}

export type ZomoLockupProps = A11yProps & { variant?: ZomoLockupVariant };

/** Horizontal lockup (symbol + wordmark), viewBox 382×100. */
export function ZomoLockup({
  variant = "primary",
  className,
  ...a11y
}: ZomoLockupProps) {
  const colours = LOCKUP_COLOURS[variant];

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 382 100"
      className={cn("h-6 w-auto flex-none", className)}
      {...a11yAttributes(a11y)}
    >
      <SymbolShapes colour={colours.symbol} />
      <g transform="translate(112 22) scale(.56)">
        <WordmarkShapes colour={colours.wordmark} />
      </g>
    </svg>
  );
}

/** Stacked lockup (symbol over wordmark), viewBox 212×158. */
export function ZomoLockupStacked({
  variant = "primary",
  className,
  ...a11y
}: ZomoLockupProps) {
  const colours = LOCKUP_COLOURS[variant];

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 212 158"
      className={cn("h-12 w-auto flex-none", className)}
      {...a11yAttributes(a11y)}
    >
      <g transform="translate(56 0)">
        <SymbolShapes colour={colours.symbol} />
      </g>
      <g transform="translate(0 114) scale(.44)">
        <WordmarkShapes colour={colours.wordmark} />
      </g>
    </svg>
  );
}

export type ZomoSymbolProps = A11yProps & { variant?: ZomoSymbolVariant };

/** The symbol alone, viewBox 100×100 — for compact spaces. */
export function ZomoSymbol({
  variant = "orange",
  className,
  ...a11y
}: ZomoSymbolProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      className={cn("size-6 flex-none", className)}
      {...a11yAttributes(a11y)}
    >
      <SymbolShapes colour={SYMBOL_COLOURS[variant]} />
    </svg>
  );
}

/**
 * The horizontal lockup for a surface that follows the app theme: primary
 * (orange + ink) under the light theme, dark (bright orange + off-white) under
 * `html.dark`. Both are rendered and one is hidden with the `dark:` variant,
 * because the theme is a client-only class set before paint (see
 * `THEME_SCRIPT` in `src/app/[locale]/layout.tsx`) — the server cannot pick.
 *
 * Only the visible copy is exposed to assistive tech: `display: none` removes
 * the hidden one from the accessibility tree, so the name is never read twice.
 */
export function ZomoLockupThemed({ className, ...a11y }: A11yProps) {
  return (
    <>
      <ZomoLockup
        variant="primary"
        className={cn("dark:hidden", className)}
        {...a11y}
      />
      <ZomoLockup
        variant="dark"
        className={cn("hidden dark:block", className)}
        {...a11y}
      />
    </>
  );
}
