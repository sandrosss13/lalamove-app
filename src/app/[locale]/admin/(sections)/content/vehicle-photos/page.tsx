"use client";

import { useEffect, useState } from "react";

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
import { Button } from "@/components/ui/button";

const LIST_ENDPOINT = "/api/admin/content/vehicle-photos";

/**
 * The two duty classes, in the order the seed declares them and the public page
 * renders them. Listed explicitly rather than derived from the response so the
 * grouping is stable even if the query's order ever changes.
 */
const CATEGORY_ORDER: readonly VehicleCategory[] = [
  "MEDIUM_DUTY",
  "HEAVY_DUTY",
];

const CATEGORY_LABELS: Record<VehicleCategory, string> = {
  MEDIUM_DUTY: "Medium duty",
  HEAVY_DUTY: "Heavy duty",
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
}: VehiclePhotoCardProps) {
  const saved = vehicleType.imageUrl ?? "";
  const [draft, setDraft] = useState(saved);
  /** Second step of the two-click removal, so a stray click cannot clear a photo. */
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  const trimmedDraft = draft.trim();
  const hasUnsavedChange = trimmedDraft !== saved;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
      <div className="flex flex-col">
        <span className="font-medium">{vehicleType.label}</span>
        {/* The code is what appears in the API payload and in `prisma/seed.ts`,
            so showing it is what makes a row identifiable outside this page. */}
        <span className="font-mono text-xs text-muted-foreground">
          {vehicleType.code}
        </span>
      </div>

      {/* 140px tall to match the image area on the public vehicle card, so this
          shows the crop a visitor actually sees rather than a
          differently-proportioned thumbnail. */}
      <div className="flex h-[140px] w-full items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
        {vehicleType.imageUrl === null ? (
          <span className="px-3 text-center text-xs text-muted-foreground">
            No photo — the public card falls back to its illustrated glyph.
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
        Best at 720×560. The public card crops to a 140px-tall area.
      </p>

      {confirmingRemove ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            Remove this photo? The card falls back to its illustrated glyph on
            the public homepage. The uploaded file itself is kept.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => setConfirmingRemove(false)}
            >
              Cancel
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
              {pending ? "Removing…" : "Remove photo"}
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
            {pending ? "Saving…" : "Save photo"}
          </Button>

          {vehicleType.imageUrl !== null ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => setConfirmingRemove(true)}
            >
              Remove photo
            </Button>
          ) : null}

          {hasUnsavedChange ? (
            <span className="text-xs text-muted-foreground">
              Not saved yet.
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
 * `/admin/content/vehicle-photos` — the marketing photo on each vehicle type.
 *
 * A client component reading the list endpoint rather than a server component
 * querying Prisma directly, matching every other page in this section: the page
 * is almost entirely mutations, and each one needs the list to refresh
 * immediately afterwards. The section layout above it gates *viewing*, and both
 * endpoints re-check the `adminRole` on every request, which is the real
 * boundary.
 *
 * **Only the photo is editable here, by design.** Payload ratings, cargo
 * dimensions, loading access and pricing all drive order matching and are not
 * content; `PATCH /api/admin/content/vehicle-photos/[id]` refuses a request
 * that so much as mentions them.
 */
export default function AdminVehiclePhotosPage() {
  const [vehicleTypes, setVehicleTypes] = useState<
    AdminVehiclePhotoRow[] | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** The row whose save is currently in flight — per row, not per page. */
  const [pendingId, setPendingId] = useState<string | null>(null);
  /** Last failure per row id, cleared when that row is retried. */
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
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
            await readErrorMessage(response, "Could not load vehicle types."),
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

        setError("Could not load vehicle types.");
        setLoading(false);
      }
    }

    void load();

    return () => controller.abort();
  }, [reloadToken]);

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
        // Exactly one field, which is all the endpoint will accept.
        body: JSON.stringify({ imageUrl }),
      });

      if (!response.ok) {
        const message = await readErrorMessage(
          response,
          "Could not update this photo.",
        );
        setRowErrors((errors) => ({ ...errors, [vehicleType.id]: message }));
        return;
      }

      setReloadToken((token) => token + 1);
    } catch {
      setRowErrors((errors) => ({
        ...errors,
        [vehicleType.id]: "Something went wrong. Please try again.",
      }));
    } finally {
      setPendingId(null);
    }
  }

  const items = vehicleTypes ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">
          Photos for the vehicle catalogue on the public homepage. Only the
          photo is editable here — payload ratings, cargo dimensions, loading
          access and pricing drive order matching, so they are not content and
          are changed through the seed.
        </p>
        <p className="text-sm text-muted-foreground">
          A photo goes live as soon as it is saved. There is no draft state for
          a vehicle type, so do not upload a work-in-progress crop expecting to
          publish it later.
        </p>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : loading && vehicleTypes === null ? (
        <p className="text-sm text-muted-foreground">Loading vehicle types…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No vehicle types exist yet. They are created by the seed, not from the
          back office — run{" "}
          <code className="font-mono text-xs">pnpm exec prisma db seed</code>{" "}
          and reload this page.
        </p>
      ) : (
        CATEGORY_ORDER.map((category) => {
          const group = items.filter((item) => item.category === category);

          // A duty class with no rows is a partially-seeded database, not a
          // state worth rendering an empty heading for.
          if (group.length === 0) {
            return null;
          }

          return (
            <section key={category} className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold">
                {CATEGORY_LABELS[category]}
                <span className="ml-2 font-normal text-muted-foreground">
                  {group.length} {group.length === 1 ? "type" : "types"}
                </span>
              </h2>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {group.map((vehicleType) => (
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
