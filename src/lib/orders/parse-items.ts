/**
 * The `items` half of `POST /api/orders`: reading the item list a client sent,
 * resolving it to load lines, and deciding whether the resulting load plan may
 * be booked by this client.
 *
 * **Why it is its own module rather than more of the route.** The route file
 * imports `auth`, Prisma and `next/headers`, none of which can be loaded by a
 * spec with no database and no request scope. Everything here is a pure
 * function of its arguments — the catalogue rows arrive already fetched, the
 * account type already read, the translator already resolved — so
 * `tests/orders-items-parse.spec.ts` can exercise every refusal with object
 * literals, the same way `tests/load-plan.spec.ts` exercises the plan itself.
 *
 * **Deliberately dependency-free**, for the reason `load-plan.ts` gives: no
 * `server-only`, no Prisma import and no Prisma-generated type in a signature.
 * The route's Prisma rows satisfy the structural types below unchanged.
 *
 * **What this module does not do: fit, category and body logic.** Those belong
 * to `src/lib/orders/load-plan.ts` (`planLoad`, `palletLine`, `customLine`,
 * `summariseItems`) and are only called from here, never restated. Hard fit
 * against the booked class stays where it always was — the route's existing
 * `oversizeAxes` check, now fed the plan's envelope — and there is no soft-fit
 * refusal anywhere on the server (requirements §Assumptions: volume and floor
 * area steer a recommendation, they never refuse a booking).
 *
 * **Copy.** Every refusal is a message key under `errors.orders.orderItems`
 * (and the two field-level ones reuse `errors.orders.fieldMeasurementOutOfRange`
 * and `errors.orders.fieldTooLong`), translated through the `Translator` the
 * caller hands in, exactly as the route's own parsers do. That keeps this module
 * pure — the translator is an argument, never resolved here — while an
 * out-of-range pallet weight still reads exactly like an out-of-range typed
 * weight always has.
 */

import type { Translator } from "@/i18n/translator";
import {
  CARGO_MEASUREMENT_BOUNDS,
  type CargoMeasurementBounds,
} from "@/lib/cargo";
import {
  customLine,
  MAX_LINE_QUANTITY,
  MAX_PALLET_COUNT,
  PALLET_CONTENTS,
  PALLET_TYPES,
  palletLine,
  summariseItems,
  type CargoCategoryKey,
  type ChassisTypeKey,
  type HandlingTagKey,
  type LoadLine,
  type LoadPlan,
  type PalletContents,
  type PalletType,
} from "@/lib/orders/load-plan";

/* -------------------------------------------------------------------------- */
/* Request shape                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Most lines one order may list. Generous for a home move (a few dozen
 * distinct things) and small enough that one `findMany` and one nested create
 * stay trivially cheap on the booking path.
 */
export const MAX_ITEM_LINES = 60;

/** Longest custom-item label, after trimming. */
export const CUSTOM_LABEL_MAX_LENGTH = 80;

/**
 * One validated line of `items[]`.
 *
 * `PALLET` carries `contents` in addition to the shape sketched in the task
 * file: `palletLine` needs it to know the pallet's cargo category and whether
 * it forces a refrigerated body (requirements: "Pallet lines declare their
 * contents"). Without it a pallet of chilled food would book into a dry box.
 */
export type OrderItemRequest =
  | { kind: "CATALOGUE"; code: string; quantity: number }
  | {
      kind: "CUSTOM";
      label: string;
      quantity: number;
      weightKg: number;
      lengthM: number;
      widthM: number;
      heightM: number;
    }
  | {
      kind: "PALLET";
      palletType: PalletType;
      contents: PalletContents;
      quantity: number;
      heightM: number;
      weightKg: number;
    };

const ERROR_NAMESPACE = "errors.orders.orderItems";

/** The refusals new to the items path, by key under `errors.orders.orderItems`. */
export type ItemsErrorKey =
  | "itemsMustBeList"
  | "itemsEmpty"
  | "itemsTooMany"
  | "unknownKind"
  | "lineMustBeObject"
  | "quantityOutOfRange"
  | "codeRequired"
  | "labelRequired"
  | "palletTypeInvalid"
  | "palletContentsInvalid"
  | "mixedModes"
  | "catalogueUnavailable"
  | "palletsBusinessOnly"
  | "bodyConflict"
  | "bodyRequired"
  | "bodyMismatch"
  | "overMaximum";

