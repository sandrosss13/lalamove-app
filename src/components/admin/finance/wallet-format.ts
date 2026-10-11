import type { useFormatter } from "next-intl";

type Formatter = ReturnType<typeof useFormatter>;

/** Two decimals always, matching how the rest of the back office shows lari. */
const AMOUNT_FORMAT = {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
} as const;

/** Integer tetri as lari: 9265 → "₾92.65". A negative amount leads with "−". */
export function formatTetri(format: Formatter, tetri: number): string {
  const amount = `₾${format.number(Math.abs(tetri) / 100, AMOUNT_FORMAT)}`;

  return tetri < 0 ? `−${amount}` : amount;
}

/** A ledger amount, with its sign spelled out either way: "+₾92.65". */
export function formatSignedTetri(format: Formatter, tetri: number): string {
  return tetri > 0
    ? `+${formatTetri(format, tetri)}`
    : formatTetri(format, tetri);
}

/** "GE29 TB00 0000 0000 0044 17" — an IBAN in groups of four, for reading aloud. */
export function groupIban(iban: string): string {
  return iban.replace(/(.{4})/g, "$1 ").trim();
}
