"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import type { VehicleCategory } from "@prisma/client";

// Type-only import, so nothing of the server route (Prisma, Better Auth) is
// pulled into this client bundle — it is erased at compile time. Sharing the
// row shape with the endpoint that produces it is what stops this page and the
// API drifting apart.
import type {
  AdminVehiclePhotoListResponse,
  AdminVehiclePhotoRow,
} from "@/app/api/admin/content/vehicle-photos/route";
import { AdminImageUpload } from "@/components/admin/content/admin-image-upload";
import { moveAt } from "@/components/admin/content/home-page-cms/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const LIST_ENDPOINT = "/api/admin/content/vehicle-photos";

/** `PUT` target that rewrites one duty class's homepage order. */
const REORDER_ENDPOINT = `${LIST_ENDPOINT}/reorder`;

/**
 * The two duty classes, in the order the seed declares them and the public page
 * renders them. Listed explicitly rather than derived from the response so the
 * grouping is stable even if the query's order ever changes.
 */
const CATEGORY_ORDER: readonly VehicleCategory[] = [
  "MEDIUM_DUTY",
  "HEAVY_DUTY",
];

/** `admin.adminContentVehiclePhotos` key for each duty class's heading. */
const CATEGORY_LABEL_KEYS: Record<VehicleCategory, string> = {
  MEDIUM_DUTY: "mediumDuty",
  HEAVY_DUTY: "heavyDuty",
};

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

type VehiclePhotoCardProps = {
  vehicleType: AdminVehiclePhotoRow;
  /** This row's own save is in flight; only this card goes inert. */
  pending: boolean;
  /** The API's message from this row's last failed save, if any. */
  error: string | null;
  /** `null` clears the photo; a string sets it. */
  onSave: (imageUrl: string | null) => void;
  /** Already first / last in its duty class, so that arrow is disabled. */
  isFirst: boolean;
  isLast: boolean;
  /** A reorder of this card's duty class is in flight; both arrows go inert. */
  moveDisabled: boolean;
  /** Moves this type one place up (`-1`) or down (`1`) on the homepage. */
  onMove: (direction: -1 | 1) => void;
  /** Shows (`true`) or hides (`false`) this type on the homepage. */
  onToggleVisibility: (showOnHomepage: boolean) => void;
};

/**
 * One vehicle type: what the public page shows today, and the control that
 * changes it.
 *
 * The draft URL lives here rather than in the page so eleven cards do not share
 * one edit buffer. The parent remounts this component whenever the saved value
 * changes (see the `key` it passes), which resets the draft to whatever the
 * database now holds without an effect to resynchronise it.
 */
