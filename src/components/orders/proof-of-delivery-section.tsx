"use client";

import { useRef, useState } from "react";
import { ExternalLink, ImageOff, PenLine } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * The proof as the tracking page hands it over: `OrderProof` from
 * `src/lib/orders/pod.ts`, restated structurally rather than imported so this
 * client component has no edge, not even a type-only one, to a `server-only`
 * module. Plain serialisable data — URLs that expire, and times the server
 * has already formatted.
 *
 * **Why pre-formatted.** A date formatted here would be formatted twice: once
 * on the server for the HTML and again in the browser on hydration, by
 * whatever `Intl` data that browser ships. Node carries full ICU; a browser
 * with reduced locale data (headless Chromium is one) prints Georgian dates in
 * English and React reports a hydration mismatch. The page formats with
 * `getFormatter()` — the same locale and `Asia/Tbilisi` zone as every other
 * date on it — and this component only prints the result.
 */
export type ProofOfDeliveryView = {
  photos: { id: string; url: string | null; takenAtLabel: string }[];
  hasSignature: boolean;
  signatureUrl: string | null;
};

/** One tile, signature or photo, in the order it is laid out. */
type ProofItem = {
  key: string;
  kind: "signature" | "photo";
  url: string | null;
  /** Visible caption, and the image's alt text. */
  label: string;
  /** Accessible name of the tile's button. */
  openLabel: string;
  /** Second caption line — when the photo was taken. */
  detail: string | null;
};

/**
 * The client's view of their delivery's proof: the recipient's signature and
 * the driver's drop-off photos, each opening full size in a dialog.
 *
 * **What the client is shown, and how.** The images live in the private
 * `delivery-proofs` bucket (`src/lib/pod-storage.ts`). The tracking page signs
 * them with `toOrderProof` — the same five-minute signed read URLs the job
 * sheet uses — *after* establishing that the reader is the order's client
 * (`trackPageSections`). Nothing here is public, nothing is cached under a
 * permanent path: plain `<img>` rather than `next/image` for the reason the
 * job sheet's proof block gives (the optimiser would keep an unauthenticated
 * copy).
 *
 * **Expiry.** A URL is valid for five minutes from the render. A tile or the
 * dialog opened later fails to load, and says so — "refresh the page" — rather
 * than showing a broken-image glyph. The same message covers a URL Storage
 * could not sign at all (`url: null`): the proof is on file, just not
 * readable right now, which is different from there being no proof.
 *
 * **The signature is ink on transparency.** The driver app exports a PNG with
 * dark strokes and no background, so its tile and dialog are always painted
 * white — on the dark theme's surface the strokes would otherwise vanish. It
 * is the one place this page uses a literal colour, and it is the colour of
 * the paper the recipient signed on.
 *
 * Renders a one-line "nothing was recorded" panel for a completed order with
 * no proof (one closed on the web, or before proof existed) rather than
 * nothing: on the client's own page an absent section reads as a fault, and
 * the honest answer is that there is no proof to show.
 *
 * No receiver name: the driver app does not capture one, so there is nothing
 * true to print under the signature.
 */
