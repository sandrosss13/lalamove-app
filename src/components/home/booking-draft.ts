/**
 * The hand-off between the homepage's "Book a delivery" card and the booking
 * form on `/book` (or on `/` for a signed-in client).
 *
 * The card collects the route (addresses and their coordinates) and, optionally,
 * a goods shortcut — what is being moved — then navigates. The vehicle is not
 * part of the draft: goods-first booking recommends it from the items. Rather than threading those through the URL (where
 * addresses would land in history, logs and analytics), it writes them once to
 * `sessionStorage` under one versioned key, and the form reads — and removes —
 * that draft on mount. One tab, one read: a reload of `/book` afterwards opens
 * a blank form, which is what a reload of any other form does.
 *
 * Every storage access is wrapped: `sessionStorage` throws in some private
 * modes and when site data is blocked, and a draft that cannot be saved or read
 * must cost the visitor nothing but the prefill.
 *
 * The shortcut also rides on the CTA as `?goods=` (`goods-param-threading.ts`)
 * so the URL path keeps working on its own; the draft carries it too so a
 * single read restores everything the card collected.
 *
 * Only pure imports, so this is safe in any client component.
 *
 * v2: the vehicle code and cargo category of v1 are replaced by `goods`. A v1
 * draft left in a tab is simply never read.
 */

import {
  readLocationHelp,
  type LocationHelp,
} from "@/components/home/booking-pricing";
import {
  readStopContact,
  type StopContact,
} from "@/components/home/stop-contact";
import {
  isGoodsShortcutCode,
  type GoodsShortcutCode,
} from "@/lib/goods-shortcuts";

export const BOOKING_DRAFT_STORAGE_KEY = "zomo.bookingDraft.v2";

/**
 * A draft older than this is ignored: it belongs to a visit the client has
 * long since walked away from, and silently pre-filling it would surprise them.
 */
const BOOKING_DRAFT_MAX_AGE_MS = 6 * 60 * 60 * 1000;

type LatLng = { lat: number; lng: number };

export type BookingDraft = {
  pickupAddress: string;
  pickupLocation: LatLng | null;
  dropoffAddress: string;
  dropoffLocation: LatLng | null;
  /** The goods shortcut tile the visitor picked, or `null` for none. */
  goods: GoodsShortcutCode | null;
  /**
   * Pricing model v1: the helpers, floor and cargo elevator at each end, when
   * the writer collected them. Optional — the homepage card asks only for the
   * route and the goods, and a draft without them opens the form with nobody
   * but the driver at either end. Read back through `readLocationHelp`, so a
   * value outside the bookable range is clamped rather than trusted.
   */
  pickupHelp?: LocationHelp | null;
  dropoffHelp?: LocationHelp | null;
  /**
   * Each stop's Contact Info, when the writer collected it. Optional, like the
   * helpers; read back through `readStopContact` (each part length-capped).
   * An individual's floor is NOT here — it is `pickupHelp.floor` /
   * `dropoffHelp.floor`.
   */
  pickupContact?: StopContact | null;
  dropoffContact?: StopContact | null;
  /** `Date.now()` when the card wrote it. */
  savedAt: number;
};

export function writeBookingDraft(draft: Omit<BookingDraft, "savedAt">): void {
  try {
    window.sessionStorage.setItem(
      BOOKING_DRAFT_STORAGE_KEY,
      JSON.stringify({ ...draft, savedAt: Date.now() }),
    );
  } catch {
    // Storage unavailable: the visitor simply lands on a blank form.
  }
}

function readLatLng(value: unknown): LatLng | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const { lat, lng } = value as { lat?: unknown; lng?: unknown };
  return typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng)
    ? { lat, lng }
    : null;
}

function readString(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.slice(0, maxLength) : "";
}

function readGoods(value: unknown): GoodsShortcutCode | null {
  return typeof value === "string" && isGoodsShortcutCode(value) ? value : null;
}

/**
 * Reads the draft and removes it, or returns `null` when there is none, it is
 * stale, or it is not a shape this version wrote. Parsed field by field rather
 * than cast: storage is writable by anything running on the origin.
 */
export function takeBookingDraft(): BookingDraft | null {
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(BOOKING_DRAFT_STORAGE_KEY);
    window.sessionStorage.removeItem(BOOKING_DRAFT_STORAGE_KEY);
  } catch {
    return null;
  }

  if (raw === null) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }

  const record = parsed as Record<string, unknown>;
  const savedAt = typeof record.savedAt === "number" ? record.savedAt : 0;
  if (Date.now() - savedAt > BOOKING_DRAFT_MAX_AGE_MS) {
    return null;
  }

  const pickupAddress = readString(record.pickupAddress, 500);
  const dropoffAddress = readString(record.dropoffAddress, 500);

  return {
    pickupAddress,
    // A coordinate without its address would gate the estimate on a point the
    // form shows no text for, so the two travel together or not at all.
    pickupLocation: pickupAddress ? readLatLng(record.pickupLocation) : null,
    dropoffAddress,
    dropoffLocation: dropoffAddress ? readLatLng(record.dropoffLocation) : null,
    goods: readGoods(record.goods),
    pickupHelp: readLocationHelp(record.pickupHelp),
    dropoffHelp: readLocationHelp(record.dropoffHelp),
    pickupContact: readStopContact(record.pickupContact),
    dropoffContact: readStopContact(record.dropoffContact),
    savedAt,
  };
}
