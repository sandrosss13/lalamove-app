/**
 * The item list picker's state, as plain data and pure functions: what a line
 * is, how adding, merging, stepping and removing change the list, and how the
 * list turns into the two things the rest of the booking flow reads from it —
 * the `items` request body `POST /api/orders` parses, and the `LoadLine`s
 * `planLoad` sums for the running summary.
 *
 * **Why it is its own module rather than more of the component.** The picker
 * (`item-list-picker.tsx`) is a `"use client"` file full of hooks, and a spec
 * cannot load one without a browser. Everything here is a function of its
 * arguments, so `tests/item-list-lines.spec.ts` checks it with object literals —
 * and, more to the point, checks `toItemsPayload` against the server's own
 * `parseOrderItems`, so the shape the form sends and the shape the route
 * accepts cannot drift apart without a red test.
 *
 * **One list, two modes.** The parent holds a single `PickerLine[]` holding
 * both item lines (catalogue and custom) and pallet lines. Switching between
 * Items and Pallets never deletes anything — a business that flips to Pallets
 * by mistake and back finds its sofa still listed — but only the *active*
 * mode's lines are ever planned or submitted (`activeLines`). That is also what
 * keeps the request inside the route's rule that one order is either all
 * pallets or no pallets (`parseOrderItems`' `mixedModes` refusal).
 *
 * **Client and server compute the same plan.** `toLoadLines` builds each line
 * through exactly the function the route's `resolveOrderItems` uses for that
 * kind: `toLoadLine` for a catalogue entry, `customLine({ exact })` for a custom
 * item, `palletLine` for pallets. A custom line picked by size preset is sent
 * — and therefore planned here — as the preset's *figures*, not the preset,
 * because the request shape only carries figures. The one consequence is that
 * an XL custom item counts as stackable on both sides, where
 * `customLine({ preset: "XL" })` would not; planning it the server's way is the
 * point, since "the form said it fits" and "the server agreed" must stay the
 * same sentence (see `load-plan.ts`).
 *
 * Deliberately free of React, Prisma and `server-only`, like the modules it
 * reads.
 */

import { toLoadLine, type CatalogueItem } from "@/lib/item-catalogue";
import {
  CUSTOM_SIZE_PRESETS,
  customLine,
  MAX_LINE_QUANTITY,
  MAX_PALLET_COUNT,
  PALLET_DEFAULT_HEIGHT_M,
  PALLET_WEIGHT_PRESETS,
  palletLine,
  type CustomSizePreset,
  type LoadLine,
  type PalletContents,
  type PalletType,
} from "@/lib/orders/load-plan";
import {
  MAX_ITEM_LINES,
  type OrderItemRequest,
} from "@/lib/orders/parse-items";

/* -------------------------------------------------------------------------- */
/* Shapes                                                                     */
/* -------------------------------------------------------------------------- */

/** Which half of the picker is showing. Pallets is business-only. */
export type PickerMode = "items" | "pallets";

export type PalletWeightPreset = keyof typeof PALLET_WEIGHT_PRESETS;

/**
 * One line of the picker. `id` is a client-only key, stable for the line's
 * life, so React keys, focus and the parent's quote invalidation survive a
 * reorder or a removal above it. It is never sent.
 */
export type PickerLine =
  | {
      id: string;
      kind: "CATALOGUE";
      code: string;
      quantity: number;
    }
  | {
      id: string;
      kind: "CUSTOM";
      label: string;
      quantity: number;
      /**
       * The size button the client picked, kept only to label the line
       * ("Size L"); `null` when exact figures were typed. The figures below
       * are always filled either way, and they are what is sent.
       */
      preset: CustomSizePreset | null;
      lengthM: number;
      widthM: number;
      heightM: number;
      /** Per item. */
      weightKg: number;
    }
  | {
      id: string;
      kind: "PALLET";
      palletType: PalletType;
      contents: PalletContents;
      /** Number of pallets, 1–`MAX_PALLET_COUNT`. */
      quantity: number;
      /** Loaded height per pallet. */
      heightM: number;
      /** The weight radio picked; `null` when an exact figure was typed. */
      weightPreset: PalletWeightPreset | null;
      /** Per pallet. Always filled: the preset's figure, or the typed one. */
      weightKg: number;
    };

export type CataloguePickerLine = Extract<PickerLine, { kind: "CATALOGUE" }>;
export type CustomPickerLine = Extract<PickerLine, { kind: "CUSTOM" }>;
export type PalletPickerLine = Extract<PickerLine, { kind: "PALLET" }>;