/**
 * Translate one items-path refusal. Exported so the route can raise
 * `itemsEmpty` from its unreachable-plan guards in the same voice.
 */
export function itemsError(
  t: Translator,
  key: ItemsErrorKey,
  values?: Record<string, string | number>,
): string {
  return t(`${ERROR_NAMESPACE}.${key}`, values);
}

/** Keys of how a body is named inside `bodyMismatch`, under `errors.orders.orderItems.bodyPhrase`. */
const BODY_PHRASE_KEYS: Record<ChassisTypeKey, string> = {
  DRY_BOX: `${ERROR_NAMESPACE}.bodyPhrase.dryBox`,
  REFRIGERATED: `${ERROR_NAMESPACE}.bodyPhrase.refrigerated`,
  OPEN_CHASSIS: `${ERROR_NAMESPACE}.bodyPhrase.openChassis`,
};

/**
 * Snapshot labels for pallet lines, and the wording of the server-built
 * `packagingDescription` in pallets mode ("4 × EUR pallet, 2 × Industrial
 * pallet"). English in both locales: "EUR" is the standard's own name, and the
 * pair is read by drivers on the board exactly as it is written here.
 */
export const PALLET_LABELS: Record<PalletType, string> = {
  EUR: "EUR pallet",
  INDUSTRIAL: "Industrial pallet",
};

type ParseResult<T> = { value: T } | { error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A whole number from 1 to `max`. Strict about type, like the route's parsers. */
function parseQuantity(
  value: unknown,
  field: string,
  max: number,
  t: Translator,
): ParseResult<number> {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > max
  ) {
    return { error: itemsError(t, "quantityOutOfRange", { field, max }) };
  }
  return { value };
}

/**
 * One figure, checked against `CARGO_MEASUREMENT_BOUNDS` with the route's own
 * wording — the same test `parsePositiveMeasurement` applies to typed figures
 * (finite, greater than zero, no more than the shared ceiling).
 */
function parseMeasurement(
  value: unknown,
  field: string,
  bounds: CargoMeasurementBounds,
  t: Translator,
): ParseResult<number> {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0 ||
    value > bounds.max
  ) {
    return {
      error: t("errors.orders.fieldMeasurementOutOfRange", {
        field,
        max: bounds.max,
        unit: bounds.unit,
      }),
    };
  }
  return { value };
}

