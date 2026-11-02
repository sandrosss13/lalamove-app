"use client";

import { Fragment, useEffect, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useTranslations } from "next-intl";

// Type-only import, so nothing of the server route (Prisma, Better Auth) is
// pulled into this client bundle — it is erased at compile time. Sharing the
// row shape with the endpoint that produces it is what stops the table and the
// API drifting apart.
import type {
  AdminItemCatalogueListResponse,
  AdminItemCatalogueRow,
} from "@/app/api/admin/content/item-catalogue/route";
import {
  compareCatalogueOrder,
  ITEM_GROUPS,
  type MoveDirection,
} from "@/app/api/admin/content/item-catalogue/validation";
import { ItemCatalogueFormDialog } from "@/components/admin/content/item-catalogue-form-dialog";
import {
  CHASSIS_TYPE_LABEL_KEYS,
  ITEM_GROUP_LABEL_KEYS,
} from "@/components/admin/content/item-catalogue-labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCargoCategoryLabel, useCargoHandlingTagLabel } from "@/lib/cargo";

/** Columns in the table, so the full-width rows can span all of them. */
const COLUMN_COUNT = 7;

/**
 * Which entries the table shows. "Inactive" exists so a deactivated item can
 * be found and switched back on without scrolling past every live one.
 */
type StatusFilter = "all" | "active" | "inactive";

const STATUS_FILTERS: { value: StatusFilter; labelKey: string }[] = [
  { value: "all", labelKey: "filterAll" },
  { value: "active", labelKey: "filterActive" },
  { value: "inactive", labelKey: "filterInactive" },
];

