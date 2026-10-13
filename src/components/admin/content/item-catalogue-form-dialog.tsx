"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import type {
  CargoCategory,
  CargoHandlingTag,
  ChassisType,
  ItemGroup,
} from "@prisma/client";

// Type-only import, so nothing of the server route (Prisma, Better Auth) is
// pulled into this client bundle — it is erased at compile time. Sharing the
// row shape with the endpoint that produces it is what stops the form and the
// API drifting apart.
import type { AdminItemCatalogueRow } from "@/app/api/admin/content/item-catalogue/route";
// A runtime import, and a safe one: the validation module is pure (type-only
// Prisma imports, no `server-only`), written to be shared by the routes and
// this form so the two can never apply different rules.
import {
  CARGO_CATEGORIES,
  CHASSIS_TYPES,
  formatSynonymInput,
  HANDLING_TAGS,
  ITEM_FIGURE_BOUNDS,
  ITEM_GROUPS,
  lengthBelowWidth,
  MAX_SORT_ORDER,
  MIN_SORT_ORDER,
  parseCreateItemBody,
  parseSynonymInput,
  parseUpdateItemBody,
} from "@/app/api/admin/content/item-catalogue/validation";
import {
  CHASSIS_TYPE_LABEL_KEYS,
  ITEM_GROUP_LABEL_KEYS,
} from "@/components/admin/content/item-catalogue-labels";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCargoCategoryLabel, useCargoHandlingTagLabel } from "@/lib/cargo";

/**
 * Radix `Select` refuses an empty-string value, so "no required body" needs a
 * stand-in. Never sent: it is mapped back to `null` on submit.
 */
const ANY_BODY = "ANY";

export type ItemCatalogueFormDialogProps = {
  /** The entry being edited, or null to create a new one. */
  item: AdminItemCatalogueRow | null;
  /** Dismissed without saving — the parent drops its target. */
  onClose: () => void;
  /** The entry was created or updated; the parent should reload its list. */
  onCompleted: () => void;
};

/**
 * Pulls the API's `{ error }` message out of a failed response so staff see
 * *why* a save was refused (a figure out of range, a code already taken, a
 * role that may not edit content) rather than a generic failure.
 */
async function readErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const body: unknown = await response.json().catch(() => null);

  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof body.error === "string"
  ) {
    return body.error;
  }

  return fallback;
}

/**
 * A figure box → a number. Kept as text while typing so a box can be cleared;
 * an empty or unparseable box becomes `NaN`, which the shared parser reports
 * as out of range with the field's bounds.
 */
function toNumber(text: string): number {
  return text.trim() === "" ? Number.NaN : Number(text);
}

/**
 * The create/edit form for an `ItemCatalogEntry`, shared by the "New item"
 * button and every row's Edit action so both write exactly the same fields —
 * every column except `id` and the timestamps. `code` is editable on create
 * only: goods shortcuts and reporting key on it.
 *
 * Holds no `open` state, like `BannerFormDialog`: the parent mounts it only
 * while an entry (or an explicit "new") is selected, keyed by that target, so
 * the fields start from the right values without an effect to resync them.
 */