function parseLine(
  value: unknown,
  field: string,
  t: Translator,
): ParseResult<OrderItemRequest> {
  if (!isRecord(value)) {
    return { error: itemsError(t, "lineMustBeObject", { field }) };
  }

  switch (value.kind) {
    case "CATALOGUE": {
      const { code } = value;
      if (typeof code !== "string" || code.trim().length === 0) {
        return {
          error: itemsError(t, "codeRequired", { field: `${field}.code` }),
        };
      }
      const quantity = parseQuantity(
        value.quantity,
        `${field}.quantity`,
        MAX_LINE_QUANTITY,
        t,
      );
      if ("error" in quantity) {
        return quantity;
      }
      return {
        value: {
          kind: "CATALOGUE",
          code: code.trim(),
          quantity: quantity.value,
        },
      };
    }

    case "CUSTOM": {
      const { label } = value;
      if (typeof label !== "string" || label.trim().length === 0) {
        return {
          error: itemsError(t, "labelRequired", { field: `${field}.label` }),
        };
      }
      const trimmed = label.trim();
      if (trimmed.length > CUSTOM_LABEL_MAX_LENGTH) {
        return {
          error: t("errors.orders.fieldTooLong", {
            field: `${field}.label`,
            max: CUSTOM_LABEL_MAX_LENGTH,
          }),
        };
      }
      const quantity = parseQuantity(
        value.quantity,
        `${field}.quantity`,
        MAX_LINE_QUANTITY,
        t,
      );
      if ("error" in quantity) {
        return quantity;
      }
      const weightKg = parseMeasurement(
        value.weightKg,
        `${field}.weightKg`,
        CARGO_MEASUREMENT_BOUNDS.cargoWeightKg,
        t,
      );
      if ("error" in weightKg) {
        return weightKg;
      }
      const lengthM = parseMeasurement(
        value.lengthM,
        `${field}.lengthM`,
        CARGO_MEASUREMENT_BOUNDS.cargoLengthM,
        t,
      );
      if ("error" in lengthM) {
        return lengthM;
      }
      // Width is checked against the *length* ceiling here, not the width one:
      // `customLine` normalises length ≥ width, so a client who typed 2.6 × 1.0
      // has described a 2.6 m long item, not a 2.6 m wide one. The narrower
      // side is checked against the width ceiling just below, after the swap.
      const widthM = parseMeasurement(
        value.widthM,
        `${field}.widthM`,
        CARGO_MEASUREMENT_BOUNDS.cargoLengthM,
        t,
      );
      if ("error" in widthM) {
        return widthM;
      }
      if (
        Math.min(lengthM.value, widthM.value) >
        CARGO_MEASUREMENT_BOUNDS.cargoWidthM.max
      ) {
        return {
          error: t("errors.orders.fieldMeasurementOutOfRange", {
            field: `${field}.widthM`,
            max: CARGO_MEASUREMENT_BOUNDS.cargoWidthM.max,
            unit: CARGO_MEASUREMENT_BOUNDS.cargoWidthM.unit,
          }),
        };
      }
      const heightM = parseMeasurement(
        value.heightM,
        `${field}.heightM`,
        CARGO_MEASUREMENT_BOUNDS.cargoHeightM,
        t,
      );
      if ("error" in heightM) {
        return heightM;
      }
      return {
        value: {
          kind: "CUSTOM",
          label: trimmed,
          quantity: quantity.value,
          weightKg: weightKg.value,
          lengthM: lengthM.value,
          widthM: widthM.value,
          heightM: heightM.value,
        },
      };
    }

    case "PALLET": {
      const { palletType, contents } = value;
      if (
        typeof palletType !== "string" ||
        !Object.hasOwn(PALLET_TYPES, palletType)
      ) {
        return {
          error: itemsError(t, "palletTypeInvalid", {
            field: `${field}.palletType`,
            allowed: Object.keys(PALLET_TYPES).join(", "),
          }),
        };
      }
      if (
        typeof contents !== "string" ||
        !Object.hasOwn(PALLET_CONTENTS, contents)
      ) {
        return {
          error: itemsError(t, "palletContentsInvalid", {
            field: `${field}.contents`,
            allowed: Object.keys(PALLET_CONTENTS).join(", "),
          }),
        };
      }
      const quantity = parseQuantity(
        value.quantity,
        `${field}.quantity`,
        MAX_PALLET_COUNT,
        t,
      );
      if ("error" in quantity) {
        return quantity;
      }
      const heightM = parseMeasurement(
        value.heightM,
        `${field}.heightM`,
        CARGO_MEASUREMENT_BOUNDS.cargoHeightM,
        t,
      );
      if ("error" in heightM) {
        return heightM;
      }
      const weightKg = parseMeasurement(
        value.weightKg,
        `${field}.weightKg`,
        CARGO_MEASUREMENT_BOUNDS.cargoWeightKg,
        t,
      );
      if ("error" in weightKg) {
        return weightKg;
      }
      return {
        value: {
          kind: "PALLET",
          palletType: palletType as PalletType,
          contents: contents as PalletContents,
          quantity: quantity.value,
          heightM: heightM.value,
          weightKg: weightKg.value,
        },
      };
    }

    default:
      return {
        error: itemsError(t, "unknownKind", { field: `${field}.kind` }),
      };
  }
}

/**
 * Validate `items`: a list of 1–`MAX_ITEM_LINES` lines, each one of the three
 * kinds. Returns the first problem found, one sentence per field, in the
 * route's `{ error }` style. Nothing is resolved against the catalogue here —
 * an unknown `code` is the route's 400 after its one `findMany`.
 */
