/**
 * Validation and reordering rules for the admin item-catalogue editor
 * (`/admin/content/item-catalogue`).
 *
 * **Pure on purpose.** No `server-only`, no Prisma runtime, no translator: the
 * Prisma enums are imported as *types* only (erased at compile time) and their
 * members restated as string literals, pinned exhaustive by `Record` keys, the
 * same trick `src/lib/cargo.ts` uses. That is what lets three different callers
 * share one copy of every rule:
 *
 * - the two API routes beside this file, which are the real boundary;
 * - the edit dialog (`src/components/admin/content/item-catalogue-form-dialog.tsx`),
 *   which runs the same parser before posting purely for faster feedback;
 * - `tests/item-catalogue-admin-validation.spec.ts`, which needs no browser,
 *   database or server.
 *
 * Errors come back as a message *path* plus values rather than as text, so the
 * route translates them into the request's language and the dialog into the
 * reader's, from the same `admin.itemCatalogueValidation.*` keys.
 *
 * It lives beside the routes rather than in `src/lib` because nothing outside
 * this editor should ever need it: the booking side reads the catalogue, it
 * never writes it.
 */

import type {
  CargoCategory,
  CargoHandlingTag,
  ChassisType,
  ItemGroup,
} from "@prisma/client";

import { CARGO_MEASUREMENT_BOUNDS } from "@/lib/cargo";

/* -------------------------------------------------------------------------- */
/* Enum members                                                               */
/* -------------------------------------------------------------------------- */

/**
 * `ItemGroup` members, in the order the editor lists the groups (the same
 * order as the schema, which is the order the booking form's browse view
 * uses). The `Record` makes a new enum member a typecheck failure here until it
 * is placed.
 */
const ITEM_GROUP_ORDER: Record<ItemGroup, number> = {
  LIVING_ROOM: 0,
  BEDROOM: 1,
  KITCHEN_APPLIANCES: 2,
  OFFICE: 3,
  BOXES_PARCELS: 4,
  OUTDOOR_SPORTS: 5,
  CHILLED_FOOD: 6,
  BUILDING_MATERIALS: 7,
  EVENT_EQUIPMENT: 8,
};

export const ITEM_GROUPS = (Object.keys(ITEM_GROUP_ORDER) as ItemGroup[]).sort(
  (a, b) => ITEM_GROUP_ORDER[a] - ITEM_GROUP_ORDER[b],
);

const CARGO_CATEGORY_SET: Record<CargoCategory, true> = {
  FURNITURE_FURNISHINGS: true,
  APPLIANCES: true,
  RETAIL_STOCK: true,
  EVENT_EQUIPMENT: true,
  FULL_RELOCATION: true,
  INDUSTRIAL_SUPPLIES: true,
  CONSTRUCTION_MATERIALS: true,
};

export const CARGO_CATEGORIES = Object.keys(
  CARGO_CATEGORY_SET,
) as CargoCategory[];

const HANDLING_TAG_SET: Record<CargoHandlingTag, true> = {
  FRAGILE: true,
  COLD_CHAIN: true,
  HAZMAT: true,
  TIME_CRITICAL: true,
  UPRIGHT_ONLY: true,
  HEAVY_ITEM: true,
};

export const HANDLING_TAGS = Object.keys(
  HANDLING_TAG_SET,
) as CargoHandlingTag[];

const CHASSIS_TYPE_SET: Record<ChassisType, true> = {
  DRY_BOX: true,
  REFRIGERATED: true,
  OPEN_CHASSIS: true,
};

export const CHASSIS_TYPES = Object.keys(CHASSIS_TYPE_SET) as ChassisType[];

/* -------------------------------------------------------------------------- */
/* Limits                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * `UPPER_SNAKE`, starting with a letter. The code is what goods shortcuts and
 * reporting key on and is never reused, so it is held to one spelling rather
 * than normalised from whatever was typed.
 */
const CODE_PATTERN = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/;
export const MAX_CODE_LENGTH = 64;

/** Long enough for "Double bed frame (dismantled)" in either language. */
export const MAX_LABEL_LENGTH = 120;

/** Per locale. Synonyms are search terms, not prose, so a short list suffices. */
export const MAX_SYNONYMS = 30;
export const MAX_SYNONYM_LENGTH = 60;

