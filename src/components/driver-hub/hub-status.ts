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
 * Values transcribed verbatim from the handoff README's "Status pill (Badge)"
 * table (`UI:UX/Registered Driver Account/design_handoff_driver_dashboard/README.md`).
 */

/** The six colour pairs the design defines — no screen may add a seventh. */
export type HubStatusTone =
  "success" | "info" | "danger" | "warning" | "neutral" | "demand";

/** Background + text class pair for each tone, to spread onto a `Badge`. */
export const HUB_STATUS_TONE_CLASSES: Record<HubStatusTone, string> = {
  // Completed / Verified / Paid / Valid / Active / Online
  success: "bg-[oklch(96.2%_0.044_156.743)] text-[oklch(44.8%_0.119_151.328)]",
  // In transit / In review / Processing
  info: "bg-[oklch(93.2%_0.032_255.585)] text-[oklch(42.4%_0.199_265.638)]",
  // Cancelled / Expired / Suspended
  danger: "bg-[oklch(93.6%_0.032_17.717)] text-[oklch(44.4%_0.177_26.899)]",
  // Expiring soon / Due soon / Pending / Invited
  warning: "bg-[oklch(97.3%_0.071_103.193)] text-[oklch(47.6%_0.114_61.907)]",
  // Scheduled / Offline / Idle / Defleeted / Offboarded
  neutral: "bg-[oklch(96.7%_0.003_264.542)] text-[oklch(44.6%_0.03_256.802)]",
  // The Today screen's "High" zone-demand pill — the only warm tone in the set.
  demand: "bg-[oklch(96%_0.04_60)] text-[oklch(48%_0.15_48)]",
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

  // Neutral — a real, deliberate state that simply is not an alert.
  scheduled: "neutral",
  offline: "neutral",
  idle: "neutral",
  defleeted: "neutral",
  offboarded: "neutral",

  // Zone demand on Today. Only "High" gets its own tone; "Medium" and "Low"
  // fall through to the neutral default, which is what the design shows.
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