export function parseOrderItems(
  value: unknown,
  t: Translator,
): ParseResult<OrderItemRequest[]> {
  if (!Array.isArray(value)) {
    return { error: itemsError(t, "itemsMustBeList") };
  }
  if (value.length === 0) {
    return { error: itemsError(t, "itemsEmpty") };
  }
  if (value.length > MAX_ITEM_LINES) {
    return { error: itemsError(t, "itemsTooMany") };
  }

  const items: OrderItemRequest[] = [];
  for (const [index, line] of value.entries()) {
    const parsed = parseLine(line, `items[${index}]`, t);
    if ("error" in parsed) {
      return parsed;
    }
    items.push(parsed.value);
  }

  // Pallets and items are two modes of the picker (an Items | Pallets switch),
  // and the two free-text columns are filled differently in each (see
  // `describeLoad`). A list mixing both has no single right answer for either
  // column, and the form never sends one.
  const palletCount = items.filter((item) => item.kind === "PALLET").length;
  if (palletCount > 0 && palletCount < items.length) {
    return { error: itemsError(t, "mixedModes") };
  }

  return { value: items };
}

/* -------------------------------------------------------------------------- */
/* Resolving lines                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The catalogue columns the route reads. Structural, so the route's Prisma
 * `select` and a test literal both satisfy it.
 */
export type CatalogueEntryForOrder = {
  id: string;
  code: string;
  labelEn: string;
  labelKa: string;
  weightKg: number;
  lengthM: number;
  widthM: number;
  heightM: number;
  stackable: boolean;
  needsTwoPeople: boolean;
  requiredBody: ChassisTypeKey | null;
  handlingTags: readonly HandlingTagKey[];
  cargoCategory: CargoCategoryKey;
};

/** One resolved line: what the plan reads, and what `OrderItem` snapshots. */
export type ResolvedOrderItem = {
  load: LoadLine;
  snapshot: {
    kind: OrderItemRequest["kind"];
    catalogEntryId: string | null;
    label: string;
    quantity: number;
    unitWeightKg: number;
    lengthM: number;
    widthM: number;
    heightM: number;
    stackable: boolean;
    palletType: PalletType | null;
  };
};

/**
 * Turn validated lines into load lines plus their `OrderItem` snapshots.
 *
 * Catalogue lines take their figures from the catalogue row as stored (inside
 * `CARGO_MEASUREMENT_BOUNDS`, length ≥ width — the catalogue's own rule);
 * custom and pallet lines go through `customLine` and `palletLine`, which own
 * clamping and normalisation. The snapshot is taken from the resulting
 * `LoadLine`, never from the request, so the stored figures are exactly the
 * ones the plan was computed from.
 *
 * `catalogue` holds only *active* entries; a code missing from it is an item
 * the client can no longer book, and the whole request is refused rather than
 * silently booked without it.
 */
export function resolveOrderItems(
  items: readonly OrderItemRequest[],
  catalogue: readonly CatalogueEntryForOrder[],
  locale: "ka" | "en",
  t: Translator,
): ParseResult<ResolvedOrderItem[]> {
  const byCode = new Map(catalogue.map((entry) => [entry.code, entry]));
  const resolved: ResolvedOrderItem[] = [];

  for (const item of items) {
    let load: LoadLine;
    let label: string;
    let catalogEntryId: string | null = null;
    let palletType: PalletType | null = null;

    switch (item.kind) {
      case "CATALOGUE": {
        const entry = byCode.get(item.code);
        if (!entry) {
          return { error: itemsError(t, "catalogueUnavailable") };
        }
        load = {
          quantity: item.quantity,
          unitWeightKg: entry.weightKg,
          lengthM: entry.lengthM,
          widthM: entry.widthM,
          heightM: entry.heightM,
          stackable: entry.stackable,
          needsTwoPeople: entry.needsTwoPeople,
          requiredBody: entry.requiredBody,
          handlingTags: entry.handlingTags,
          cargoCategory: entry.cargoCategory,
        };
        label = locale === "ka" ? entry.labelKa : entry.labelEn;
        catalogEntryId = entry.id;
        break;
      }
      case "CUSTOM":
        load = customLine({
          quantity: item.quantity,
          exact: {
            lengthM: item.lengthM,
            widthM: item.widthM,
            heightM: item.heightM,
            weightKg: item.weightKg,
          },
        });
        label = item.label;
        break;
      case "PALLET":
        load = palletLine(
          item.palletType,
          item.contents,
          item.quantity,
          item.heightM,
          item.weightKg,
        );
        label = PALLET_LABELS[item.palletType];
        palletType = item.palletType;
        break;
    }

    resolved.push({
      load,
      snapshot: {
        kind: item.kind,
        catalogEntryId,
        label,
        quantity: load.quantity,
        unitWeightKg: load.unitWeightKg,
        lengthM: load.lengthM,
        widthM: load.widthM,
        heightM: load.heightM,
        stackable: load.stackable,
        palletType,
      },
    });
  }

  return { value: resolved };
}