/**
 * Bounds on `sortOrder`. The editor writes it in steps of 10, so even the
 * largest group sits far below the ceiling; the bound only keeps a typo out.
 */
export const MIN_SORT_ORDER = 0;
export const MAX_SORT_ORDER = 99_999;

/** The step reordering renumbers a group in: 10, 20, 30, … */
export const SORT_ORDER_STEP = 10;

/**
 * The figures a catalogue entry must stay inside: one unit of the item, held
 * to the same bounds an order's own cargo figures are
 * (`CARGO_MEASUREMENT_BOUNDS`), so a catalogue item can never on its own
 * produce a load the booking routes would refuse. All 61 seeded rows comply.
 */
export const ITEM_FIGURE_BOUNDS = {
  weightKg: CARGO_MEASUREMENT_BOUNDS.cargoWeightKg,
  lengthM: CARGO_MEASUREMENT_BOUNDS.cargoLengthM,
  widthM: CARGO_MEASUREMENT_BOUNDS.cargoWidthM,
  heightM: CARGO_MEASUREMENT_BOUNDS.cargoHeightM,
} as const;

type FigureField = keyof typeof ITEM_FIGURE_BOUNDS;

const FIGURE_FIELDS = Object.keys(ITEM_FIGURE_BOUNDS) as FigureField[];

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

/** A message path under the root catalogue, plus its interpolation values. */
export type ValidationError = {
  key: string;
  values?: Record<string, string | number>;
};

/** Every editable field of an `ItemCatalogEntry` except `code`. */
export type ItemCatalogueFields = {
  group: ItemGroup;
  labelEn: string;
  labelKa: string;
  synonymsEn: string[];
  synonymsKa: string[];
  weightKg: number;
  lengthM: number;
  widthM: number;
  heightM: number;
  stackable: boolean;
  needsTwoPeople: boolean;
  requiredBody: ChassisType | null;
  handlingTags: CargoHandlingTag[];
  cargoCategory: CargoCategory;
  sortOrder: number;
  active: boolean;
};

/**
 * A validated create. `sortOrder` is null when the admin left it blank, which
 * the route reads as "after the last entry in the group".
 */
export type ItemCatalogueCreateInput = Omit<
  ItemCatalogueFields,
  "sortOrder"
> & {
  code: string;
  sortOrder: number | null;
};

/** A validated edit: only the keys the request carried. */
export type ItemCatalogueUpdateInput = Partial<ItemCatalogueFields>;

export type ParseResult<T> = { data: T } | { error: ValidationError };

/** Message path prefix every error below lives under. */
const K = "admin.itemCatalogueValidation";

/* -------------------------------------------------------------------------- */
/* Field parsers                                                              */
/* -------------------------------------------------------------------------- */

type FieldResult<T> = { value: T } | { error: ValidationError };

/** Whether a string is a legal, already-normalised catalogue code. */
export function isValidItemCode(value: string): boolean {
  return value.length <= MAX_CODE_LENGTH && CODE_PATTERN.test(value);
}

function parseCode(raw: unknown): FieldResult<string> {
  if (typeof raw !== "string" || raw.trim() === "") {
    return { error: { key: `${K}.codeRequired` } };
  }

  const code = raw.trim();

  if (!isValidItemCode(code)) {
    return {
      error: { key: `${K}.codeFormat`, values: { max: MAX_CODE_LENGTH } },
    };
  }

  return { value: code };
}

function parseEnum<T extends string>(
  raw: unknown,
  members: readonly T[],
  field: string,
): FieldResult<T> {
  if (typeof raw !== "string" || !members.includes(raw as T)) {
    return {
      error: {
        key: `${K}.fieldMustBeOneOf`,
        values: { field, options: members.join(", ") },
      },
    };
  }

  return { value: raw as T };
}

function parseLabel(raw: unknown, field: string): FieldResult<string> {
  if (typeof raw !== "string" || raw.trim() === "") {
    return { error: { key: `${K}.labelRequired`, values: { field } } };
  }

  const label = raw.trim();

  if (label.length > MAX_LABEL_LENGTH) {
    return {
      error: {
        key: `${K}.fieldMaxLength`,
        values: { field, max: MAX_LABEL_LENGTH },
      },
    };
  }

  return { value: label };
}

/**
 * The comma-separated box in the form → the list the column holds: trimmed,
 * blanks dropped (a trailing comma is not a synonym), and repeats removed
 * case-insensitively, keeping the first spelling typed.
 */