/** Metres to at most two decimals, without trailing zeros: 0.85, 1.6, 2. */
function formatMetres(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/**
 * Pulls the API's `{ error }` message out of a failed response — a `403` for a
 * role that may not manage content says so, instead of showing the same
 * "could not load" as a network failure.
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
 * `/admin/content/item-catalogue` — the items clients pick from when they list
 * what they are sending (`ItemCatalogEntry`).
 *
 * Under Content rather than a section of its own: labels, synonyms and typical
 * figures are tuned by the same editors who run banners and vehicle photos,
 * and nothing here touches pricing directly. Built as the banners editor is —
 * a client component reading the list endpoint, reloading after every
 * mutation, with the section layout gating viewing and every endpoint
 * re-checking the `adminRole` on each request, which is the real boundary.
 *
 * Grouped by `ItemGroup` and ordered by `sortOrder`, as the booking form
 * browses them. Reordering is up/down buttons within a group, which renumber
 * the group in steps of 10 server-side; no drag-and-drop. There is no delete:
 * an entry is deactivated, which hides it from the booking form but keeps its
 * code reserved, and orders already placed keep their own snapshot either way.
 */
export default function AdminItemCataloguePage() {
  const t = useTranslations("admin.adminContentItemCatalogue");
  const tRoot = useTranslations();
  const tShared = useTranslations("common.shared");
  const categoryLabel = useCargoCategoryLabel();
  const tagLabel = useCargoHandlingTagLabel();

  const [items, setItems] = useState<AdminItemCatalogueRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  /**
   * The entry the form dialog is open for. `undefined` means closed; `null`
   * means open for a new entry, which is why this is not just `... | null`.
   */
  const [formTarget, setFormTarget] = useState<AdminItemCatalogueRow | null>();
  /** The entry whose toggle or move is currently in flight. */
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  /** Failures from a toggle or a move, which have no dialog of their own. */
  const [actionError, setActionError] = useState<string | null>(null);
  // Bumped after any mutation, purely to re-run the fetch below so the table
  // shows the state the database now holds rather than a patched copy.
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    setLoading(true);
    setError(null);

    async function load() {
      try {
        const response = await fetch("/api/admin/content/item-catalogue", {
          signal: controller.signal,
        });

        if (!response.ok) {
          setError(await readErrorMessage(response, t("couldNotLoad")));
          setLoading(false);
          return;
        }

        const body = (await response.json()) as AdminItemCatalogueListResponse;
        setItems(body.items);
        setLoading(false);
      } catch {
        // An abort is this effect being cleaned up (a newer load is already in
        // flight), not a failure worth showing.
        if (controller.signal.aborted) {
          return;
        }

        setError(t("couldNotLoad"));
        setLoading(false);
      }
    }

    void load();

    return () => controller.abort();
  }, [reloadToken, t]);

  /** Deactivates or reactivates one entry straight from the table. */
  async function handleToggleActive(item: AdminItemCatalogueRow) {
    setPendingCode(item.code);
    setActionError(null);

    try {
      const response = await fetch(
        `/api/admin/content/item-catalogue/${encodeURIComponent(item.code)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          // The one place a partial patch is sent: nothing else about the
          // entry is being confirmed here, so nothing else is overwritten.
          body: JSON.stringify({ active: !item.active }),
        },
      );

      if (!response.ok) {
        setActionError(
          await readErrorMessage(response, t("couldNotUpdateThisItem")),
        );
        return;
      }

      setReloadToken((token) => token + 1);
    } catch {
      setActionError(tShared("somethingWentWrongPleaseTryAgain"));
    } finally {
      setPendingCode(null);
    }
  }

  async function handleMove(
    item: AdminItemCatalogueRow,
    direction: MoveDirection,
  ) {
    setPendingCode(item.code);
    setActionError(null);

    try {
      const response = await fetch(
        `/api/admin/content/item-catalogue/${encodeURIComponent(item.code)}/move`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // With inactive entries hidden, step past them to the next visible
          // neighbour, so every click visibly moves the row.
          body: JSON.stringify({
            direction,
            scope: statusFilter === "active" ? "active" : "all",
          }),
        },
      );

      if (!response.ok) {
        setActionError(
          await readErrorMessage(response, t("couldNotMoveThisItem")),
        );
        return;
      }

      setReloadToken((token) => token + 1);
    } catch {
      setActionError(tShared("somethingWentWrongPleaseTryAgain"));
    } finally {
      setPendingCode(null);
    }
  }

  const visible = (items ?? [])
    .filter(
      (item) =>
        statusFilter === "all" ||
        (statusFilter === "active" ? item.active : !item.active),
    )
    .sort(compareCatalogueOrder);

  const groups = ITEM_GROUPS.map((group) => ({
    group,
    rows: visible.filter((item) => item.group === group),
  })).filter(({ rows }) => rows.length > 0);

  // Reordering only means something among items a client can see; in the
  // inactive-only view the buttons would shuffle hidden rows around.
  const canReorder = statusFilter !== "inactive";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex max-w-2xl flex-col gap-1.5">
          <p className="text-sm text-muted-foreground">{t("intro")}</p>
          {/* The public catalogue route sets a five-minute shared cache, so an
              edit saved here is not instantly what clients see. Said up front
              so a "my change didn't take" report is not the first sign. */}
          <p className="text-xs text-muted-foreground">{t("cacheNote")}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="item-catalogue-status" className="sr-only">
            {t("statusFilter")}
          </Label>
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as StatusFilter)}
          >
            <SelectTrigger id="item-catalogue-status" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => setFormTarget(null)}>
            {t("newItem")}
          </Button>
        </div>
      </div>

      {actionError ? (
        <p role="alert" className="text-sm text-destructive">
          {actionError}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("item")}</TableHead>
              <TableHead className="text-right">{t("weightKg")}</TableHead>
              <TableHead>{t("dimensions")}</TableHead>
              <TableHead>{t("flags")}</TableHead>
              <TableHead>{tShared("order")}</TableHead>
              <TableHead>{tShared("active")}</TableHead>
              <TableHead className="text-right">{tShared("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {error ? (
              <TableRow>
                <TableCell
                  colSpan={COLUMN_COUNT}
                  className="py-10 text-center text-destructive"
                >
                  <span role="alert">{error}</span>
                </TableCell>
              </TableRow>
            ) : loading && items === null ? (
              <TableRow>
                <TableCell
                  colSpan={COLUMN_COUNT}
                  className="py-10 text-center text-muted-foreground"
                >
                  {t("loading")}
                </TableCell>
              </TableRow>
            ) : groups.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={COLUMN_COUNT}
                  className="py-10 text-center text-muted-foreground"
                >
                  {t("noItems")}
                </TableCell>
              </TableRow>
            ) : (
              groups.map(({ group, rows }) => (
                <Fragment key={group}>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableCell
                      colSpan={COLUMN_COUNT}
                      className="py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                    >
                      {tRoot(ITEM_GROUP_LABEL_KEYS[group])}
                    </TableCell>
                  </TableRow>
                  {rows.map((item, index) => (
                    <TableRow
                      key={item.code}
                      className={item.active ? undefined : "opacity-60"}
                    >
                      <TableCell>
                        <div className="flex min-w-0 flex-col">
                          <span className="font-medium">{item.labelEn}</span>
                          <span
                            lang="ka"
                            className="text-sm text-muted-foreground"
                          >
                            {item.labelKa}
                          </span>
                          <span className="font-mono text-xs text-muted-foreground">
                            {item.code}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {item.weightKg}
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {`${formatMetres(item.lengthM)} × ${formatMetres(item.widthM)} × ${formatMetres(item.heightM)}`}
                      </TableCell>
                      <TableCell>
                        <div className="flex max-w-xs flex-wrap gap-1">
                          <Badge variant="outline">
                            {categoryLabel(item.cargoCategory)}
                          </Badge>
                          {!item.stackable ? (
                            <Badge variant="secondary">
                              {t("notStackable")}
                            </Badge>
                          ) : null}
                          {item.needsTwoPeople ? (
                            <Badge variant="secondary">{t("twoPeople")}</Badge>
                          ) : null}
                          {item.requiredBody ? (
                            <Badge variant="secondary">
                              {t("bodyOnly", {
                                body: tRoot(
                                  CHASSIS_TYPE_LABEL_KEYS[item.requiredBody],
                                ),
                              })}
                            </Badge>
                          ) : null}
                          {item.handlingTags.map((tag) => (
                            <Badge key={tag} variant="secondary">
                              {tagLabel(tag)}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <span className="w-10 text-xs text-muted-foreground tabular-nums">
                            {item.sortOrder}
                          </span>
                          {canReorder ? (
                            <>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                disabled={pendingCode !== null || index === 0}
                                aria-label={t("moveUp", {
                                  label: item.labelEn,
                                })}
                                onClick={() => void handleMove(item, "up")}
                              >
                                <ArrowUp />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                disabled={
                                  pendingCode !== null ||
                                  index === rows.length - 1
                                }
                                aria-label={t("moveDown", {
                                  label: item.labelEn,
                                })}
                                onClick={() => void handleMove(item, "down")}
                              >
                                <ArrowDown />
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Checkbox
                          checked={item.active}
                          disabled={pendingCode === item.code}
                          aria-label={t("toggleActiveLabel", {
                            active: String(item.active),
                            label: item.labelEn,
                          })}
                          onCheckedChange={() => void handleToggleActive(item)}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setFormTarget(item)}
                        >
                          {tShared("edit")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </Fragment>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">{t("noDeleteNote")}</p>

      {formTarget !== undefined ? (
        <ItemCatalogueFormDialog
          // Keyed by entry so the form starts from the right values for each
          // one (and empty for a new entry), without an effect to resync them.
          key={formTarget?.code ?? "new"}
          item={formTarget}
          onClose={() => setFormTarget(undefined)}
          onCompleted={() => {
            setFormTarget(undefined);
            setReloadToken((token) => token + 1);
          }}
        />
      ) : null}
    </div>
  );
}