export function ItemCatalogueFormDialog({
  item,
  onClose,
  onCompleted,
}: ItemCatalogueFormDialogProps) {
  const t = useTranslations();
  const categoryLabel = useCargoCategoryLabel();
  const tagLabel = useCargoHandlingTagLabel();
  const isEditing = item !== null;

  const [code, setCode] = useState(item?.code ?? "");
  const [group, setGroup] = useState<ItemGroup>(item?.group ?? "LIVING_ROOM");
  const [labelEn, setLabelEn] = useState(item?.labelEn ?? "");
  const [labelKa, setLabelKa] = useState(item?.labelKa ?? "");
  const [synonymsEn, setSynonymsEn] = useState(
    formatSynonymInput(item?.synonymsEn ?? []),
  );
  const [synonymsKa, setSynonymsKa] = useState(
    formatSynonymInput(item?.synonymsKa ?? []),
  );
  // Figures kept as strings so a box can be cleared while typing.
  const [weightKg, setWeightKg] = useState(item ? String(item.weightKg) : "");
  const [lengthM, setLengthM] = useState(item ? String(item.lengthM) : "");
  const [widthM, setWidthM] = useState(item ? String(item.widthM) : "");
  const [heightM, setHeightM] = useState(item ? String(item.heightM) : "");
  const [stackable, setStackable] = useState(item?.stackable ?? true);
  const [needsTwoPeople, setNeedsTwoPeople] = useState(
    item?.needsTwoPeople ?? false,
  );
  const [requiredBody, setRequiredBody] = useState<ChassisType | null>(
    item?.requiredBody ?? null,
  );
  const [handlingTags, setHandlingTags] = useState<CargoHandlingTag[]>(
    item?.handlingTags ?? [],
  );
  const [cargoCategory, setCargoCategory] = useState<CargoCategory>(
    item?.cargoCategory ?? "FURNITURE_FURNISHINGS",
  );
  // Blank on create means "end of the group", which the route resolves.
  const [sortOrder, setSortOrder] = useState(
    item ? String(item.sortOrder) : "",
  );
  const [active, setActive] = useState(item?.active ?? true);

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Offered as soon as both boxes hold numbers, before submit, so the admin
  // can fix it with one click rather than learn the rule from a refusal.
  const parsedLength = toNumber(lengthM);
  const parsedWidth = toNumber(widthM);
  const offerSwap =
    Number.isFinite(parsedLength) &&
    Number.isFinite(parsedWidth) &&
    lengthBelowWidth(parsedLength, parsedWidth);

  function toggleTag(tag: CargoHandlingTag, checked: boolean) {
    setHandlingTags((current) =>
      checked ? [...current, tag] : current.filter((value) => value !== tag),
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedSortOrder = sortOrder.trim();
    const body = {
      group,
      labelEn,
      labelKa,
      synonymsEn: parseSynonymInput(synonymsEn),
      synonymsKa: parseSynonymInput(synonymsKa),
      weightKg: toNumber(weightKg),
      lengthM: parsedLength,
      widthM: parsedWidth,
      heightM: toNumber(heightM),
      stackable,
      needsTwoPeople,
      requiredBody,
      handlingTags,
      cargoCategory,
      sortOrder:
        trimmedSortOrder === "" && !isEditing
          ? null
          : toNumber(trimmedSortOrder),
      active,
    };

    // The same parser the route runs, restated here purely for the faster
    // feedback; the route is what actually enforces it.
    const checked = isEditing
      ? parseUpdateItemBody(body, item)
      : parseCreateItemBody({ ...body, code });

    if ("error" in checked) {
      setError(t(checked.error.key, checked.error.values));
      return;
    }

    setPending(true);
    setError(null);

    try {
      const response = await fetch(
        isEditing
          ? `/api/admin/content/item-catalogue/${encodeURIComponent(item.code)}`
          : "/api/admin/content/item-catalogue",
        {
          method: isEditing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          // The parsed values, so what is posted is exactly what was checked
          // (trimmed labels, cleaned synonym lists, tags in enum order).
          body: JSON.stringify(checked.data),
        },
      );

      if (!response.ok) {
        setError(
          await readErrorMessage(
            response,
            isEditing
              ? t("admin.itemCatalogueFormDialog.couldNotSave")
              : t("admin.itemCatalogueFormDialog.couldNotCreate"),
          ),
        );
        setPending(false);
        return;
      }

      // The parent reloads and unmounts this dialog, so `pending` stays true —
      // the button must not flash back to its idle label in between.
      onCompleted();
    } catch {
      setError(t("common.shared.somethingWentWrongPleaseTryAgain"));
      setPending(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        // Radix reports Escape, the overlay and the close button all through
        // here; none of them should interrupt a request already in flight.
        if (!open && !pending) {
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>
              {isEditing
                ? t("admin.itemCatalogueFormDialog.editItem")
                : t("admin.itemCatalogueFormDialog.newItem")}
            </DialogTitle>
            <DialogDescription>
              {t("admin.itemCatalogueFormDialog.description")}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="item-code">
                  {t("admin.itemCatalogueFormDialog.code")}
                </Label>
                <Input
                  id="item-code"
                  value={code}
                  // Upper-cased as typed: the code has exactly one legal
                  // spelling, and lower case is never it.
                  onChange={(event) =>
                    setCode(event.target.value.toUpperCase())
                  }
                  placeholder="SOFA_2_SEAT"
                  className="font-mono"
                  disabled={pending || isEditing}
                  required={!isEditing}
                  autoFocus={!isEditing}
                />
                <p className="text-xs text-muted-foreground">
                  {t("admin.itemCatalogueFormDialog.codeHint")}
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="item-group">
                  {t("admin.itemCatalogueFormDialog.group")}
                </Label>
                <Select
                  value={group}
                  onValueChange={(value) => setGroup(value as ItemGroup)}
                  disabled={pending}
                >
                  <SelectTrigger id="item-group" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ITEM_GROUPS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {t(ITEM_GROUP_LABEL_KEYS[value])}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="item-label-en">
                  {t("admin.itemCatalogueFormDialog.labelEn")}
                </Label>
                <Input
                  id="item-label-en"
                  value={labelEn}
                  onChange={(event) => setLabelEn(event.target.value)}
                  disabled={pending}
                  required
                  autoFocus={isEditing}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="item-label-ka">
                  {t("admin.itemCatalogueFormDialog.labelKa")}
                </Label>
                <Input
                  id="item-label-ka"
                  lang="ka"
                  value={labelKa}
                  onChange={(event) => setLabelKa(event.target.value)}
                  disabled={pending}
                  required
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="item-synonyms-en">
                  {t("admin.itemCatalogueFormDialog.synonymsEn")}
                </Label>
                <Input
                  id="item-synonyms-en"
                  value={synonymsEn}
                  onChange={(event) => setSynonymsEn(event.target.value)}
                  placeholder={t(
                    "admin.itemCatalogueFormDialog.synonymsEnPlaceholder",
                  )}
                  disabled={pending}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="item-synonyms-ka">
                  {t("admin.itemCatalogueFormDialog.synonymsKa")}
                </Label>
                <Input
                  id="item-synonyms-ka"
                  lang="ka"
                  value={synonymsKa}
                  onChange={(event) => setSynonymsKa(event.target.value)}
                  disabled={pending}
                />
              </div>
            </div>
            <p className="-mt-1 text-xs text-muted-foreground">
              {t("admin.itemCatalogueFormDialog.synonymsHint")}
            </p>

            <div className="grid gap-3 sm:grid-cols-4">
              {(
                [
                  ["weightKg", weightKg, setWeightKg],
                  ["lengthM", lengthM, setLengthM],
                  ["widthM", widthM, setWidthM],
                  ["heightM", heightM, setHeightM],
                ] as const
              ).map(([field, value, setValue]) => {
                const { min, max } = ITEM_FIGURE_BOUNDS[field];

                return (
                  <div key={field} className="flex flex-col gap-1.5">
                    <Label htmlFor={`item-${field}`}>
                      {t(`admin.itemCatalogueFormDialog.${field}`)}
                    </Label>
                    <Input
                      id={`item-${field}`}
                      type="number"
                      inputMode="decimal"
                      min={min}
                      max={max}
                      step="any"
                      value={value}
                      onChange={(event) => setValue(event.target.value)}
                      disabled={pending}
                      required
                    />
                  </div>
                );
              })}
            </div>
            <p className="-mt-1 text-xs text-muted-foreground">
              {t("admin.itemCatalogueFormDialog.sizeHelper")}
            </p>

            {offerSwap ? (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
                <span>
                  {t("admin.itemCatalogueFormDialog.lengthBelowWidth")}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => {
                    setLengthM(widthM);
                    setWidthM(lengthM);
                  }}
                >
                  {t("admin.itemCatalogueFormDialog.swapLengthAndWidth")}
                </Button>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="item-cargo-category">
                  {t("admin.itemCatalogueFormDialog.cargoCategory")}
                </Label>
                <Select
                  value={cargoCategory}
                  onValueChange={(value) =>
                    setCargoCategory(value as CargoCategory)
                  }
                  disabled={pending}
                >
                  <SelectTrigger id="item-cargo-category" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CARGO_CATEGORIES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {categoryLabel(value)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="item-required-body">
                  {t("admin.itemCatalogueFormDialog.requiredBody")}
                </Label>
                <Select
                  value={requiredBody ?? ANY_BODY}
                  onValueChange={(value) =>
                    setRequiredBody(
                      value === ANY_BODY ? null : (value as ChassisType),
                    )
                  }
                  disabled={pending}
                >
                  <SelectTrigger id="item-required-body" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ANY_BODY}>
                      {t("admin.itemCatalogueFormDialog.anyBody")}
                    </SelectItem>
                    {CHASSIS_TYPES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {t(CHASSIS_TYPE_LABEL_KEYS[value])}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t("admin.itemCatalogueFormDialog.requiredBodyHint")}
                </p>
              </div>
            </div>

            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1.5 text-sm font-medium">
                {t("admin.itemCatalogueFormDialog.handlingTags")}
              </legend>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {HANDLING_TAGS.map((tag) => (
                  <div key={tag} className="flex items-center gap-2">
                    <Checkbox
                      id={`item-tag-${tag}`}
                      checked={handlingTags.includes(tag)}
                      onCheckedChange={(checked) =>
                        toggleTag(tag, checked === true)
                      }
                      disabled={pending}
                    />
                    <Label htmlFor={`item-tag-${tag}`}>{tagLabel(tag)}</Label>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {t("admin.itemCatalogueFormDialog.handlingTagsHint")}
              </p>
            </fieldset>

            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="item-stackable"
                  checked={stackable}
                  onCheckedChange={(checked) => setStackable(checked === true)}
                  disabled={pending}
                />
                <Label htmlFor="item-stackable">
                  {t("admin.itemCatalogueFormDialog.stackable")}
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="item-two-people"
                  checked={needsTwoPeople}
                  onCheckedChange={(checked) =>
                    setNeedsTwoPeople(checked === true)
                  }
                  disabled={pending}
                />
                <Label htmlFor="item-two-people">
                  {t("admin.itemCatalogueFormDialog.needsTwoPeople")}
                </Label>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="item-sort-order">
                  {t("common.shared.sortOrder")}
                </Label>
                <Input
                  id="item-sort-order"
                  type="number"
                  inputMode="numeric"
                  min={MIN_SORT_ORDER}
                  max={MAX_SORT_ORDER}
                  step={1}
                  value={sortOrder}
                  onChange={(event) => setSortOrder(event.target.value)}
                  disabled={pending}
                  required={isEditing}
                />
                {!isEditing ? (
                  <p className="text-xs text-muted-foreground">
                    {t("admin.itemCatalogueFormDialog.sortOrderHint")}
                  </p>
                ) : null}
              </div>

              <div className="flex items-center gap-2 sm:self-start sm:pt-7">
                <Checkbox
                  id="item-active"
                  checked={active}
                  onCheckedChange={(checked) => setActive(checked === true)}
                  disabled={pending}
                />
                <Label htmlFor="item-active">{t("common.shared.active")}</Label>
              </div>
            </div>

            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={pending}
            >
              {t("common.shared.cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending
                ? t("common.shared.saving")
                : isEditing
                  ? t("admin.itemCatalogueFormDialog.saveItem")
                  : t("admin.itemCatalogueFormDialog.createItem")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