export function ProofOfDeliverySection({
  proof,
  completedLabel,
}: {
  proof: ProofOfDeliveryView;
  /** When the order was completed, formatted by the page; null while not. */
  completedLabel: string | null;
}) {
  const t = useTranslations("orderTracking.proof");
  const tPage = useTranslations("orderTracking.page");
  const [openKey, setOpenKey] = useState<string | null>(null);
  // The tile that opened the dialog. The dialog is controlled rather than
  // wrapped around a `DialogTrigger` (one dialog serves every tile), so Radix
  // has no trigger to hand focus back to on close — this is it.
  const openerRef = useRef<HTMLElement | null>(null);
  // Keys whose image failed to load in a tile — the URL expired or never
  // signed. Remembered so the dialog for the same item says so up front.
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());

  const items: ProofItem[] = [];
  if (proof.hasSignature) {
    items.push({
      key: "signature",
      kind: "signature",
      url: proof.signatureUrl,
      label: t("signature"),
      openLabel: t("openSignature"),
      detail: null,
    });
  }
  proof.photos.forEach((photo, index) => {
    items.push({
      key: photo.id,
      kind: "photo",
      url: photo.url,
      label: t("photo", { number: index + 1 }),
      openLabel: t("openPhoto", { number: index + 1 }),
      detail: t("takenAt", { time: photo.takenAtLabel }),
    });
  });

  const summary = proof.hasSignature
    ? t("summary", { photos: proof.photos.length })
    : proof.photos.length > 0
      ? t("summaryNoSignature", { photos: proof.photos.length })
      : null;

  const openItem = items.find((item) => item.key === openKey) ?? null;
  const markFailed = (key: string) =>
    setFailed((current) => {
      if (current.has(key)) return current;
      const next = new Set(current);
      next.add(key);
      return next;
    });

  return (
    <section
      aria-labelledby="proof-of-delivery-heading"
      className="rounded-[14px] border border-line bg-surface p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2
            id="proof-of-delivery-heading"
            className="font-display text-lg font-semibold tracking-[-0.01em] text-paper"
          >
            {t("title")}
          </h2>
          <p className="mt-1 text-[13px] leading-snug text-muted">
            {t("description")}
          </p>
        </div>
        {summary ? (
          <p className="rounded-full border border-line px-3 py-1 text-[12px] font-medium text-muted">
            {summary}
          </p>
        ) : null}
      </div>

      {completedLabel ? (
        <p className="mt-3 text-[13px] font-medium text-paper">
          {tPage("deliveredAt", { time: completedLabel })}
        </p>
      ) : null}

      {items.length === 0 ? (
        <p className="mt-4 rounded-[10px] border border-dashed border-line px-4 py-3.5 text-[13px] leading-snug text-muted">
          {t("none")}
        </p>
      ) : (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:gap-4">
          {items.map((item) => (
            <li key={item.key} className="min-w-0">
              <figure className="flex flex-col gap-2">
                <ProofTile
                  item={item}
                  failed={failed.has(item.key)}
                  onOpen={(opener) => {
                    openerRef.current = opener;
                    setOpenKey(item.key);
                  }}
                  onError={() => markFailed(item.key)}
                  unavailableLabel={t("unavailable")}
                />
                <figcaption className="min-w-0 text-[12.5px] leading-snug">
                  <span className="flex items-center gap-1.5 font-semibold text-paper">
                    {item.kind === "signature" ? (
                      <PenLine
                        aria-hidden="true"
                        className="size-3.5 shrink-0 text-muted"
                      />
                    ) : null}
                    <span className="truncate">{item.label}</span>
                  </span>
                  {item.detail ? (
                    <span className="mt-0.5 block text-muted tabular-nums">
                      {item.detail}
                    </span>
                  ) : null}
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={openItem !== null}
        onOpenChange={(open) => {
          if (!open) setOpenKey(null);
        }}
      >
        <DialogContent
          className="max-w-[calc(100%-2rem)] gap-3 p-3 sm:max-w-3xl sm:p-4"
          onCloseAutoFocus={(event) => {
            if (openerRef.current) {
              event.preventDefault();
              openerRef.current.focus();
            }
          }}
        >
          {openItem ? (
            <>
              <DialogTitle className="pr-8 text-sm font-semibold">
                {openItem.label}
              </DialogTitle>
              <DialogDescription
                className={openItem.detail ? "text-[13px]" : "sr-only"}
              >
                {openItem.detail ?? t("description")}
              </DialogDescription>
              {openItem.url === null || failed.has(openItem.key) ? (
                <UnavailableNotice label={t("unavailable")} />
              ) : (
                <>
                  <div
                    className={
                      openItem.kind === "signature"
                        ? "rounded-md bg-white p-4"
                        : "rounded-md bg-black/5 dark:bg-white/5"
                    }
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={openItem.url}
                      alt={openItem.label}
                      onError={() => markFailed(openItem.key)}
                      className="mx-auto max-h-[70vh] w-full rounded-md object-contain"
                    />
                  </div>
                  <a
                    href={openItem.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 self-start text-[13px] font-semibold underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none"
                  >
                    <ExternalLink aria-hidden="true" className="size-3.5" />
                    {t("openInNewTab")}
                  </a>
                </>
              )}
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}

/**
 * One thumbnail: a button that opens the dialog, or — with no URL, or after
 * the image failed to load — a plain panel saying the image is unavailable.
 */
function ProofTile({
  item,
  failed,
  onOpen,
  onError,
  unavailableLabel,
}: {
  item: ProofItem;
  failed: boolean;
  onOpen: (opener: HTMLElement) => void;
  onError: () => void;
  unavailableLabel: string;
}) {
  const frame =
    "block aspect-[4/3] w-full overflow-hidden rounded-[10px] border border-line";

  if (item.url === null || failed) {
    return (
      <div className={`${frame} bg-ink`}>
        <UnavailableNotice label={unavailableLabel} compact />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={(event) => onOpen(event.currentTarget)}
      aria-label={item.openLabel}
      className={`${frame} group relative transition-colors hover:border-accent/40 focus-visible:ring-3 focus-visible:ring-accent/40 focus-visible:outline-none ${
        item.kind === "signature" ? "bg-white" : "bg-ink"
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.url}
        alt={item.label}
        loading="lazy"
        onError={onError}
        className={
          item.kind === "signature"
            ? "h-full w-full object-contain p-3 sm:p-4"
            : "h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
        }
      />
    </button>
  );
}

/** What stands in for an image that is on file but cannot be shown. */
function UnavailableNotice({
  label,
  compact = false,
}: {
  label: string;
  compact?: boolean;
}) {
  return (
    <div
      role="status"
      className={`flex h-full flex-col items-center justify-center gap-2 text-center text-muted ${
        compact ? "p-3 text-[11.5px] leading-snug" : "p-6 text-[13px]"
      }`}
    >
      <ImageOff aria-hidden="true" className="size-5 shrink-0" />
      <p>{label}</p>
    </div>
  );
}
