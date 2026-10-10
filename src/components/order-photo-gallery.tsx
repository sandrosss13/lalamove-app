"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/** One photo as the server hands it over; see `loadOrderPhotoViews`. */
export type OrderPhotoGalleryItem = {
  id: string;
  /** Short-lived signed read URL. */
  url: string;
};

/**
 * An order's cargo photos as a row of thumbnails, each opening the photo full
 * size in a dialog. Shared by every surface that shows an order's details —
 * the client's tracking page, the carrier's job sheet and the load board's
 * drawer and mobile sheet (via `LoadCargoPhotos`) — so the photos look
 * and behave the same wherever an order is read.
 *
 * Renders nothing for an order without photos: they are optional, and an empty
 * "Cargo photos" heading would read as something having failed to load.
 *
 * Plain `<img>` rather than `next/image`: the photos live in a private Supabase
 * bucket behind short-lived signed URLs on a host configured per deployment,
 * so they cannot be pinned in `remotePatterns` at build time — the same reason
 * the driver-document thumbnails give.
 */
export function OrderPhotoGallery({
  photos,
  className,
  headingClassName,
  headingLevel = "h2",
}: {
  photos: readonly OrderPhotoGalleryItem[];
  className?: string;
  /** Lets each surface match the heading style of the card around it. */
  headingClassName?: string;
  /**
   * The heading's element, so a surface that nests the gallery under its own
   * section heading (the load board's "Cargo" `h3`) keeps the outline intact.
   */
  headingLevel?: "h2" | "h3" | "h4";
}) {
  const t = useTranslations("orders.orderPhotos");
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (photos.length === 0) {
    return null;
  }

  const openPhoto = openIndex === null ? null : (photos[openIndex] ?? null);
  const Heading = headingLevel;

  return (
    <section className={cn("flex flex-col gap-2", className)}>
      <Heading className={headingClassName ?? "text-sm font-medium opacity-60"}>
        {t("cargoPhotos")}
      </Heading>

      <ul className="grid grid-cols-3 gap-2">
        {photos.map((photo, index) => (
          <li key={photo.id}>
            <button
              type="button"
              onClick={() => setOpenIndex(index)}
              aria-label={t("openFullSize", { number: index + 1 })}
              className="block aspect-[4/3] w-full overflow-hidden rounded-md border border-border bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.url}
                alt={t("photoAlt", { number: index + 1 })}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            </button>
          </li>
        ))}
      </ul>

      <Dialog
        open={openPhoto !== null}
        onOpenChange={(open) => {
          if (!open) setOpenIndex(null);
        }}
      >
        <DialogContent className="max-w-[calc(100%-2rem)] p-3 sm:max-w-3xl">
          {openPhoto !== null && openIndex !== null ? (
            <>
              <DialogTitle className="text-sm font-medium">
                {t("fullSizeTitle", {
                  number: openIndex + 1,
                  total: photos.length,
                })}
              </DialogTitle>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={openPhoto.url}
                alt={t("photoAlt", { number: openIndex + 1 })}
                className="max-h-[75vh] w-full rounded-md object-contain"
              />
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
