"use client";

import { useTranslations } from "next-intl";

import { SAVED_ADDRESS_LABEL_MAX_LENGTH } from "@/lib/saved-addresses/contract";
import { cn } from "@/lib/utils";

import { LABEL_CHIP_KEYS } from "./saved-address-format";

/**
 * A saved address's label: quick chips (Home, Office, Warehouse) above a free
 * text input. A chip only fills the input — the label is always the typed
 * text, so "Warehouse 2" is one chip tap and two keystrokes away — and a chip
 * reads as pressed while the input holds exactly its wording.
 *
 * Shared by the after-booking prompt and the manage page's edit dialog.
 * Landing token utilities only, as everywhere on the client surface.
 */
export function SavedAddressLabelField({
  id,
  value,
  onChange,
  disabled = false,
}: {
  /** The input's id, for the caller's `<label htmlFor>`. */
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("savedAddresses.labels");

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {LABEL_CHIP_KEYS.map((key) => {
          const chip = t(key);
          const pressed = value.trim() === chip;

          return (
            <button
              key={key}
              type="button"
              aria-pressed={pressed}
              disabled={disabled}
              onClick={() => onChange(pressed ? "" : chip)}
              className={cn(
                "rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                pressed
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-line text-muted hover:border-accent/40 hover:text-paper",
              )}
            >
              {chip}
            </button>
          );
        })}
      </div>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={t("placeholder")}
        maxLength={SAVED_ADDRESS_LABEL_MAX_LENGTH}
        autoComplete="off"
        disabled={disabled}
        className="h-10 w-full rounded-lg border border-line bg-ink px-3 text-[14px] text-paper transition-colors outline-none placeholder:text-muted focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/20 disabled:opacity-60"
      />
    </div>
  );
}