export function parseSynonymInput(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const part of text.split(",")) {
    const term = part.trim();
    const folded = term.toLocaleLowerCase();

    if (term === "" || seen.has(folded)) {
      continue;
    }

    seen.add(folded);
    out.push(term);
  }

  return out;
}

/** The column's list → the text the form's box shows. */
export function formatSynonymInput(synonyms: readonly string[]): string {
  return synonyms.join(", ");
}

function parseSynonyms(raw: unknown, field: string): FieldResult<string[]> {
  if (
    !Array.isArray(raw) ||
    !raw.every((term): term is string => typeof term === "string")
  ) {
    return { error: { key: `${K}.synonymsMustBeList`, values: { field } } };
  }

  // Normalised through the same function the form uses, so a list posted by
  // something other than the form still lands clean. A comma inside a term
  // would split it, which is right: the form could never have produced one.
  const synonyms = parseSynonymInput(raw.join(","));

  if (synonyms.length > MAX_SYNONYMS) {
    return {
      error: {
        key: `${K}.tooManySynonyms`,
        values: { field, max: MAX_SYNONYMS },
      },
    };
  }

  if (synonyms.some((term) => term.length > MAX_SYNONYM_LENGTH)) {
    return {
      error: {
        key: `${K}.synonymTooLong`,
        values: { field, max: MAX_SYNONYM_LENGTH },
      },
    };
  }

  return { value: synonyms };
}

/**
 * One figure, inside its `CARGO_MEASUREMENT_BOUNDS` range. The bounds and unit
 * travel in the error so the message can say exactly what is allowed.
 */
function parseFigure(raw: unknown, field: FigureField): FieldResult<number> {
  const { min, max, unit } = ITEM_FIGURE_BOUNDS[field];

  if (
    typeof raw !== "number" ||
    !Number.isFinite(raw) ||
    raw < min ||
    raw > max
  ) {
    return {
      error: {
        key: `${K}.figureOutOfBounds`,
        values: { field, min, max, unit },
      },
    };
  }

  return { value: raw };
}

function parseBoolean(raw: unknown, field: string): FieldResult<boolean> {
  if (typeof raw !== "boolean") {
    return { error: { key: `${K}.fieldMustBeBoolean`, values: { field } } };
  }

  return { value: raw };
}

function parseRequiredBody(raw: unknown): FieldResult<ChassisType | null> {
  if (raw === null) {
    return { value: null };
  }

  return parseEnum(raw, CHASSIS_TYPES, "requiredBody");
}

/** A tag list, deduplicated, kept in the enum's own order for stable diffs. */
function parseHandlingTags(raw: unknown): FieldResult<CargoHandlingTag[]> {
  if (
    !Array.isArray(raw) ||
    !raw.every(
      (tag) =>
        typeof tag === "string" &&
        HANDLING_TAGS.includes(tag as CargoHandlingTag),
    )
  ) {
    return {
      error: {
        key: `${K}.handlingTagsMustBeList`,
        values: { options: HANDLING_TAGS.join(", ") },
      },
    };
  }

  const chosen = new Set(raw as CargoHandlingTag[]);

  return { value: HANDLING_TAGS.filter((tag) => chosen.has(tag)) };
}

function parseSortOrder(raw: unknown): FieldResult<number> {
  if (
    typeof raw !== "number" ||
    !Number.isInteger(raw) ||
    raw < MIN_SORT_ORDER ||
    raw > MAX_SORT_ORDER
  ) {
    return {
      error: {
        key: `${K}.sortOrderRange`,
        values: { min: MIN_SORT_ORDER, max: MAX_SORT_ORDER },
      },
    };
  }

  return { value: raw };
}

/**
 * Length must be at least width — the stored convention every figure in the
 * catalogue follows, and the one the fit check relies on (it never rotates an
 * item, but it does compare the longer side with the longer side). The form
 * offers to swap the two rather than make the admin retype them.
 */
export function lengthBelowWidth(lengthM: number, widthM: number): boolean {
  return lengthM < widthM;
}

const LENGTH_BELOW_WIDTH_ERROR: ValidationError = {
  key: `${K}.lengthBelowWidth`,
};

/* -------------------------------------------------------------------------- */
/* Body parsers                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Parsers for every editable field except `code`, keyed by the body field. One
 * table shared by create (every key required) and edit (each key optional), so
 * the two can never apply different rules to the same field.
 */