function VehiclePhotoCard({
  vehicleType,
  pending,
  error,
  onSave,
  isFirst,
  isLast,
  moveDisabled,
  onMove,
  onToggleVisibility,
}: VehiclePhotoCardProps) {
  const t = useTranslations("admin.adminContentVehiclePhotos");
  const tShared = useTranslations("common.shared");
  const saved = vehicleType.imageUrl ?? "";
  const [draft, setDraft] = useState(saved);
  /** Second step of the two-click removal, so a stray click cannot clear a photo. */
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  const trimmedDraft = draft.trim();
  const hasUnsavedChange = trimmedDraft !== saved;
  const hidden = !vehicleType.showOnHomepage;
  const visibilityId = `vehicle-visibility-${vehicleType.id}`;

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border p-4",
        // Dashed and muted rather than removed: a hidden type stays here so it
        // can be shown again, but must not read as live at a glance.
        hidden ? "border-dashed border-border bg-muted/40" : "border-border",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <span
            className={cn(
              "font-medium",
              hidden ? "text-muted-foreground" : undefined,
            )}
          >
            {vehicleType.label}
          </span>
          {/* The code is what appears in the API payload and in `prisma/seed.ts`,
              so showing it is what makes a row identifiable outside this page. */}
          <span className="font-mono text-xs text-muted-foreground">
            {vehicleType.code}
          </span>
        </div>

        {/* Same up/down pattern as the home page section list. Each press
            saves at once, so there is no separate "save order" step. */}
        <div className="flex shrink-0 gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            disabled={moveDisabled || isFirst}
            aria-label={t("moveVehicleUp", { name: vehicleType.label })}
            onClick={() => onMove(-1)}
          >
            ↑
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            disabled={moveDisabled || isLast}
            aria-label={t("moveVehicleDown", { name: vehicleType.label })}
            onClick={() => onMove(1)}
          >
            ↓
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Checkbox
            id={visibilityId}
            checked={vehicleType.showOnHomepage}
            disabled={pending}
            onCheckedChange={(checked) => onToggleVisibility(checked === true)}
          />
          <Label htmlFor={visibilityId}>{t("showOnHomepage")}</Label>
        </div>
        {hidden ? (
          <Badge variant="outline">{t("hiddenFromHomepage")}</Badge>
        ) : null}
      </div>

      {/* 140px tall to match the image area on the public vehicle card, so this
          shows the crop a visitor actually sees rather than a
          differently-proportioned thumbnail. */}
      <div
        className={cn(
          "flex h-[140px] w-full items-center justify-center overflow-hidden rounded-lg border border-border bg-muted",
          hidden ? "opacity-60" : undefined,
        )}
      >
        {vehicleType.imageUrl === null ? (
          <span className="px-3 text-center text-xs text-muted-foreground">
            {t("noPhotoThePublicCardFalls")}
          </span>
        ) : (
          <>
            {/*
              Plain <img> rather than next/image: the URL is supplied by a
              content editor and can point at any host, so it can't be pinned in
              `next.config`'s `remotePatterns` at build time.
            */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={vehicleType.imageUrl}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
          </>
        )}
      </div>

      <AdminImageUpload
        purpose="vehicles"
        value={draft}
        onChange={setDraft}
        id={`vehicle-photo-${vehicleType.id}`}
        disabled={pending}
      />

      <p className="text-xs text-muted-foreground">
        {t("bestAt720560ThePublic")}
      </p>

      {confirmingRemove ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            {t("removeThisPhotoTheCardFalls")}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => setConfirmingRemove(false)}
            >
              {tShared("cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={pending}
              onClick={() => {
                setConfirmingRemove(false);
                onSave(null);
              }}
            >
              {pending ? tShared("removing") : t("removePhoto")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            disabled={pending || !hasUnsavedChange || trimmedDraft === ""}
            onClick={() => onSave(trimmedDraft)}
          >
            {pending ? tShared("saving") : t("savePhoto")}
          </Button>

          {vehicleType.imageUrl !== null ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => setConfirmingRemove(true)}
            >
              {t("removePhoto")}
            </Button>
          ) : null}

          {hasUnsavedChange ? (
            <span className="text-xs text-muted-foreground">
              {t("notSavedYet")}
            </span>
          ) : null}
        </div>
      )}

      {/* Reported against the row that failed rather than as a page banner, so
          it is obvious which of the eleven types was refused. */}
      {error !== null ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * `/admin/content/vehicle-photos` — how each vehicle type is presented on the
 * public homepage: its marketing photo, its position within its duty class
 * (Medium / Heavy), and whether the homepage shows it at all.
 *
 * Order and visibility save immediately and optimistically: each arrow press
 * sends the duty class's whole new order to
 * `PUT /api/admin/content/vehicle-photos/reorder`, and each checkbox sends
 * `PATCH { showOnHomepage }`; a failure restores the previous state and says
 * so. Both are **homepage only** — the homepage catalogue, the homepage
 * booking card, the category tiles and the city landing pages (everything
 * built on `useLandingVehicleTypes`). A hidden type stays bookable from the
 * signed-in booking form, which also keeps its own cheapest-first order.
 * Hidden types stay listed here, marked, so they can be shown again.
 *
 * A client component reading the list endpoint rather than a server component
 * querying Prisma directly, matching every other page in this section: the page
 * is almost entirely mutations, and each one needs the list to refresh
 * immediately afterwards. The section layout above it gates *viewing*, and both
 * endpoints re-check the `adminRole` on every request, which is the real
 * boundary.
 *
 * **Only presentation is editable here, by design.** Payload ratings, cargo
 * dimensions, loading access and pricing all drive order matching and are not
 * content; `PATCH /api/admin/content/vehicle-photos/[id]` refuses a request
 * that so much as mentions them. Vehicle types are never created or deleted
 * here either — they come from the seed.
 */
export default function AdminVehiclePhotosPage() {
  const t = useTranslations("admin.adminContentVehiclePhotos");
  const tShared = useTranslations("common.shared");
  const [vehicleTypes, setVehicleTypes] = useState<
    AdminVehiclePhotoRow[] | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** The row whose save is currently in flight — per row, not per page. */
  const [pendingId, setPendingId] = useState<string | null>(null);
  /** Last failure per row id, cleared when that row is retried. */
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  /** The duty class whose reorder is in flight; its arrows go inert. */
  const [reorderingCategory, setReorderingCategory] =
    useState<VehicleCategory | null>(null);
  /** Last reorder failure per duty class, cleared on its next move. */
  const [reorderErrors, setReorderErrors] = useState<
    Partial<Record<VehicleCategory, string>>
  >({});
  // Bumped after any mutation, purely to re-run the fetch below so the page
  // shows the state the database now holds rather than a patched copy.
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    setLoading(true);
    setError(null);

    async function load() {
      try {
        const response = await fetch(LIST_ENDPOINT, {
          signal: controller.signal,
        });

        if (!response.ok) {
          setError(
            await readErrorMessage(response, t("couldNotLoadVehicleTypes")),
          );
          setLoading(false);
          return;
        }

        const body = (await response.json()) as AdminVehiclePhotoListResponse;
        setVehicleTypes(body.items);
        setLoading(false);
      } catch {
        // An abort is this effect being cleaned up (a newer load is already in
        // flight), not a failure worth showing.
        if (controller.signal.aborted) {
          return;
        }

        setError(t("couldNotLoadVehicleTypes"));
        setLoading(false);
      }
    }

    void load();

    return () => controller.abort();
  }, [reloadToken, t]);

  /** Writes one type's photo, or clears it when `imageUrl` is null. */
  async function handleSave(
    vehicleType: AdminVehiclePhotoRow,
    imageUrl: string | null,
  ) {
    setPendingId(vehicleType.id);
    // Only this row's previous failure is dropped: an unrelated row that failed
    // a moment ago keeps its message until it is retried itself.
    setRowErrors((errors) =>
      Object.fromEntries(
        Object.entries(errors).filter(([id]) => id !== vehicleType.id),
      ),
    );

    try {
      const response = await fetch(`${LIST_ENDPOINT}/${vehicleType.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // Only the photo: visibility saves through its own checkbox.
        body: JSON.stringify({ imageUrl }),
      });

      if (!response.ok) {
        const message = await readErrorMessage(
          response,
          t("couldNotUpdateThisPhoto"),
        );
        setRowErrors((errors) => ({ ...errors, [vehicleType.id]: message }));
        return;
      }

      setReloadToken((token) => token + 1);
    } catch {
      setRowErrors((errors) => ({
        ...errors,
        [vehicleType.id]: tShared("somethingWentWrongPleaseTryAgain"),
      }));
    } finally {
      setPendingId(null);
    }
  }

  /** Drops one row's previous failure, leaving every other row's message. */
  function clearRowError(id: string) {
    setRowErrors((errors) =>
      Object.fromEntries(
        Object.entries(errors).filter(([errorId]) => errorId !== id),
      ),
    );
  }

  /**
   * Shows or hides one type on the homepage. Optimistic: the checkbox flips at
   * once, and flips back with a message if the save is refused.
   */
  async function handleToggleVisibility(
    vehicleType: AdminVehiclePhotoRow,
    showOnHomepage: boolean,
  ) {
    const setRowVisibility = (value: boolean) =>
      setVehicleTypes((rows) =>
        rows === null
          ? rows
          : rows.map((row) =>
              row.id === vehicleType.id
                ? { ...row, showOnHomepage: value }
                : row,
            ),
      );

    setPendingId(vehicleType.id);
    clearRowError(vehicleType.id);
    setRowVisibility(showOnHomepage);

    let failure: string | null = null;
    try {
      const response = await fetch(`${LIST_ENDPOINT}/${vehicleType.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showOnHomepage }),
      });

      if (!response.ok) {
        failure = await readErrorMessage(
          response,
          t("couldNotUpdateVisibility"),
        );
      }
    } catch {
      failure = tShared("somethingWentWrongPleaseTryAgain");
    } finally {
      setPendingId(null);
    }

    if (failure !== null) {
      // Restored to the value the row held before this click, which is what
      // the database still holds.
      setRowVisibility(vehicleType.showOnHomepage);
      const message = failure;
      setRowErrors((errors) => ({ ...errors, [vehicleType.id]: message }));
    }
  }

  /**
   * Moves one type a place up or down within its duty class and saves the
   * class's whole new order at once. Optimistic: the card moves immediately;
   * on failure the previous list is restored and the class shows why.
   */
  async function handleMove(
    category: VehicleCategory,
    index: number,
    direction: -1 | 1,
  ) {
    if (vehicleTypes === null) {
      return;
    }

    const previous = vehicleTypes;
    const group = previous.filter((row) => row.category === category);
    const reordered = moveAt(group, index, direction);

    // Rebuilt category by category so the other class keeps its rows and
    // order exactly as they are.
    setVehicleTypes(
      CATEGORY_ORDER.flatMap((entry) =>
        entry === category
          ? reordered
          : previous.filter((row) => row.category === entry),
      ),
    );
    setReorderingCategory(category);
    setReorderErrors((errors) => ({ ...errors, [category]: undefined }));

    let failure: string | null = null;
    try {
      const response = await fetch(REORDER_ENDPOINT, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          ids: reordered.map((row) => row.id),
        }),
      });

      if (response.ok) {
        // Adopt the server's list: it is the dense order now stored.
        const body = (await response.json()) as AdminVehiclePhotoListResponse;
        setVehicleTypes(body.items);
      } else {
        failure = await readErrorMessage(response, t("couldNotReorder"));
      }
    } catch {
      failure = t("couldNotReorder");
    } finally {
      setReorderingCategory(null);
    }

    if (failure !== null) {
      setVehicleTypes(previous);
      const message = failure;
      setReorderErrors((errors) => ({ ...errors, [category]: message }));
    }
  }

  const items = vehicleTypes ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">
          {t("photosForTheVehicleCatalogueOn")}
        </p>
        <p className="text-sm text-muted-foreground">
          {t("aPhotoGoesLiveAsSoon")}
        </p>
        <p className="text-sm text-muted-foreground">
          {t("homepageOrderHint")}
        </p>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : loading && vehicleTypes === null ? (
        <p className="text-sm text-muted-foreground">
          {tShared("loadingVehicleTypes")}
        </p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t.rich("noVehicleTypesYet", {
            code: (chunks) => (
              <code className="font-mono text-xs">{chunks}</code>
            ),
          })}
        </p>
      ) : (
        CATEGORY_ORDER.map((category) => {
          const group = items.filter((item) => item.category === category);

          // A duty class with no rows is a partially-seeded database, not a
          // state worth rendering an empty heading for.
          if (group.length === 0) {
            return null;
          }

          const reorderError = reorderErrors[category];

          return (
            <section key={category} className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold">
                {t(CATEGORY_LABEL_KEYS[category])}
                <span className="ml-2 font-normal text-muted-foreground">
                  {t("typeCount", { count: group.length })}
                </span>
              </h2>

              {reorderError !== undefined ? (
                <p role="alert" className="text-sm text-destructive">
                  {reorderError}
                </p>
              ) : null}

              {/* Cards run in homepage order, left to right then down, so the
                  grid reads the way the homepage tab will. */}
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {group.map((vehicleType, index) => (
                  <VehiclePhotoCard
                    // Keyed by the saved photo as well as the id, so a
                    // successful save remounts the card and its draft restarts
                    // from what the database now holds.
                    key={`${vehicleType.id}:${vehicleType.imageUrl ?? ""}`}
                    vehicleType={vehicleType}
                    pending={pendingId === vehicleType.id}
                    error={rowErrors[vehicleType.id] ?? null}
                    onSave={(imageUrl) =>
                      void handleSave(vehicleType, imageUrl)
                    }
                    isFirst={index === 0}
                    isLast={index === group.length - 1}
                    moveDisabled={reorderingCategory === category}
                    onMove={(direction) =>
                      void handleMove(category, index, direction)
                    }
                    onToggleVisibility={(showOnHomepage) =>
                      void handleToggleVisibility(vehicleType, showOnHomepage)
                    }
                  />
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