/* -------------------------------------------------------------------------- */
/* Booking rules on the plan                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Decide the order's body and whether this client may book this plan.
 *
 * - Pallet lines are a business-only mode; an individual sending them is a
 *   stale or hand-edited client and is refused. A missing profile
 *   (`accountType === null`) is treated as an individual, the same reading the
 *   picker takes while the account type is still loading.
 * - Two lines forcing different bodies is a conflict nothing can resolve.
 * - **Business:** the client chooses the load space and must have chosen one.
 *   When any line forces a body, the choice must be that body; otherwise the
 *   choice stands (a business may want boxes on an open chassis).
 * - **Individual:** whatever body arrived is ignored; the plan's body is used.
 * - A plan heavier than any class on the platform is refused outright.
 *
 * Fit against the booked class is *not* decided here: the route's existing
 * hard check (`oversizeAxes`) runs on the plan's envelope afterwards, and no
 * soft-fit rule refuses anything on the server.
 */
export function decideItemsBooking(input: {
  resolved: readonly ResolvedOrderItem[];
  plan: LoadPlan;
  accountType: "INDIVIDUAL" | "BUSINESS" | null;
  requestedBody: ChassisTypeKey | null;
  t: Translator;
}): ParseResult<ChassisTypeKey> {
  const { resolved, plan, accountType, requestedBody, t } = input;
  const isBusiness = accountType === "BUSINESS";

  if (
    !isBusiness &&
    resolved.some(({ snapshot }) => snapshot.kind === "PALLET")
  ) {
    return { error: itemsError(t, "palletsBusinessOnly") };
  }

  if (plan.body.kind === "conflict") {
    return { error: itemsError(t, "bodyConflict") };
  }
  const derivedBody = plan.body.body;

  let body: ChassisTypeKey;
  if (isBusiness) {
    if (requestedBody === null) {
      return { error: itemsError(t, "bodyRequired") };
    }
    // Asked of the lines rather than read off the plan: `plan.body` falls back
    // to a dry box when nothing is forced, and that fallback must not override
    // a business that chose an open chassis for ordinary goods.
    const anyForced = resolved.some(({ load }) => load.requiredBody !== null);
    if (anyForced && requestedBody !== derivedBody) {
      return {
        error: itemsError(t, "bodyMismatch", {
          body: t(BODY_PHRASE_KEYS[derivedBody]),
        }),
      };
    }
    body = requestedBody;
  } else {
    body = derivedBody;
  }

  if (plan.overMaximum) {
    return { error: itemsError(t, "overMaximum") };
  }

  return { value: body };
}

/**
 * The two free-text columns in items mode and pallets mode.
 *
 * They keep their schema meaning — `packagingDescription` is the form the load
 * takes, `itemQuantity` is what is inside it — and the server fills only the
 * one the client was not asked to type:
 *
 * - **Items mode:** `itemQuantity` is the item summary ("1 × Fridge, double
 *   door, 15 × Box, medium"). The form hides its own "item quantity" input in
 *   this mode, so nothing typed is lost; `packagingDescription` stays as typed.
 * - **Pallets mode:** `packagingDescription` is the pallet summary ("4 × EUR
 *   pallet"); `itemQuantity` stays as typed ("96 cartons"), which is what a
 *   business actually knows about its pallets.
 */
export function describeLoad(
  resolved: readonly ResolvedOrderItem[],
  typed: { packagingDescription: string | null; itemQuantity: string | null },
  maxLength: number,
): { packagingDescription: string | null; itemQuantity: string | null } {
  const summary = summariseItems(
    resolved.map(({ snapshot }) => snapshot),
    maxLength,
  );
  const palletsMode = resolved.every(
    ({ snapshot }) => snapshot.kind === "PALLET",
  );

  return palletsMode
    ? { packagingDescription: summary, itemQuantity: typed.itemQuantity }
    : {
        packagingDescription: typed.packagingDescription,
        itemQuantity: summary,
      };
}
