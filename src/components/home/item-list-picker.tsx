"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type * as React from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, Minus, Plus, Search, X } from "lucide-react";

import {
  PICK_CARD_BASE_CLASSES,
  PICK_CARD_IDLE_CLASSES,
  PICK_CARD_SELECTED_CLASSES,
  SelectedTick,
} from "@/components/home/booking-form-primitives";
import {
  formatLoadDimensionsM,
  formatLoadVolumeM3,
  formatLoadWeightKg,
  formatFootprintM,
} from "@/components/home/item-list-format";
import {
  activeLines,
  addCatalogueItem,
  addCustomItem,
  addPalletLine,
  canAddLine,
  effectiveMode,
  maxQuantity,
  removeLine,
  setLineQuantity,
  toLoadLines,
  updatePalletLine,
  type CustomItemDraft,
  type PalletPickerLine,
  type PalletWeightPreset,
  type PickerLine,
  type PickerMode,
} from "@/components/home/item-list-lines";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import {
  CARGO_MEASUREMENT_BOUNDS,
  type CargoMeasurementBounds,
} from "@/lib/cargo";
import type { ItemGroupCode } from "@/lib/goods-shortcuts";
import { searchCatalogue, type CatalogueItem } from "@/lib/item-catalogue";
import {
  CUSTOM_SIZE_PRESETS,
  MAX_PALLET_COUNT,
  PALLET_CONTENTS,
  PALLET_TYPES,
  PALLET_WEIGHT_PRESETS,
  planLoad,
  type CustomSizePreset,
  type PalletContents,
  type PalletType,
} from "@/lib/orders/load-plan";
import {
  CUSTOM_LABEL_MAX_LENGTH,
  MAX_ITEM_LINES,
} from "@/lib/orders/parse-items";
import { cn } from "@/lib/utils";

export type { PickerLine, PickerMode } from "@/components/home/item-list-lines";

/**
 * Step 4 of the booking form, "What are you moving?": the item list picker.
 *
 * A client searches or browses the item catalogue, sets how many of each, adds
 * anything the catalogue lacks as an "Other item" with a rough or exact size,
 * and — business accounts only — can describe the load as pallet groups
 * instead. A running summary under the list (weight, volume, largest item)
 * reads straight from `planLoad`, the same function the route re-runs on
 * submit.
 *
 * **Built standalone, for later wiring** — the way `stop-contact-dialog.tsx`
 * was. `booking-form.tsx` is the surface eight changes land on, and keeping
 * this out of it is the point; task-10 mounts it.
 *
 * **Fully controlled.** The parent owns the mode and the lines, because the
 * parent is what submits them (`toItemsPayload` in `item-list-lines.ts`) and
 * what has to drop a stale quote when they change. The only state kept here is
 * presentation: the search query, which browse group is showing, the "Other
 * item" draft and half-typed numbers. Nothing is fetched here: the catalogue
 * arrives as a prop (`useItemCatalogue` in the parent).
 *
 * **The parent contract on modes.** `lines` holds item lines *and* pallet lines
 * at once. Switching mode never deletes the other mode's lines — a business
 * that flips to Pallets and back finds its list intact — but only the active
 * mode's lines are summarised here, and the parent must submit only those:
 * `toItemsPayload(lines, effectiveMode(mode, accountType))`. Pallets are
 * business-only; for any other account (or while the account type is still
 * loading, `null`) the switch is not rendered and the picker behaves as items
 * mode whatever `mode` says.
 *
 * **Keyboard.** The search is an ARIA 1.2 combobox on the existing `Popover`
 * (`cmdk` is not installed and no `command` primitive exists here): focus stays
 * in the input, ↑/↓ move the active option, Enter adds it, Escape closes the
 * list and, pressed again, clears the query. Every choice between a few fixed
 * answers — mode, browse group, size, pallet type, contents, weight — is a
 * native radio group (`sr-only` input inside a styled `label`), the pattern
 * the crew and load-space pickers use, for the arrow-key navigation and "2 of
 * 4" announcement it gets for free. Steppers are real buttons whose
 * `aria-label` names the item. The picker will sit inside the booking form's
 * `<form>`, so Enter in any of its text fields is caught here rather than
 * submitting the booking.
 *
 * Colour rule, as everywhere in the booking flow: landing token utilities only
 * (`bg-ink`, `bg-surface`, `text-paper`, `text-muted`, `border-line`, the
 * accent) — never a hex literal and never a `dark:` variant.
 */

/* -------------------------------------------------------------------------- */
/* Props                                                                      */
/* -------------------------------------------------------------------------- */

export type ItemListPickerProps = {
  /** `null` while loading: treated as an individual, so pallets stay hidden. */
  accountType: "INDIVIDUAL" | "BUSINESS" | null;
  /**
   * The browse group to open on, from the goods shortcut. `"ALL"` shows every
   * group (the "moving home" shortcut); `null` opens on the first group.
   */
  initialGroup: ItemGroupCode | "ALL" | null;
  mode: PickerMode;
  onModeChange: (mode: PickerMode) => void;
  /** Both modes' lines; see the parent contract above. */
  lines: PickerLine[];
  onLinesChange: (lines: PickerLine[]) => void;
  /** The active catalogue in the UI locale, from `useItemCatalogue`. */
  catalogue: CatalogueItem[];
  catalogueLoading: boolean;
  catalogueError: string | null;
  disabled?: boolean;
};

/* -------------------------------------------------------------------------- */
/* Vocabulary                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Browse groups, in `ItemGroup` enum order, with their keys under
 * `home.itemListPicker.groups`. A `Record` so a new group fails typecheck here.
 */
const GROUP_KEYS: Record<ItemGroupCode, string> = {
  LIVING_ROOM: "livingRoom",
  BEDROOM: "bedroom",
  KITCHEN_APPLIANCES: "kitchenAppliances",
  OFFICE: "office",
  BOXES_PARCELS: "boxesParcels",
  OUTDOOR_SPORTS: "outdoorSports",
  CHILLED_FOOD: "chilledFood",
  BUILDING_MATERIALS: "buildingMaterials",
  EVENT_EQUIPMENT: "eventEquipment",
};

