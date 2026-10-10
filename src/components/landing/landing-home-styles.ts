/**
 * Class strings shared by the v4 homepage sections (`Home-Georgia-v4` in the
 * design handoff). Kept in one place so the repeated measurements — the 1280px
 * content column, the section rhythm, the section heading — cannot drift
 * between components.
 */

/** The content column every section aligns to, with the design's gutter. */
export const HOME_CONTAINER =
  "mx-auto w-full max-w-[1280px] px-[clamp(20px,4vw,40px)]";

/** Space above a section, below the previous one. */
export const HOME_SECTION_SPACING = "pt-[clamp(56px,7vw,96px)]";

/** The section `h2`. */
export const HOME_SECTION_HEADING =
  "m-0 text-[clamp(26px,3.2vw,40px)] leading-[1.05] font-semibold tracking-[-0.04em] text-balance";

/** The muted paragraph under a section heading. */
export const HOME_SECTION_INTRO =
  "m-0 text-[15.5px] leading-normal text-pretty text-home-muted";

/** An accent text link ("See all →"): darker orange on light, brand on dark. */
export const HOME_ACCENT_LINK =
  "text-[14.5px] font-semibold text-home-accent-ink transition-colors hover:text-home-accent";

/** Bordered white (or dark-grey) card. */
export const HOME_CARD =
  "overflow-hidden rounded-[1.25rem] border border-home-line bg-home-surface";

/** The small mono caps label used for eyebrows and tags. */
export const HOME_MONO_LABEL = "font-price uppercase";