/* -------------------------------------------------------------------------- */
/* Mode                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The mode that actually applies. Pallets are business-only, and an account
 * type still loading (`null`) reads as an individual — the same reading
 * `decideItemsBooking` takes on the server — so a stale `"pallets"` from a
 * shortcut never shows, plans or submits pallets for anyone else.
 */
export function effectiveMode(
  mode: PickerMode,
  accountType: "INDIVIDUAL" | "BUSINESS" | null,
): PickerMode {
  return accountType === "BUSINESS" ? mode : "items";
}

/** The lines that belong to `mode`; the others stay in state, unsent. */
export function activeLines(
  lines: readonly PickerLine[],
  mode: PickerMode,
): PickerLine[] {
  return lines.filter((line) =>
    mode === "pallets" ? line.kind === "PALLET" : line.kind !== "PALLET",
  );
}

/** Whether another line may be added in `mode` without passing the route's cap. */
export function canAddLine(
  lines: readonly PickerLine[],
  mode: PickerMode,
): boolean {
  return activeLines(lines, mode).length < MAX_ITEM_LINES;
}

/* -------------------------------------------------------------------------- */
/* Editing                                                                    */
/* -------------------------------------------------------------------------- */

/** The most a line of this kind may count: 99 items, or 33 pallets. */
export function maxQuantity(line: Pick<PickerLine, "kind">): number {
  return line.kind === "PALLET" ? MAX_PALLET_COUNT : MAX_LINE_QUANTITY;
}

function clampQuantity(quantity: number, max: number): number {
  if (!Number.isFinite(quantity)) {
    return 1;
  }
  return Math.min(max, Math.max(1, Math.round(quantity)));
}

/**
 * A fresh id not used by any line: `line-<n>` with `n` one past the highest
 * already present. Derived from the list rather than a module counter so a
 * remounted picker, handed lines the parent kept, can never mint a duplicate.
 */
export function nextLineId(lines: readonly PickerLine[]): string {
  let highest = 0;
  for (const { id } of lines) {
    const match = /^line-(\d+)$/.exec(id);
    if (match) {
      highest = Math.max(highest, Number(match[1]));
    }
  }
  return `line-${highest + 1}`;
}

/**
 * Add one of a catalogue entry: a new line at quantity 1, or one more on the
 * line already listing it (capped at `MAX_LINE_QUANTITY`). Search and browse
 * both come through here, so picking "Sofa" twice reads as two sofas, never as
 * two sofa lines. A new line is refused (list unchanged) once the cap on lines
 * is reached; topping up an existing one never is.
 */
export function addCatalogueItem(
  lines: readonly PickerLine[],
  code: string,
): PickerLine[] {
  const existing = lines.find(
    (line) => line.kind === "CATALOGUE" && line.code === code,
  );
  if (existing) {
    return setLineQuantity(lines, existing.id, existing.quantity + 1);
  }
  if (!canAddLine(lines, "items")) {
    return [...lines];
  }
  return [
    ...lines,
    { id: nextLineId(lines), kind: "CATALOGUE", code, quantity: 1 },
  ];
}

/** Set a line's quantity, clamped to 1–its kind's maximum. */
export function setLineQuantity(
  lines: readonly PickerLine[],
  id: string,
  quantity: number,
): PickerLine[] {
  return lines.map((line) =>
    line.id === id
      ? { ...line, quantity: clampQuantity(quantity, maxQuantity(line)) }
      : line,
  );
}

export function removeLine(
  lines: readonly PickerLine[],
  id: string,
): PickerLine[] {
  return lines.filter((line) => line.id !== id);
}

/** The figures of a custom item, typed or taken from a size preset. */
export type CustomItemDraft = {
  label: string;
  quantity: number;
} & (
  | { preset: CustomSizePreset }
  | {
      exact: {
        lengthM: number;
        widthM: number;
        heightM: number;
        weightKg: number;
      };
    }
);

/**
 * Append a custom ("Other") item. Never merged with another line — two custom
 * items with the same label may well be different sizes. The label is trimmed;
 * validation of label and figures is the form's job before calling this.
 */
export function addCustomItem(
  lines: readonly PickerLine[],
  draft: CustomItemDraft,
): PickerLine[] {
  if (!canAddLine(lines, "items")) {
    return [...lines];
  }
  const figures =
    "preset" in draft ? CUSTOM_SIZE_PRESETS[draft.preset] : draft.exact;
  return [
    ...lines,
    {
      id: nextLineId(lines),
      kind: "CUSTOM",
      label: draft.label.trim(),
      quantity: clampQuantity(draft.quantity, MAX_LINE_QUANTITY),
      preset: "preset" in draft ? draft.preset : null,
      lengthM: figures.lengthM,
      widthM: figures.widthM,
      heightM: figures.heightM,
      weightKg: figures.weightKg,
    },
  ];
}

