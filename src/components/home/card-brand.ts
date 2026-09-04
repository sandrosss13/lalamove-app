import { cn } from "@/lib/utils";

/**
 * Card brand detection and the chip styling that goes with it, shared by the
 * add-card dialog, the wallet's saved-card rows and the booking form's payment
 * step.
 *
 * **This is a display convenience only.** No payment gateway exists yet. When
 * one is wired in, the gateway's tokenisation response carries the authoritative
 * brand — it knows the full issuer ranges, keeps them current, and is the only
 * value that may be trusted for anything beyond a label. At that point
 * `detectCardBrand` is *replaced* by that response, not extended with more
 * ranges: growing this table would build a second, silently-wrong source of
 * truth alongside the gateway's.
 *
 * The chip styling stays, because a saved card still has to be recognisable in
 * a list, and it is driven by the stored brand string either way.
 */

/**
 * Every brand this helper can name. `Card` is the honest answer for a number
 * whose range is not one of the three the app shows a coloured chip for — the
 * card is still perfectly saveable, it simply gets a neutral chip.
 */
export const CARD_BRANDS = ["Visa", "Mastercard", "Amex", "Card"] as const;

export type CardBrand = (typeof CARD_BRANDS)[number];

/** The brand used when the leading digits match nothing known. */
export const UNKNOWN_CARD_BRAND: CardBrand = "Card";

/** Narrows a stored brand string — which may be anything — to a known brand. */
function isCardBrand(value: string): value is CardBrand {
  return (CARD_BRANDS as readonly string[]).includes(value);
}

/**
 * Names the brand from the leading digits of a card number.
 *
 * Ranges: Visa `4`, Mastercard `51`–`55` and `2221`–`2720`, Amex `34` / `37`.
 * Partial input is expected — the dialog calls this on every keystroke to show
 * a live chip — so a number too short to place in a range simply reads as
 * `Card` until enough digits are typed. That means a 2-series Mastercard shows
 * the neutral chip for its first three digits, which is correct: three digits
 * genuinely do not identify it.
 *
 * Non-digits are stripped so a grouped display value ("4111 1111 …") may be
 * passed as readily as bare digits.
 */
export function detectCardBrand(cardNumber: string): CardBrand {
  const digits = cardNumber.replace(/\D/g, "");

  if (digits.startsWith("4")) {
    return "Visa";
  }

  if (/^3[47]/.test(digits)) {
    return "Amex";
  }

  if (/^5[1-5]/.test(digits)) {
    return "Mastercard";
  }

  // The 2-series Mastercard range is defined on the first four digits, so it
  // cannot be decided before four have been typed.
  if (digits.length >= 4) {
    const leadingFour = Number(digits.slice(0, 4));

    if (leadingFour >= 2221 && leadingFour <= 2720) {
      return "Mastercard";
    }
  }

  return UNKNOWN_CARD_BRAND;
}

/**
 * What the chip prints. Mastercard is abbreviated because the full word does
 * not fit the chip's geometry at 11px, and "MC" is how the card itself is
 * commonly marked.
 */
const CARD_BRAND_CHIP_LABELS: Record<CardBrand, string> = {
  Visa: "Visa",
  Mastercard: "MC",
  Amex: "Amex",
  Card: "Card",
};

/**
 * Chip geometry and typography, identical for every brand: `h-8 min-w-14
 * rounded-md`, 11px/700, `tracking-[0.04em]`.
 */
export const CARD_BRAND_CHIP_BASE_CLASSES =
  "inline-flex h-8 min-w-14 items-center justify-center rounded-md px-2 text-[0.6875rem] leading-none font-bold tracking-[0.04em]";

/**
 * The one place in this feature that uses semantic colour. Tailwind palette
 * utilities rather than landing tokens, as the codebase already does for status
 * pills and the "Best" badge: the landing token set has no semantic colour at
 * all, and adding brand tokens to it for three chips would be the wrong trade.
 */
export const CARD_BRAND_CHIP_TONE_CLASSES: Record<CardBrand, string> = {
  Visa: "bg-blue-100 text-blue-700",
  Mastercard: "bg-amber-100 text-amber-800",
  Amex: "bg-emerald-100 text-emerald-700",
  Card: "bg-surface text-muted",
};

/**
 * The label for a chip. Takes a plain string rather than a `CardBrand` because
 * consumers read the brand back from the database, where it is only ever a
 * string; an unrecognised one is printed as stored rather than flattened to
 * "Card", so a brand saved before this table changes still reads correctly.
 */
export function cardBrandChipLabel(brand: string): string {
  return isCardBrand(brand) ? CARD_BRAND_CHIP_LABELS[brand] : brand;
}

/** The full class list for a brand chip, geometry and tone together. */
export function cardBrandChipClasses(brand: string): string {
  return cn(
    CARD_BRAND_CHIP_BASE_CLASSES,
    CARD_BRAND_CHIP_TONE_CLASSES[
      isCardBrand(brand) ? brand : UNKNOWN_CARD_BRAND
    ],
  );
}