const FIELD_PARSERS: {
  [F in keyof ItemCatalogueFields]: (
    raw: unknown,
  ) => FieldResult<ItemCatalogueFields[F]>;
} = {
  group: (raw) => parseEnum(raw, ITEM_GROUPS, "group"),
  labelEn: (raw) => parseLabel(raw, "labelEn"),
  labelKa: (raw) => parseLabel(raw, "labelKa"),
  synonymsEn: (raw) => parseSynonyms(raw, "synonymsEn"),
  synonymsKa: (raw) => parseSynonyms(raw, "synonymsKa"),
  weightKg: (raw) => parseFigure(raw, "weightKg"),
  lengthM: (raw) => parseFigure(raw, "lengthM"),
  widthM: (raw) => parseFigure(raw, "widthM"),
  heightM: (raw) => parseFigure(raw, "heightM"),
  stackable: (raw) => parseBoolean(raw, "stackable"),
  needsTwoPeople: (raw) => parseBoolean(raw, "needsTwoPeople"),
  requiredBody: parseRequiredBody,
  handlingTags: parseHandlingTags,
  cargoCategory: (raw) => parseEnum(raw, CARGO_CATEGORIES, "cargoCategory"),
  sortOrder: parseSortOrder,
  active: (raw) => parseBoolean(raw, "active"),
};

const FIELD_NAMES = Object.keys(FIELD_PARSERS) as (keyof ItemCatalogueFields)[];