/**
 * Append a pallet group with the defaults a business most often means: EUR
 * pallets of general goods, one of them, at the default loaded height and the
 * medium weight preset.
 */
export function addPalletLine(lines: readonly PickerLine[]): PickerLine[] {
  if (!canAddLine(lines, "pallets")) {
    return [...lines];
  }
  return [
    ...lines,
    {
      id: nextLineId(lines),
      kind: "PALLET",
      palletType: "EUR",
      contents: "GENERAL",
      quantity: 1,
      heightM: PALLET_DEFAULT_HEIGHT_M,
      weightPreset: "MEDIUM",
      weightKg: PALLET_WEIGHT_PRESETS.MEDIUM,
    },
  ];
}

/** The editable fields of a pallet line. */
export type PalletLinePatch = Partial<
  Pick<PalletPickerLine, "palletType" | "contents" | "heightM">
> &
  (
    | { weightPreset: PalletWeightPreset }
    | { weightPreset: null; weightKg: number }
    | { weightPreset?: undefined }
  );

/**
 * Change one pallet group. Picking a weight preset also sets its figure, so
 * `weightKg` is always what will be sent; typing an exact weight clears the
 * preset.
 */
export function updatePalletLine(
  lines: readonly PickerLine[],
  id: string,
  patch: PalletLinePatch,
): PickerLine[] {
  return lines.map((line) => {
    if (line.id !== id || line.kind !== "PALLET") {
      return line;
    }
    const next: PalletPickerLine = { ...line };
    if (patch.palletType !== undefined) next.palletType = patch.palletType;
    if (patch.contents !== undefined) next.contents = patch.contents;
    if (patch.heightM !== undefined) next.heightM = patch.heightM;
    if (patch.weightPreset === null) {
      next.weightPreset = null;
      next.weightKg = patch.weightKg;
    } else if (patch.weightPreset !== undefined) {
      next.weightPreset = patch.weightPreset;
      next.weightKg = PALLET_WEIGHT_PRESETS[patch.weightPreset];
    }
    return next;
  });
}

/* -------------------------------------------------------------------------- */
/* Output                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The `items` body for `POST /api/orders`: the active mode's lines, in list
 * order, in exactly the shape `parseOrderItems` accepts. Client ids, presets
 * and anything else the route does not read are dropped. `mode` should be the
 * *effective* mode (`effectiveMode`) — an individual never sends pallets.
 */
export function toItemsPayload(
  lines: readonly PickerLine[],
  mode: PickerMode,
): OrderItemRequest[] {
  return activeLines(lines, mode).map((line): OrderItemRequest => {
    switch (line.kind) {
      case "CATALOGUE":
        return { kind: "CATALOGUE", code: line.code, quantity: line.quantity };
      case "CUSTOM":
        return {
          kind: "CUSTOM",
          label: line.label,
          quantity: line.quantity,
          weightKg: line.weightKg,
          lengthM: line.lengthM,
          widthM: line.widthM,
          heightM: line.heightM,
        };
      case "PALLET":
        return {
          kind: "PALLET",
          palletType: line.palletType,
          contents: line.contents,
          quantity: line.quantity,
          heightM: line.heightM,
          weightKg: line.weightKg,
        };
    }
  });
}

/**
 * The active lines as `LoadLine`s for `planLoad`, built through the same
 * functions the route resolves each kind with (see the module note). A
 * catalogue line whose entry is not in `catalogue` — still loading, or retired
 * since it was added — is left out rather than guessed at; the route refuses
 * an unknown code at submit (`catalogueUnavailable`) either way.
 */
export function toLoadLines(
  lines: readonly PickerLine[],
  mode: PickerMode,
  catalogue: readonly CatalogueItem[],
): LoadLine[] {
  const byCode = new Map(catalogue.map((item) => [item.code, item]));
  const loads: LoadLine[] = [];

  for (const line of activeLines(lines, mode)) {
    switch (line.kind) {
      case "CATALOGUE": {
        const item = byCode.get(line.code);
        if (item) {
          loads.push(toLoadLine(item, line.quantity));
        }
        break;
      }
      case "CUSTOM":
        loads.push(
          customLine({
            quantity: line.quantity,
            exact: {
              lengthM: line.lengthM,
              widthM: line.widthM,
              heightM: line.heightM,
              weightKg: line.weightKg,
            },
          }),
        );
        break;
      case "PALLET":
        loads.push(
          palletLine(
            line.palletType,
            line.contents,
            line.quantity,
            line.heightM,
            line.weightKg,
          ),
        );
        break;
    }
  }

  return loads;
}
