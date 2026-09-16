/**
 * The one status-pill vocabulary for the driver hub.
 *
 * Seven screens show status words on `Badge` — job states, document validity,
 * vehicle and roster lifecycle, zone demand — and the design gives all of them
 * exactly six colour pairs. Keeping the map here rather than per screen means a
 * "Completed" job and a "Valid" insurance policy cannot drift apart, and a new
 * screen never has to invent a seventh tone.
 *
 * The classes are Tailwind arbitrary values rather than global tokens, matching
 * `STATUS_CHIP_CLASSES` in `src/app/admin/(sections)/drivers/applications/page.tsx`:
 * these are pill-only colours with no other use in the app, so they do not earn
 * a `--color-*` entry in `globals.css`. `Badge` merges its `className` through
 * tailwind-merge, so spreading one of these strings overrides the variant's own
 * background and text colour without needing a variant of its own.
 *
 * Light values transcribed verbatim from the handoff README's "Status pill
 * (Badge)" table
 * (`UI:UX/Registered Driver Account/design_handoff_driver_dashboard/README.md`).
 *
 * ## Why each pair has a hand-written `dark:` half
 *
 * Every light value above is a *pale tint carrying dark text* — the one shape
 * that cannot survive a theme flip untouched. A `bg-[oklch(96.2%…)]` pill keeps
 * its near-white fill on a near-black page, so in dark mode the six pills would
 * read as six bright labels stamped across the screens, each one louder than
 * the content it annotates; and once the fill is darkened, the 44%-lightness
 * foreground the design pairs with it is near-invisible on top of it.
 *
 * The handoff has no dark artboard to transcribe, so the dark half is derived
 * rather than quoted, by one rule applied six times: **keep the hue and the
 * chroma family, swap which end of the lightness scale each half sits at.** The
 * fill lands at 27–29% lightness — one step up from `--card`'s `oklch(0.205 0
 * 0)`, so a pill still separates from the card it sits on — and the text at
 * 83–88%, which clears WCAG AA against that fill. Keeping the hue is what
 * preserves the only property that actually matters here: the six tones stay
 * distinguishable **from each other** in both themes, which is the whole reason
 * this map exists rather than six ad-hoc pills.
 *
 * These are still Tailwind arbitrary values rather than `--color-*` tokens, for
 * the reason above — pill-only colours with no other use — but the two
 * foregrounds shared with the hub's delta text (`success`'s green and
 * `warning`'s amber, spelled out in `hub-primitives.tsx`,
 * `performance-screen.tsx` and the two account cards) are quoted verbatim from
 * here in both halves, so a tone correction stays a one-line change in one
 * file rather than a hunt across the surface.
 */

/** The six colour pairs the design defines — no screen may add a seventh. */
export type HubStatusTone =
  "success" | "info" | "danger" | "warning" | "neutral" | "demand";

/** Background + text class pair for each tone, to spread onto a `Badge`. */
export const HUB_STATUS_TONE_CLASSES: Record<HubStatusTone, string> = {
  // Completed / Verified / Paid / Valid / Active / Online
  success:
    "bg-[oklch(96.2%_0.044_156.743)] text-[oklch(44.8%_0.119_151.328)] " +
    "dark:bg-[oklch(27%_0.05_156.743)] dark:text-[oklch(84%_0.13_156.743)]",
  // In transit / In review / Processing
  info:
    "bg-[oklch(93.2%_0.032_255.585)] text-[oklch(42.4%_0.199_265.638)] " +
    "dark:bg-[oklch(28%_0.06_255.585)] dark:text-[oklch(83%_0.11_255.585)]",
  // Cancelled / Expired / Suspended
  danger:
    "bg-[oklch(93.6%_0.032_17.717)] text-[oklch(44.4%_0.177_26.899)] " +
    "dark:bg-[oklch(28%_0.06_17.717)] dark:text-[oklch(84%_0.11_17.717)]",
  // Expiring soon / Due soon / Pending / Invited
  warning:
    "bg-[oklch(97.3%_0.071_103.193)] text-[oklch(47.6%_0.114_61.907)] " +
    "dark:bg-[oklch(29%_0.05_85)] dark:text-[oklch(88%_0.12_85)]",
  // Scheduled / Offline / Idle / Defleeted / Offboarded
  neutral:
    "bg-[oklch(96.7%_0.003_264.542)] text-[oklch(44.6%_0.03_256.802)] " +
    "dark:bg-[oklch(27.5%_0.005_264.542)] dark:text-[oklch(80%_0.015_264.542)]",
  // The Today screen's "High" zone-demand pill — the only warm tone in the set.
  // Its dark half has to stay clear of `danger`'s, which is only 35° away on a
  // pill the eye never sees beside it; the extra chroma is what separates them.
  demand:
    "bg-[oklch(96%_0.04_60)] text-[oklch(48%_0.15_48)] " +
    "dark:bg-[oklch(29%_0.06_55)] dark:text-[oklch(85%_0.13_58)]",
};