function asRecord(body: unknown): Record<string, unknown> | null {
  return typeof body === "object" && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

/**
 * `POST /api/admin/content/item-catalogue`. Every field is required, as the
 * form always sends the complete set, except `sortOrder`, where null or absent
 * means "put it at the end of its group".
 */
export function parseCreateItemBody(
  body: unknown,
): ParseResult<ItemCatalogueCreateInput> {
  const record = asRecord(body);
  if (record === null) {
    return { error: { key: `${K}.bodyMustBeObject` } };
  }

  const code = parseCode(record.code);
  if ("error" in code) {
    return code;
  }

  const data: Record<string, unknown> = { code: code.value, sortOrder: null };

  for (const field of FIELD_NAMES) {
    const raw = record[field];

    if (field === "sortOrder" && (raw === null || raw === undefined)) {
      continue;
    }

    const parsed = FIELD_PARSERS[field](raw);
    if ("error" in parsed) {
      return parsed;
    }

    data[field] = parsed.value;
  }

  const input = data as ItemCatalogueCreateInput;

  if (lengthBelowWidth(input.lengthM, input.widthM)) {
    return { error: LENGTH_BELOW_WIDTH_ERROR };
  }

  return { data: input };
}

/**
 * `PATCH /api/admin/content/item-catalogue/[code]`. Partial: an absent key
 * means "leave it", which is how the table's active toggle sends `{ active }`
 * alone. `existing` is the row being edited, so the length ≥ width rule is
 * checked against the figures the row will *end up* with, not only the ones
 * this request carries.
 *
 * `code` is refused unless it matches: it is editable on create only, because
 * goods shortcuts and reporting key on it.
 */
export function parseUpdateItemBody(
  body: unknown,
  existing: { code: string; lengthM: number; widthM: number },
): ParseResult<ItemCatalogueUpdateInput> {
  const record = asRecord(body);
  if (record === null) {
    return { error: { key: `${K}.bodyMustBeObject` } };
  }

  if (record.code !== undefined && record.code !== existing.code) {
    return { error: { key: `${K}.codeCannotChange` } };
  }

  const data: Record<string, unknown> = {};

  for (const field of FIELD_NAMES) {
    if (!(field in record) || record[field] === undefined) {
      continue;
    }

    const parsed = FIELD_PARSERS[field](record[field]);
    if ("error" in parsed) {
      return parsed;
    }

    data[field] = parsed.value;
  }

  if (Object.keys(data).length === 0) {
    return { error: { key: `${K}.nothingToUpdate` } };
  }

  const input = data as ItemCatalogueUpdateInput;
  const nextLength = input.lengthM ?? existing.lengthM;
  const nextWidth = input.widthM ?? existing.widthM;

  if (lengthBelowWidth(nextLength, nextWidth)) {
    return { error: LENGTH_BELOW_WIDTH_ERROR };
  }

  return { data: input };
}

/** Whether `field` is one of the four figures, for the form's per-box errors. */
export function isFigureField(field: string): field is FigureField {
  return (FIGURE_FIELDS as string[]).includes(field);
}

/* -------------------------------------------------------------------------- */
/* Reordering                                                                 */
/* -------------------------------------------------------------------------- */

export type MoveDirection = "up" | "down";

/**
 * Which entries the admin can see while reordering. With inactive entries
 * hidden, "up" must step past them to the next *visible* neighbour, or the
 * button would appear to do nothing.
 */
export type MoveScope = "all" | "active";

/** The slice of a row reordering needs. */
export type OrderableEntry = {
  code: string;
  sortOrder: number;
  active: boolean;
};

/** Parses the move route's body. */
export function parseMoveBody(
  body: unknown,
): ParseResult<{ direction: MoveDirection; scope: MoveScope }> {
  const record = asRecord(body);
  if (record === null) {
    return { error: { key: `${K}.bodyMustBeObject` } };
  }

  const direction = parseEnum(
    record.direction,
    ["up", "down"] as const,
    "direction",
  );
  if ("error" in direction) {
    return direction;
  }

  const scope =
    record.scope === undefined
      ? { value: "all" as const }
      : parseEnum(record.scope, ["all", "active"] as const, "scope");
  if ("error" in scope) {
    return scope;
  }

  return { data: { direction: direction.value, scope: scope.value } };
}

/** The order a group is displayed and renumbered in: `sortOrder`, then code. */
export function compareCatalogueOrder(
  a: { sortOrder: number; code: string },
  b: { sortOrder: number; code: string },
): number {
  return a.sortOrder - b.sortOrder || a.code.localeCompare(b.code);
}

/**
 * Moves one entry a step up or down within its group and renumbers the whole
 * group 10, 20, 30, …
 *
 * `group` is every entry in the group, active or not and in any order. The
 * whole group is renumbered rather than two values swapped because seeded and
 * hand-typed `sortOrder`s can tie or bunch up, and a swap between two equal
 * numbers changes nothing. Returns only the entries whose `sortOrder` actually
 * changes, so the route writes (and audits) no more than it must.
 *
 * Returns null when there is nothing to do: the code is not in the group, or
 * it is already first/last among the entries `scope` makes visible.
 */
export function planCatalogueMove(
  group: readonly OrderableEntry[],
  code: string,
  direction: MoveDirection,
  scope: MoveScope,
): { code: string; from: number; to: number }[] | null {
  const ordered = [...group].sort(compareCatalogueOrder);
  const index = ordered.findIndex((entry) => entry.code === code);

  if (index === -1) {
    return null;
  }

  const visible = (entry: OrderableEntry) => scope === "all" || entry.active;
  const step = direction === "up" ? -1 : 1;

  let neighbour = index + step;
  for (
    let candidate = ordered[neighbour];
    candidate !== undefined && !visible(candidate);
    candidate = ordered[neighbour]
  ) {
    neighbour += step;
  }

  if (neighbour < 0 || neighbour >= ordered.length) {
    return null;
  }

  // Take the entry out and put it where the neighbour is: before it going up,
  // after it going down. Hidden entries between the two keep their place
  // relative to everything else. The insertion index is `neighbour` either
  // way: going up, the neighbour sits before the removed slot and does not
  // shift; going down it shifts back by one, and "after it" adds the one back.
  const [moving] = ordered.splice(index, 1);
  if (moving === undefined) {
    return null;
  }
  ordered.splice(neighbour, 0, moving);

  const changes: { code: string; from: number; to: number }[] = [];

  ordered.forEach((entry, position) => {
    const to = (position + 1) * SORT_ORDER_STEP;

    if (entry.sortOrder !== to) {
      changes.push({ code: entry.code, from: entry.sortOrder, to });
    }
  });

  return changes;
}

/** The `sortOrder` a new entry takes when left blank: after the group's last. */
export function nextSortOrder(groupSortOrders: readonly number[]): number {
  const last = groupSortOrders.reduce((max, value) => Math.max(max, value), 0);

  return Math.min(
    MAX_SORT_ORDER,
    (Math.floor(last / SORT_ORDER_STEP) + 1) * SORT_ORDER_STEP,
  );
}