const GROUP_ORDER = Object.keys(GROUP_KEYS) as ItemGroupCode[];

function isGroupCode(value: string): value is ItemGroupCode {
  return Object.hasOwn(GROUP_KEYS, value);
}

const SIZE_PRESETS = Object.keys(CUSTOM_SIZE_PRESETS) as CustomSizePreset[];
const PALLET_TYPE_OPTIONS = Object.keys(PALLET_TYPES) as PalletType[];
const PALLET_CONTENTS_OPTIONS = Object.keys(
  PALLET_CONTENTS,
) as PalletContents[];
const WEIGHT_PRESET_OPTIONS = Object.keys(
  PALLET_WEIGHT_PRESETS,
) as PalletWeightPreset[];

/** How many search results the list shows at once. */
const MAX_SEARCH_RESULTS = 8;

/* -------------------------------------------------------------------------- */
/* Classes                                                                    */
/* -------------------------------------------------------------------------- */

/** A `label` around an `sr-only` radio, drawn as a pick card. */
const RADIO_CARD_CLASSES = `${PICK_CARD_BASE_CLASSES} cursor-pointer gap-0.5 has-[:focus-visible]:border-accent has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-accent/20`;

/** The browse-by-room dropdown — the booking form's native select look. */
const BROWSE_SELECT_CLASSES =
  "h-10 w-full rounded-lg border border-line bg-ink px-2.5 text-left text-sm text-paper transition-colors outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/20";

const LEGEND_CLASSES = "mb-2.5 text-[0.8125rem] font-medium text-paper";

const FIELD_LABEL_CLASSES = "text-[0.8125rem] font-medium text-paper";

const NATIVE_FIELD_CLASSES =
  "h-10 w-full rounded-lg border border-line bg-ink px-2.5 text-left text-sm text-paper transition-colors outline-none placeholder:text-muted focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/20 aria-invalid:border-accent disabled:opacity-60";

const ICON_BUTTON_CLASSES =
  "inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-line text-paper transition-colors outline-none hover:border-accent/40 focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-40";

const SECONDARY_BUTTON_CLASSES =
  "inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-line px-3.5 text-sm font-medium text-paper transition-colors outline-none hover:border-accent/40 focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-50";

const PRIMARY_BUTTON_CLASSES =
  "inline-flex h-10 items-center justify-center rounded-lg bg-accent px-4 text-sm font-semibold text-ink transition-colors outline-none hover:bg-accent-hover focus-visible:ring-3 focus-visible:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-50";

const FIELD_ERROR_CLASSES = "text-xs leading-snug text-accent";

const FIELD_NOTICE_CLASSES =
  "rounded-lg border border-line bg-surface px-3 py-2 text-xs leading-snug text-muted";

const FIGURE_CLASSES = "font-price text-paper tabular-nums";

/* -------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Enter in a text field must not submit the booking form this will sit in.
 * Returns whether it was Enter, so a caller can act on it instead.
 */
function swallowEnter(event: React.KeyboardEvent<HTMLElement>): boolean {
  if (event.key === "Enter") {
    event.preventDefault();
    return true;
  }
  return false;
}

/** `"1,2"` or `"1.2"` → `1.2`; anything else → `null`. Georgian keyboards type a comma. */
function parseDecimal(text: string): number | null {
  const normalised = text.trim().replace(",", ".");
  if (!/^(\d+\.?\d*|\.\d+)$/.test(normalised)) {
    return null;
  }
  const value = Number(normalised);
  return Number.isFinite(value) ? value : null;
}

function withinBounds(
  value: number | null,
  bounds: CargoMeasurementBounds,
): value is number {
  return value !== null && value >= bounds.min && value <= bounds.max;
}

/* -------------------------------------------------------------------------- */
/* ItemListPicker                                                             */
/* -------------------------------------------------------------------------- */