/**
 * Every status word the design uses, keyed by its normalised form.
 *
 * Keys are lower-case with separators collapsed to single spaces (see
 * `normalise`), so a Prisma enum value (`IN_TRANSIT`), a display string
 * ("In transit") and a slug (`in-transit`) all land on the same entry. That
 * matters because these strings reach the client from three directions: enum
 * columns, hand-written sample data, and derived labels.
 */
const TONE_BY_STATUS: Record<string, HubStatusTone> = {
  // Success — the job/document/account is in the state everyone wants.
  completed: "success",
  verified: "success",
  paid: "success",
  valid: "success",
  active: "success",
  online: "success",

  // Info — in flight, not yet resolved either way.
  "in transit": "info",
  "in review": "info",
  processing: "info",
  // A vehicle off the road for maintenance: `'In service': tag(INFO_BG,
  // INFO_FG)` in the design. Unreachable until the Vehicles screen grows the
  // fleet tab that filters on it ("All / Active / In service / Idle /
  // Defleeted"), but the word is part of the design's vocabulary and an
  // unmapped one falls through to grey, so it is mapped here rather than
  // discovered as a bug when that tab lands.
  "in service": "info",

  // Danger — ended badly or blocks the driver from working.
  cancelled: "danger",
  // US spelling: `Order.status` is an enum today, but free-text status strings
  // reach this mapper from sample data and from API payloads too.
  canceled: "danger",
  expired: "danger",
  suspended: "danger",

  // Warning — still fine, but it needs the driver to do something soon.
  "expiring soon": "warning",
  "due soon": "warning",
  pending: "warning",
  invited: "warning",
  // Zone demand's middle step. The design tags it exactly like the other
  // warnings — `Medium: tag(WARN_BG, WARN_FG)` — so it is amber, not grey.
  medium: "warning",

  // Neutral — a real, deliberate state that simply is not an alert.
  scheduled: "neutral",
  offline: "neutral",
  idle: "neutral",
  defleeted: "neutral",
  offboarded: "neutral",

  // Zone demand on Today. "High" is the only warm tone in the set; "Medium"
  // is mapped with the other warnings above, and "Low" — `Low: tag(BG, MUTED)`
  // — is the one demand step that really does want the neutral default.
  high: "demand",
};

/**
 * Lower-cases and collapses separators so `IN_TRANSIT`, `in-transit` and
 * `In transit` all produce the same lookup key.
 */
function normalise(status: string): string {
  return status
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

/**
 * The tone for a status word.
 *
 * Falls back to `neutral` rather than throwing: these strings cross the wire
 * from the database and from the sample module, so an unmapped word is a
 * content gap, not a crash — and a grey pill reads as "a state we have no
 * opinion about", which is the honest rendering of one we do not recognise.
 */
export function hubStatusTone(status: string): HubStatusTone {
  return TONE_BY_STATUS[normalise(status)] ?? "neutral";
}