export function ItemListPicker({
  accountType,
  initialGroup,
  mode,
  onModeChange,
  lines,
  onLinesChange,
  catalogue,
  catalogueLoading,
  catalogueError,
  disabled = false,
}: ItemListPickerProps) {
  const t = useTranslations("home.itemListPicker");
  const modeName = useId();
  const otherItemButtonRef = useRef<HTMLButtonElement>(null);
  const [customOpen, setCustomOpen] = useState(false);

  const isBusiness = accountType === "BUSINESS";
  const activeMode = effectiveMode(mode, accountType);
  const shownLines = activeLines(lines, activeMode);
  const linesFull = !canAddLine(lines, activeMode);

  const byCode = useMemo(
    () => new Map(catalogue.map((item) => [item.code, item])),
    [catalogue],
  );

  const plan = useMemo(
    () => planLoad(toLoadLines(lines, activeMode, catalogue)),
    [lines, activeMode, catalogue],
  );

  /** How many of each catalogue code are listed, for the browse badges. */
  const listedByCode = useMemo(() => {
    const counts = new Map<string, number>();
    for (const line of lines) {
      if (line.kind === "CATALOGUE") {
        counts.set(line.code, line.quantity);
      }
    }
    return counts;
  }, [lines]);

  function addItem(code: string) {
    onLinesChange(addCatalogueItem(lines, code));
  }

  function handleModeChange(next: PickerMode) {
    onModeChange(next);
    // A business opening Pallets for the first time gets one group to fill in
    // rather than an empty panel with an "Add" button.
    if (next === "pallets" && activeLines(lines, "pallets").length === 0) {
      onLinesChange(addPalletLine(lines));
    }
  }

  function closeCustom() {
    setCustomOpen(false);
    // Back to the control that opened the row, which the row replaced.
    requestAnimationFrame(() => otherItemButtonRef.current?.focus());
  }

  /** What a line is called: the catalogue label, or what the client typed. */
  function lineName(line: PickerLine): string {
    if (line.kind === "CUSTOM") return line.label;
    if (line.kind === "CATALOGUE") {
      return byCode.get(line.code)?.label ?? line.code;
    }
    return t(`palletTypes.${line.palletType}`);
  }

  return (
    // `disabled` on a fieldset disables every native control inside it — the
    // one switch that reaches radios, inputs and buttons alike.
    <fieldset
      disabled={disabled}
      className="m-0 flex min-w-0 flex-col gap-5 border-0 p-0"
    >
      {isBusiness ? (
        <fieldset>
          <legend className={LEGEND_CLASSES}>{t("modeLegend")}</legend>
          <div className="grid grid-cols-2 gap-2.5">
            {(["items", "pallets"] as const).map((option) => {
              const selected = activeMode === option;
              return (
                <label
                  key={option}
                  className={cn(
                    "relative flex h-11 cursor-pointer items-center justify-center rounded-xl border text-sm font-semibold text-paper transition-colors has-[:focus-visible]:border-accent has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-accent/20",
                    selected
                      ? PICK_CARD_SELECTED_CLASSES
                      : PICK_CARD_IDLE_CLASSES,
                  )}
                >
                  <input
                    type="radio"
                    name={modeName}
                    value={option}
                    checked={selected}
                    onChange={() => handleModeChange(option)}
                    className="sr-only"
                  />
                  {option === "items" ? t("modeItems") : t("modePallets")}
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      {activeMode === "items" ? (
        <div className="flex flex-col gap-5">
          {catalogueError ? (
            <p role="alert" className={FIELD_NOTICE_CLASSES}>
              {t("catalogueError")}
            </p>
          ) : null}

          {catalogueError ? null : (
            <>
              <ItemSearch
                catalogue={catalogue}
                loading={catalogueLoading}
                disabled={disabled}
                onPick={addItem}
              />
              {catalogueLoading ? null : (
                <BrowseGroups
                  catalogue={catalogue}
                  initialGroup={initialGroup}
                  listedByCode={listedByCode}
                  onPick={addItem}
                />
              )}
            </>
          )}

          {shownLines.length === 0 ? (
            <p className="text-[0.8125rem] leading-snug text-muted">
              {t("emptyItems")}
            </p>
          ) : (
            <ul aria-label={t("listLabel")} className="flex flex-col gap-2">
              {shownLines.map((line) => (
                <ItemLineRow
                  key={line.id}
                  line={line}
                  name={lineName(line)}
                  unavailable={
                    line.kind === "CATALOGUE" &&
                    !catalogueLoading &&
                    !byCode.has(line.code)
                  }
                  onQuantityChange={(quantity) =>
                    onLinesChange(setLineQuantity(lines, line.id, quantity))
                  }
                  onRemove={() => onLinesChange(removeLine(lines, line.id))}
                />
              ))}
            </ul>
          )}

          {customOpen ? (
            <CustomItemForm
              onCancel={closeCustom}
              onAdd={(draft) => {
                onLinesChange(addCustomItem(lines, draft));
                closeCustom();
              }}
            />
          ) : (
            <div>
              <button
                ref={otherItemButtonRef}
                type="button"
                onClick={() => setCustomOpen(true)}
                disabled={linesFull}
                className={SECONDARY_BUTTON_CLASSES}
              >
                <Plus aria-hidden="true" className="size-4" />
                {t("otherItem")}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {shownLines.length === 0 ? (
            <p className="text-[0.8125rem] leading-snug text-muted">
              {t("emptyPallets")}
            </p>
          ) : (
            shownLines.map((line, index) =>
              line.kind === "PALLET" ? (
                <PalletLineEditor
                  key={line.id}
                  line={line}
                  number={index + 1}
                  onChange={(next) => onLinesChange(next(lines))}
                />
              ) : null,
            )
          )}
          <div>
            <button
              type="button"
              onClick={() => onLinesChange(addPalletLine(lines))}
              disabled={linesFull}
              className={SECONDARY_BUTTON_CLASSES}
            >
              <Plus aria-hidden="true" className="size-4" />
              {shownLines.length === 0 ? t("addPallets") : t("addPalletGroup")}
            </button>
          </div>
        </div>
      )}

      {linesFull ? (
        <p role="status" className={FIELD_NOTICE_CLASSES}>
          {t("listFull", { max: MAX_ITEM_LINES })}
        </p>
      ) : null}

      {/* Always mounted, so a screen reader hears each change to the totals
          rather than only the first time the region appears. Polite: a new
          total is information, never an interruption. */}
      <div aria-live="polite" aria-atomic="true">
        {plan ? (
          <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-lg border border-line bg-surface px-3 py-2.5 text-[0.8125rem] text-muted">
            <span className="font-medium text-paper">{t("summaryLabel")}</span>
            <span>
              <span className={FIGURE_CLASSES}>
                ~{formatLoadWeightKg(plan.totalWeightKg)}
              </span>
              {" · "}
              <span className={FIGURE_CLASSES}>
                ~{formatLoadVolumeM3(plan.itemVolumeM3)}
              </span>
              {" · "}
              {t("largestItem")}{" "}
              <span className={FIGURE_CLASSES}>
                {formatLoadDimensionsM(
                  plan.envelope.lengthM ?? 0,
                  plan.envelope.widthM ?? 0,
                  plan.envelope.heightM ?? 0,
                )}
              </span>
            </span>
          </p>
        ) : null}
      </div>

      {/* `alert`, unlike the advisory lines elsewhere on the form: both block
          the booking (the route refuses `bodyConflict` and `overMaximum`), so
          the client needs to hear them the moment the list goes wrong. */}
      {plan?.body.kind === "conflict" ? (
        <p role="alert" className={`${FIELD_NOTICE_CLASSES} text-accent`}>
          {t("conflict")}
        </p>
      ) : null}
      {plan?.overMaximum ? (
        <p role="alert" className={`${FIELD_NOTICE_CLASSES} text-accent`}>
          {t("overMaximum")}
        </p>
      ) : null}
    </fieldset>
  );
}

/* -------------------------------------------------------------------------- */
/* ItemSearch                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The search box: an ARIA 1.2 combobox (`input` + `listbox`) whose list is a
 * `Popover` anchored to the input. Focus never leaves the input — the active
 * option is conveyed by `aria-activedescendant` — so typing, moving and picking
 * are one continuous gesture, and picking clears the query ready for the next
 * item. Options take `mousedown` without focus so a click does not blur the
 * input and close the list before the click lands.
 */
function ItemSearch({
  catalogue,
  loading,
  disabled,
  onPick,
}: {
  catalogue: CatalogueItem[];
  loading: boolean;
  disabled: boolean;
  onPick: (code: string) => void;
}) {
  const t = useTranslations("home.itemListPicker");
  const inputId = useId();
  const listboxId = useId();
  const anchorRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const results = useMemo(
    () => searchCatalogue(catalogue, query).slice(0, MAX_SEARCH_RESULTS),
    [catalogue, query],
  );
  const popoverOpen = open && !disabled && !loading;
  const activeIndex = Math.min(active, results.length - 1);
  const optionId = (index: number) => `${listboxId}-option-${index}`;

  function pick(item: CatalogueItem) {
    onPick(item.code);
    setQuery("");
    setActive(0);
    setOpen(false);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!popoverOpen) {
          setOpen(true);
          setActive(0);
        } else if (results.length > 0) {
          setActive((activeIndex + 1) % results.length);
        }
        break;
      case "ArrowUp":
        event.preventDefault();
        if (!popoverOpen) {
          setOpen(true);
          setActive(Math.max(0, results.length - 1));
        } else if (results.length > 0) {
          setActive((activeIndex - 1 + results.length) % results.length);
        }
        break;
      case "Enter": {
        event.preventDefault();
        const item = results[activeIndex];
        if (popoverOpen && item) {
          pick(item);
        }
        break;
      }
      case "Escape":
        if (popoverOpen) {
          event.preventDefault();
          setOpen(false);
        } else if (query !== "") {
          event.preventDefault();
          setQuery("");
        }
        break;
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className={FIELD_LABEL_CLASSES}>
        {t("searchLabel")}
      </label>
      <Popover
        open={popoverOpen}
        onOpenChange={(next) => {
          if (!next) setOpen(false);
        }}
      >
        <PopoverAnchor asChild>
          <div ref={anchorRef} className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted"
            />
            <input
              id={inputId}
              type="text"
              role="combobox"
              autoComplete="off"
              aria-autocomplete="list"
              aria-expanded={popoverOpen}
              aria-controls={
                popoverOpen && results.length > 0 ? listboxId : undefined
              }
              aria-activedescendant={
                popoverOpen && results.length > 0
                  ? optionId(activeIndex)
                  : undefined
              }
              placeholder={
                loading ? t("catalogueLoading") : t("searchPlaceholder")
              }
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
                setOpen(event.target.value.trim() !== "");
              }}
              onKeyDown={handleKeyDown}
              onBlur={() => setOpen(false)}
              className={cn(NATIVE_FIELD_CLASSES, "pl-8")}
            />
          </div>
        </PopoverAnchor>
        <PopoverContent
          align="start"
          // Focus stays in the input: the list is navigated through
          // `aria-activedescendant`, never by moving focus into it.
          onOpenAutoFocus={(event) => event.preventDefault()}
          // Nothing in the list may take focus from the input — not an
          // option, and not the list's own scrollbar.
          onMouseDown={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onInteractOutside={(event) => {
            if (anchorRef.current?.contains(event.target as Node)) {
              event.preventDefault();
            }
          }}
          className="w-(--radix-popover-trigger-width) gap-0 border-line bg-ink p-1 text-paper ring-line"
        >
          {results.length === 0 ? (
            <p role="status" className="px-2.5 py-2 text-xs text-muted">
              {t("searchNoMatches", { query: query.trim() })}
            </p>
          ) : (
            <ul
              id={listboxId}
              role="listbox"
              aria-label={t("searchLabel")}
              className="flex max-h-72 flex-col overflow-y-auto"
            >
              {results.map((item, index) => {
                const groupKey = isGroupCode(item.group)
                  ? GROUP_KEYS[item.group]
                  : null;
                return (
                  <li
                    key={item.code}
                    id={optionId(index)}
                    role="option"
                    aria-selected={index === activeIndex}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseMove={() => {
                      if (index !== activeIndex) setActive(index);
                    }}
                    onClick={() => pick(item)}
                    className={cn(
                      "flex cursor-pointer items-baseline justify-between gap-3 rounded-md px-2.5 py-2 text-sm",
                      index === activeIndex && "bg-surface",
                    )}
                  >
                    <span className="text-paper">{item.label}</span>
                    {groupKey ? (
                      <span className="shrink-0 text-xs text-muted">
                        {t(`groups.${groupKey}`)}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* BrowseGroups                                                               */
/* -------------------------------------------------------------------------- */

/**
 * A room/group dropdown under the search ("All" first, then every group the
 * catalogue has), then the chosen group's items as buttons that add one each.
 * A native `<select>`: one compact control instead of a sideways-scrolling
 * chip row, with the platform's own picker on a phone. Each group option
 * carries a count of the items already listed from it, the dropdown's version
 * of the chip badge.
 *
 * A new `initialGroup` (the client picked another goods shortcut in the step
 * above, with this picker already on screen) is a new request: it replaces
 * whatever group was picked by hand. Only the browse group moves — the listed
 * lines are the parent's and are untouched.
 */
function BrowseGroups({
  catalogue,
  initialGroup,
  listedByCode,
  onPick,
}: {
  catalogue: CatalogueItem[];
  initialGroup: ItemGroupCode | "ALL" | null;
  listedByCode: ReadonlyMap<string, number>;
  onPick: (code: string) => void;
}) {
  const t = useTranslations("home.itemListPicker");
  const selectId = useId();
  const [chosen, setChosen] = useState<ItemGroupCode | "ALL" | null>(null);
  // Adjusted during render rather than in an effect, so the chip and the items
  // under it switch in the same paint as the shortcut that asked for them.
  const [requestedGroup, setRequestedGroup] = useState(initialGroup);
  if (requestedGroup !== initialGroup) {
    setRequestedGroup(initialGroup);
    setChosen(null);
  }

  const groups = useMemo(() => {
    const present = new Set(catalogue.map((item) => item.group));
    return GROUP_ORDER.filter((group) => present.has(group));
  }, [catalogue]);

  const requested = chosen ?? initialGroup;
  const selected: ItemGroupCode | "ALL" =
    requested === "ALL" || (requested && groups.includes(requested))
      ? requested
      : (groups[0] ?? "ALL");

  if (groups.length === 0) {
    return null;
  }

  const shownGroups = selected === "ALL" ? groups : [selected];
  const groupOptions: (ItemGroupCode | "ALL")[] = ["ALL", ...groups];
  // Units already listed from each group, for the option badges.
  const listedPerGroup = new Map<string, number>();
  for (const item of catalogue) {
    const listed = listedByCode.get(item.code) ?? 0;
    if (listed > 0) {
      listedPerGroup.set(
        item.group,
        (listedPerGroup.get(item.group) ?? 0) + listed,
      );
    }
  }
  const listedTotal = [...listedPerGroup.values()].reduce(
    (sum, count) => sum + count,
    0,
  );
  const optionLabel = (option: ItemGroupCode | "ALL"): string => {
    const label =
      option === "ALL" ? t("browseAll") : t(`groups.${GROUP_KEYS[option]}`);
    const count =
      option === "ALL" ? listedTotal : (listedPerGroup.get(option) ?? 0);
    return count > 0 ? `${label} (${count})` : label;
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-w-0 flex-col">
        <label htmlFor={selectId} className={LEGEND_CLASSES}>
          {t("browseLegend")}
        </label>
        <select
          id={selectId}
          value={selected}
          onChange={(event) =>
            setChosen(event.target.value as ItemGroupCode | "ALL")
          }
          className={BROWSE_SELECT_CLASSES}
        >
          {groupOptions.map((option) => (
            <option key={option} value={option}>
              {optionLabel(option)}
            </option>
          ))}
        </select>
      </div>

      {shownGroups.map((group) => (
        <section key={group} className="flex flex-col gap-2">
          {selected === "ALL" ? (
            <h3 className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">
              {t(`groups.${GROUP_KEYS[group]}`)}
            </h3>
          ) : null}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {catalogue
              .filter((item) => item.group === group)
              .map((item) => {
                const listed = listedByCode.get(item.code) ?? 0;
                return (
                  <button
                    key={item.code}
                    type="button"
                    onClick={() => onPick(item.code)}
                    aria-label={
                      listed > 0
                        ? `${t("addItem", { item: item.label })} · ${t("listedCount", { count: listed })}`
                        : t("addItem", { item: item.label })
                    }
                    className={cn(
                      "relative flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-left text-[0.8125rem] leading-snug text-paper transition-colors outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/20",
                      listed > 0
                        ? PICK_CARD_SELECTED_CLASSES
                        : PICK_CARD_IDLE_CLASSES,
                    )}
                  >
                    <Plus
                      aria-hidden="true"
                      className="size-3.5 shrink-0 text-muted"
                    />
                    <span className="flex-1">{item.label}</span>
                    {listed > 0 ? (
                      <span
                        aria-hidden="true"
                        className="font-price text-xs font-semibold text-accent tabular-nums"
                      >
                        ×{listed}
                      </span>
                    ) : null}
                  </button>
                );
              })}
          </div>
        </section>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Quantity stepper                                                           */
/* -------------------------------------------------------------------------- */

/**
 * `−` / number / `+`. The number field keeps what is being typed as a local
 * draft and reports only whole numbers in range, so clearing it to type "12"
 * never sends an empty or zero quantity upwards; leaving the field restores
 * the last good value.
 */
function QuantityStepper({
  value,
  max,
  onChange,
  decreaseLabel,
  increaseLabel,
  inputLabel,
}: {
  value: number;
  max: number;
  onChange: (value: number) => void;
  decreaseLabel: string;
  increaseLabel: string;
  inputLabel: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? String(value);

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label={decreaseLabel}
        disabled={value <= 1}
        onClick={() => onChange(value - 1)}
        className={ICON_BUTTON_CLASSES}
      >
        <Minus aria-hidden="true" className="size-3.5" />
      </button>
      <input
        type="text"
        inputMode="numeric"
        aria-label={inputLabel}
        value={text}
        onChange={(event) => {
          const next = event.target.value.replace(/\D/g, "").slice(0, 2);
          setDraft(next);
          const parsed = Number(next);
          if (next !== "" && parsed >= 1 && parsed <= max) {
            onChange(parsed);
          }
        }}
        onBlur={() => setDraft(null)}
        onKeyDown={swallowEnter}
        className={cn(
          NATIVE_FIELD_CLASSES,
          "h-9 w-12 px-1 text-center font-price tabular-nums",
        )}
      />
      <button
        type="button"
        aria-label={increaseLabel}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
        className={ICON_BUTTON_CLASSES}
      >
        <Plus aria-hidden="true" className="size-3.5" />
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* ItemLineRow                                                                */
/* -------------------------------------------------------------------------- */

function ItemLineRow({
  line,
  name,
  unavailable,
  onQuantityChange,
  onRemove,
}: {
  line: PickerLine;
  name: string;
  unavailable: boolean;
  onQuantityChange: (quantity: number) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("home.itemListPicker");

  let meta: string | null = null;
  if (line.kind === "CUSTOM") {
    meta = line.preset
      ? t("customMetaPreset", { size: line.preset })
      : t("customMetaExact", {
          dimensions: formatLoadDimensionsM(
            line.lengthM,
            line.widthM,
            line.heightM,
          ),
        });
  } else if (unavailable) {
    meta = t("unavailableItem");
  }

  return (
    <li className="flex items-center gap-3 rounded-lg border border-line px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-paper">{name}</p>
        {meta ? (
          <p
            className={cn(
              "text-xs leading-snug",
              unavailable ? "text-accent" : "text-muted",
            )}
          >
            {meta}
          </p>
        ) : null}
      </div>
      <QuantityStepper
        value={line.quantity}
        max={maxQuantity(line)}
        onChange={onQuantityChange}
        decreaseLabel={t("decrease", { item: name })}
        increaseLabel={t("increase", { item: name })}
        inputLabel={t("quantityOf", { item: name })}
      />
      <button
        type="button"
        aria-label={t("remove", { item: name })}
        onClick={onRemove}
        className={cn(ICON_BUTTON_CLASSES, "border-transparent text-muted")}
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/* CustomItemForm                                                             */
/* -------------------------------------------------------------------------- */

const EXACT_FIELDS = [
  {
    key: "lengthM",
    labelKey: "exactLength",
    bounds: CARGO_MEASUREMENT_BOUNDS.cargoLengthM,
  },
  // Width is bounded by the length ceiling, as the route does: length and
  // width are normalised (longer side first) after typing, and the narrower
  // side is checked against the width ceiling on its own below.
  {
    key: "widthM",
    labelKey: "exactWidth",
    bounds: CARGO_MEASUREMENT_BOUNDS.cargoLengthM,
  },
  {
    key: "heightM",
    labelKey: "exactHeight",
    bounds: CARGO_MEASUREMENT_BOUNDS.cargoHeightM,
  },
  {
    key: "weightKg",
    labelKey: "exactWeight",
    bounds: CARGO_MEASUREMENT_BOUNDS.cargoWeightKg,
  },
] as const;

type ExactKey = (typeof EXACT_FIELDS)[number]["key"];

/**
 * The inline "Other item" row: a label, a quantity, a rough size (S–XL radios)
 * and, behind a disclosure, exact figures. It is a draft until "Add item" —
 * nothing reaches the list, the plan or the quote while it is being filled in.
 * Escape anywhere in the row cancels it. The label field takes focus when the
 * row opens; the parent returns focus to "Other item" when it closes.
 */
function CustomItemForm({
  onAdd,
  onCancel,
}: {
  onAdd: (draft: CustomItemDraft) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("home.itemListPicker");
  const baseId = useId();
  const labelRef = useRef<HTMLInputElement>(null);
  const [label, setLabel] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [preset, setPreset] = useState<CustomSizePreset>("M");
  const [exactOpen, setExactOpen] = useState(false);
  const [exact, setExact] = useState<Record<ExactKey, string>>({
    lengthM: "",
    widthM: "",
    heightM: "",
    weightKg: "",
  });
  const [error, setError] = useState<{
    field: "label" | "exact";
    message: string;
  } | null>(null);

  useEffect(() => {
    labelRef.current?.focus();
  }, []);

  function submit() {
    const trimmed = label.trim();
    if (trimmed === "") {
      setError({ field: "label", message: t("customLabelRequired") });
      labelRef.current?.focus();
      return;
    }

    const typed = Object.values(exact).some((value) => value.trim() !== "");
    if (exactOpen && typed) {
      const values = Object.fromEntries(
        EXACT_FIELDS.map(({ key }) => [key, parseDecimal(exact[key])]),
      ) as Record<ExactKey, number | null>;
      const allValid = EXACT_FIELDS.every(({ key, bounds }) =>
        withinBounds(values[key], bounds),
      );
      if (!allValid) {
        setError({ field: "exact", message: t("exactInvalid") });
        return;
      }
      const lengthM = values.lengthM as number;
      const widthM = values.widthM as number;
      if (
        Math.min(lengthM, widthM) > CARGO_MEASUREMENT_BOUNDS.cargoWidthM.max
      ) {
        setError({
          field: "exact",
          message: t("exactTooWide", {
            max: CARGO_MEASUREMENT_BOUNDS.cargoWidthM.max,
          }),
        });
        return;
      }
      onAdd({
        label: trimmed,
        quantity,
        exact: {
          lengthM,
          widthM,
          heightM: values.heightM as number,
          weightKg: values.weightKg as number,
        },
      });
      return;
    }

    onAdd({ label: trimmed, quantity, preset });
  }

  const errorId = `${baseId}-error`;

  return (
    <fieldset
      className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-3.5"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      <legend className="sr-only">{t("customLegend")}</legend>
      <p
        aria-hidden="true"
        className="text-[0.8125rem] font-semibold text-paper"
      >
        {t("customLegend")}
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-48 flex-1 flex-col gap-1.5">
          <label htmlFor={`${baseId}-label`} className={FIELD_LABEL_CLASSES}>
            {t("customLabel")}
          </label>
          <input
            ref={labelRef}
            id={`${baseId}-label`}
            type="text"
            value={label}
            maxLength={CUSTOM_LABEL_MAX_LENGTH}
            placeholder={t("customLabelPlaceholder")}
            aria-invalid={error?.field === "label" || undefined}
            aria-describedby={error?.field === "label" ? errorId : undefined}
            onChange={(event) => {
              setLabel(event.target.value);
              setError(null);
            }}
            onKeyDown={(event) => {
              if (swallowEnter(event)) submit();
            }}
            className={NATIVE_FIELD_CLASSES}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span aria-hidden="true" className={FIELD_LABEL_CLASSES}>
            {t("customQuantity")}
          </span>
          <QuantityStepper
            value={quantity}
            max={maxQuantity({ kind: "CUSTOM" })}
            onChange={setQuantity}
            decreaseLabel={t("decrease", {
              item: label.trim() || t("otherItem"),
            })}
            increaseLabel={t("increase", {
              item: label.trim() || t("otherItem"),
            })}
            inputLabel={t("quantityOf", {
              item: label.trim() || t("otherItem"),
            })}
          />
        </div>
      </div>

      <fieldset
        disabled={
          exactOpen && Object.values(exact).some((v) => v.trim() !== "")
        }
      >
        <legend className={LEGEND_CLASSES}>{t("customSizeLegend")}</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {SIZE_PRESETS.map((option) => {
            const selected = option === preset;
            const size = CUSTOM_SIZE_PRESETS[option];
            const hint = `${formatLoadDimensionsM(size.lengthM, size.widthM, size.heightM)} · ~${formatLoadWeightKg(size.weightKg)}`;
            return (
              <label
                key={option}
                className={cn(
                  RADIO_CARD_CLASSES,
                  "p-2.5",
                  selected
                    ? PICK_CARD_SELECTED_CLASSES
                    : PICK_CARD_IDLE_CLASSES,
                  "has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50",
                )}
              >
                <input
                  type="radio"
                  name={`${baseId}-size`}
                  value={option}
                  checked={selected}
                  onChange={() => setPreset(option)}
                  aria-label={`${option} — ${t(`sizeNames.${option}`)} · ${hint}`}
                  className="sr-only"
                />
                <span
                  aria-hidden="true"
                  className="pr-5 text-sm font-semibold text-paper"
                >
                  {option}{" "}
                  <span className="font-normal text-muted">
                    {t(`sizeNames.${option}`)}
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className="font-price text-[0.6875rem] text-muted tabular-nums"
                >
                  {hint}
                </span>
                {selected ? <SelectedTick /> : null}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-col gap-3">
        <button
          type="button"
          aria-expanded={exactOpen}
          aria-controls={`${baseId}-exact`}
          onClick={() => setExactOpen((open) => !open)}
          className="inline-flex w-fit items-center gap-1 rounded text-[0.8125rem] font-medium text-accent outline-none focus-visible:ring-3 focus-visible:ring-accent/20"
        >
          {t("exactToggle")}
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "size-4 transition-transform",
              exactOpen && "rotate-180",
            )}
          />
        </button>
        <div
          id={`${baseId}-exact`}
          hidden={!exactOpen}
          className="grid grid-cols-2 gap-3 sm:grid-cols-4"
        >
          {EXACT_FIELDS.map(({ key, labelKey, bounds }) => {
            const fieldId = `${baseId}-${key}`;
            const hintId = `${fieldId}-hint`;
            const value = exact[key];
            const invalid =
              value.trim() !== "" && !withinBounds(parseDecimal(value), bounds);
            return (
              <div key={key} className="flex flex-col gap-1.5">
                <label htmlFor={fieldId} className={FIELD_LABEL_CLASSES}>
                  {t(labelKey)}
                </label>
                <input
                  id={fieldId}
                  type="text"
                  inputMode="decimal"
                  value={value}
                  aria-invalid={invalid || undefined}
                  aria-describedby={
                    error?.field === "exact" ? `${hintId} ${errorId}` : hintId
                  }
                  onChange={(event) => {
                    setExact((current) => ({
                      ...current,
                      [key]: event.target.value,
                    }));
                    setError(null);
                  }}
                  onKeyDown={(event) => {
                    if (swallowEnter(event)) submit();
                  }}
                  className={cn(
                    NATIVE_FIELD_CLASSES,
                    "font-price tabular-nums",
                  )}
                />
                <p
                  id={hintId}
                  className="font-price text-[0.6875rem] text-muted tabular-nums"
                >
                  {t("numberRange", {
                    min: bounds.min,
                    max: bounds.max,
                    unit: t(`units.${bounds.unit}`),
                  })}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {error ? (
        <p id={errorId} role="alert" className={FIELD_ERROR_CLASSES}>
          {error.message}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={submit}
          className={PRIMARY_BUTTON_CLASSES}
        >
          {t("addCustom")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className={SECONDARY_BUTTON_CLASSES}
        >
          {t("cancel")}
        </button>
      </div>
    </fieldset>
  );
}

/* -------------------------------------------------------------------------- */
/* Decimal field                                                              */
/* -------------------------------------------------------------------------- */

/**
 * A committed figure on a pallet line (height, exact weight). Like the
 * quantity field, it keeps a local draft and reports only values inside
 * `bounds`; leaving it restores the last good figure.
 */
function DecimalField({
  label,
  value,
  bounds,
  onCommit,
}: {
  label: string;
  value: number;
  bounds: CargoMeasurementBounds;
  onCommit: (value: number) => void;
}) {
  const t = useTranslations("home.itemListPicker");
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? String(value);
  const invalid = draft !== null && !withinBounds(parseDecimal(draft), bounds);

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={FIELD_LABEL_CLASSES}>
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        value={text}
        aria-invalid={invalid || undefined}
        aria-describedby={`${id}-hint`}
        onChange={(event) => {
          setDraft(event.target.value);
          const parsed = parseDecimal(event.target.value);
          if (withinBounds(parsed, bounds)) {
            onCommit(parsed);
          }
        }}
        onBlur={() => setDraft(null)}
        onKeyDown={swallowEnter}
        className={cn(NATIVE_FIELD_CLASSES, "font-price tabular-nums")}
      />
      <p
        id={`${id}-hint`}
        className={cn(
          "font-price text-[0.6875rem] tabular-nums",
          invalid ? "text-accent" : "text-muted",
        )}
      >
        {t("numberRange", {
          min: bounds.min,
          max: bounds.max,
          unit: t(`units.${bounds.unit}`),
        })}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* PalletLineEditor                                                           */
/* -------------------------------------------------------------------------- */

/**
 * One pallet group: type, contents, count, height and weight per pallet. Every
 * choice is a native radio group named per line, so two groups never share a
 * radio name. `onChange` takes an updater over the whole list, so the parent
 * applies it to the list it currently holds.
 */
function PalletLineEditor({
  line,
  number,
  onChange,
}: {
  line: PalletPickerLine;
  number: number;
  onChange: (update: (lines: PickerLine[]) => PickerLine[]) => void;
}) {
  const t = useTranslations("home.itemListPicker");
  const baseId = useId();
  const weightChoice: PalletWeightPreset | "EXACT" =
    line.weightPreset ?? "EXACT";

  function chip(
    name: string,
    value: string,
    selected: boolean,
    onSelect: () => void,
    content: React.ReactNode,
    ariaLabel?: string,
  ) {
    return (
      <label
        key={value}
        className={cn(
          RADIO_CARD_CLASSES,
          "p-2.5",
          selected ? PICK_CARD_SELECTED_CLASSES : PICK_CARD_IDLE_CLASSES,
        )}
      >
        <input
          type="radio"
          name={`${baseId}-${name}`}
          value={value}
          checked={selected}
          onChange={onSelect}
          aria-label={ariaLabel}
          className="sr-only"
        />
        {content}
        {selected ? <SelectedTick /> : null}
      </label>
    );
  }

  return (
    <fieldset className="flex flex-col gap-4 rounded-xl border border-line p-3.5">
      <legend className="sr-only">{t("palletGroup", { number })}</legend>
      <div className="flex items-center justify-between gap-3">
        <p
          aria-hidden="true"
          className="text-[0.8125rem] font-semibold text-paper"
        >
          {t("palletGroup", { number })}
        </p>
        <button
          type="button"
          aria-label={t("removePalletGroup", { number })}
          onClick={() => onChange((lines) => removeLine(lines, line.id))}
          className={cn(ICON_BUTTON_CLASSES, "border-transparent text-muted")}
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>

      <fieldset>
        <legend className={LEGEND_CLASSES}>{t("palletTypeLegend")}</legend>
        <div className="grid grid-cols-2 gap-2">
          {PALLET_TYPE_OPTIONS.map((type) => {
            const size = PALLET_TYPES[type];
            const dims = formatFootprintM(size.lengthM, size.widthM);
            return chip(
              "type",
              type,
              line.palletType === type,
              () =>
                onChange((lines) =>
                  updatePalletLine(lines, line.id, { palletType: type }),
                ),
              <>
                <span
                  aria-hidden="true"
                  className="pr-5 text-sm font-semibold text-paper"
                >
                  {t(`palletTypes.${type}`)}
                </span>
                <span
                  aria-hidden="true"
                  className="font-price text-[0.6875rem] text-muted tabular-nums"
                >
                  {dims}
                </span>
              </>,
              `${t(`palletTypes.${type}`)} ${dims}`,
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className={LEGEND_CLASSES}>{t("contentsLegend")}</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PALLET_CONTENTS_OPTIONS.map((contents) =>
            chip(
              "contents",
              contents,
              line.contents === contents,
              () =>
                onChange((lines) =>
                  updatePalletLine(lines, line.id, { contents }),
                ),
              <span className="pr-5 text-[0.8125rem] font-medium text-paper">
                {t(`contents.${contents}`)}
              </span>,
            ),
          )}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <span aria-hidden="true" className={FIELD_LABEL_CLASSES}>
            {t("palletCount")}
          </span>
          <QuantityStepper
            value={line.quantity}
            max={MAX_PALLET_COUNT}
            onChange={(quantity) =>
              onChange((lines) => setLineQuantity(lines, line.id, quantity))
            }
            decreaseLabel={t("decreasePallets", { number })}
            increaseLabel={t("increasePallets", { number })}
            inputLabel={`${t("palletCount")} · ${t("palletGroup", { number })}`}
          />
        </div>
        <DecimalField
          label={t("palletHeight")}
          value={line.heightM}
          bounds={CARGO_MEASUREMENT_BOUNDS.cargoHeightM}
          onCommit={(heightM) =>
            onChange((lines) => updatePalletLine(lines, line.id, { heightM }))
          }
        />
      </div>

      <fieldset>
        <legend className={LEGEND_CLASSES}>{t("palletWeightLegend")}</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[...WEIGHT_PRESET_OPTIONS, "EXACT" as const].map((option) => {
            const figure =
              option === "EXACT"
                ? null
                : `~${formatLoadWeightKg(PALLET_WEIGHT_PRESETS[option])}`;
            return chip(
              "weight",
              option,
              weightChoice === option,
              () =>
                onChange((lines) =>
                  updatePalletLine(
                    lines,
                    line.id,
                    option === "EXACT"
                      ? { weightPreset: null, weightKg: line.weightKg }
                      : { weightPreset: option },
                  ),
                ),
              <>
                <span
                  aria-hidden="true"
                  className="pr-5 text-[0.8125rem] font-medium text-paper"
                >
                  {t(`weights.${option}`)}
                </span>
                {figure ? (
                  <span
                    aria-hidden="true"
                    className="font-price text-[0.6875rem] text-muted tabular-nums"
                  >
                    {figure}
                  </span>
                ) : null}
              </>,
              figure
                ? `${t(`weights.${option}`)} ${figure}`
                : t(`weights.${option}`),
            );
          })}
        </div>
        {weightChoice === "EXACT" ? (
          <div className="mt-3 sm:w-1/2">
            <DecimalField
              label={t("palletExactWeight")}
              value={line.weightKg}
              bounds={CARGO_MEASUREMENT_BOUNDS.cargoWeightKg}
              onCommit={(weightKg) =>
                onChange((lines) =>
                  updatePalletLine(lines, line.id, {
                    weightPreset: null,
                    weightKg,
                  }),
                )
              }
            />
          </div>
        ) : null}
      </fieldset>
    </fieldset>
  );
}
