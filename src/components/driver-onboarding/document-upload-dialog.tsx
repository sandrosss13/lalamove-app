"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { UploadIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { uploadFileToSignedUrl } from "@/lib/supabase-browser-client";
import {
  useOnboardingDraft,
  type OnboardingDocument,
  type OnboardingDocumentType,
} from "@/components/driver-onboarding/onboarding-draft-context";

/** The three document slots the wizard offers, keyed as the design keys them. */
export type DocumentSlot = "selfie" | "licFront" | "licBack";

/**
 * Per-slot copy, lifted verbatim from the design prototype's `CAPTURE_META`.
 * Exported so a step can reuse a slot's `title` for its own upload tile without
 * restating the wording in a second place.
 */
export const CAPTURE_META: Record<
  DocumentSlot,
  // `titleKey` / `hintKey` are full `next-intl` message paths, translated at
  // render (no hook can run at module scope). `guideKey` and `badgeKey` too.
  { titleKey: string; hintKey: string; guideKey: string; badgeKey: string }
> = {
  selfie: {
    titleKey: "onboarding.documentUploadDialog.uploadYourProfilePhoto",
    hintKey: "common.shared.aRecentPhotoOfYourFace",
    guideKey: "onboarding.documentUploadDialog.guideSelfie",
    badgeKey: "onboarding.documentUploadDialog.badgeSelfie",
  },
  licFront: {
    titleKey: "onboarding.documentUploadDialog.uploadTheFrontOfYourLicence",
    hintKey: "onboarding.documentUploadDialog.thePhotoNameAndLicenceNumber",
    guideKey: "onboarding.documentUploadDialog.guideLicenceFront",
    badgeKey: "onboarding.documentUploadDialog.badgeLicenceFront",
  },
  licBack: {
    titleKey: "onboarding.documentUploadDialog.uploadTheBackOfYourLicence",
    hintKey: "onboarding.documentUploadDialog.theCategoryTableIsWhatThe",
    guideKey: "onboarding.documentUploadDialog.guideLicenceBack",
    badgeKey: "onboarding.documentUploadDialog.badgeLicenceBack",
  },
};

/** The slot's counterpart in the `DriverApplicationDocumentType` enum. */
export const SLOT_TO_DOCUMENT_TYPE: Record<
  DocumentSlot,
  OnboardingDocumentType
> = {
  selfie: "PROFILE_PHOTO",
  licFront: "LICENCE_FRONT",
  licBack: "LICENCE_BACK",
};

const UPLOAD_URL_ENDPOINT =
  "/api/driver-profile/onboarding/documents/upload-url";
const DOCUMENTS_ENDPOINT = "/api/driver-profile/onboarding/documents";

/**
 * The design's per-document cap. Enforced here purely to fail fast with a
 * sentence the driver can act on — the server re-checks the object's recorded
 * content type before it will record a row, and Storage enforces its own size
 * limit, so nothing depends on this check holding.
 */
const MAX_FILE_BYTES = 10 * 1024 * 1024;

/**
 * The two formats the storage helper accepts. Kept as a literal rather than
 * imported from `@/lib/driver-document-storage`, which is `server-only` and
 * would break the build if it were pulled into this client component.
 */
const ACCEPTED_CONTENT_TYPES = ["image/jpeg", "image/png"];

/** What the response of `POST .../documents/upload-url` carries. */
type UploadUrlResponse = { path: string; signedUrl: string; token: string };

/**
 * Rejects a file the endpoints would refuse anyway, before any request is made.
 * Returns the `onboarding.documentUploadDialog` message key to show, or `null`
 * when the file is fine — a key rather than copy, since this runs outside the
 * component and cannot translate.
 */
function rejectFile(file: File): "notJpgOrPng" | "fileTooLarge" | null {
  if (!ACCEPTED_CONTENT_TYPES.includes(file.type)) {
    return "notJpgOrPng";
  }

  if (file.size > MAX_FILE_BYTES) {
    return "fileTooLarge";
  }

  return null;
}

/**
 * The one upload modal, shared by every document slot in the wizard and by the
 * status screen's "Retake" rows. The slot only changes the copy; the three-leg
 * upload underneath is identical everywhere:
 *
 * 1. `POST .../documents/upload-url` mints a signed upload URL.
 * 2. `uploadFileToSignedUrl` puts the bytes straight into Supabase Storage —
 *    never through a route handler, whose request-body limit is below the 10MB
 *    cap this dialog advertises.
 * 3. `POST .../documents` records the object as the live document of its type.
 *
 * A failure at any leg lands in the same `failed` state with the file still
 * held, so "Try again" retries the whole sequence rather than asking the driver
 * to find the file a second time. Nothing here ever fails silently.
 */
export function DocumentUploadDialog({
  slot,
  open,
  onOpenChange,
  onUploaded,
}: {
  slot: DocumentSlot;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploaded: (signedUrl: string) => void;
}) {
  const { recordDocument, showToast } = useOnboardingDraft();
  const t = useTranslations("onboarding.documentUploadDialog");
  const tRoot = useTranslations();

  const [state, setState] = useState<"idle" | "uploading" | "failed">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  // The last file chosen, kept so the retry button can re-run the sequence.
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const meta = CAPTURE_META[slot];

  // Every open starts clean: a message left over from a previous slot — or from
  // a failure the driver already walked away from — would be misleading.
  useEffect(() => {
    if (open) return;
    setState("idle");
    setMessage(null);
    setDragging(false);
    setPendingFile(null);
  }, [open]);

  const upload = useCallback(
    async (file: File) => {
      const type = SLOT_TO_DOCUMENT_TYPE[slot];
      setState("uploading");
      setMessage(null);

      try {
        const urlResponse = await fetch(UPLOAD_URL_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type,
            fileName: file.name,
            contentType: file.type,
          }),
        });

        if (!urlResponse.ok) {
          const payload = (await urlResponse.json().catch(() => null)) as {
            error?: string;
          } | null;
          setState("failed");
          setMessage(payload?.error ?? t("uploadFailed"));
          return;
        }

        const { path, token } = (await urlResponse.json()) as UploadUrlResponse;

        // Throws on failure, which the catch below turns into the same
        // retryable `failed` state as an API error.
        await uploadFileToSignedUrl(path, token, file);

        const recordResponse = await fetch(DOCUMENTS_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type, path }),
        });

        if (!recordResponse.ok) {
          const payload = (await recordResponse.json().catch(() => null)) as {
            error?: string;
          } | null;
          setState("failed");
          setMessage(payload?.error ?? t("uploadFailed"));
          return;
        }

        // The endpoint answers with everything but `flagReason` — a row it has
        // just created is freshly `PENDING` and cannot carry one. Normalising
        // to `null` here rather than widening `OnboardingDocument` keeps the
        // context's entries a single shape, so a consumer testing
        // `flagReason !== null` can't be fooled by an `undefined` that a
        // straight cast would have left behind.
        const recorded = (await recordResponse.json()) as Omit<
          OnboardingDocument,
          "flagReason"
        >;
        recordDocument({ ...recorded, flagReason: null });

        if (recorded.signedUrl === null) {
          // The row exists — the document really is uploaded — but the read URL
          // could not be signed, so there is no thumbnail to hand back. Say so
          // rather than passing an empty string that would render as a broken
          // image in the caller's slot.
          showToast(t("previewSoon"));
        } else {
          onUploaded(recorded.signedUrl);
        }

        onOpenChange(false);
      } catch {
        setState("failed");
        setMessage(t("uploadFailed"));
      }
    },
    [onOpenChange, onUploaded, recordDocument, showToast, slot, t],
  );

  const handleFile = useCallback(
    (file: File) => {
      const rejection = rejectFile(file);
      if (rejection) {
        // No request is made at all: the file is known-bad here.
        setState("failed");
        setMessage(t(rejection));
        setPendingFile(null);
        return;
      }

      setPendingFile(file);
      void upload(file);
    },
    [t, upload],
  );

  const uploading = state === "uploading";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // `data-onboarding-surface` on the *content* rather than relying on the
        // wizard's own marker, and it matters more than it looks. Radix portals
        // this panel to `document.body`, so it renders outside the `<main>` that
        // carries the wizard's attribute; without its own copy,
        // `body:has([data-onboarding-surface])` would still match while a step
        // is mounted, but would stop matching the moment this dialog is opened
        // from anywhere that is not a step — and `globals.css` pins
        // `--background`, `--foreground`, `--admin-accent` and `--admin-muted`
        // on exactly that selector.
        //
        // The consequence for every colour below: `accent` and `muted` are the
        // two utilities whose tokens are var-chains
        // (`var(--admin-accent, var(--landing-accent))` and the `--admin-muted`
        // equivalent), so they are the two that would fall through to the
        // landing palette's bright green and dark brown-grey if that pin ever
        // failed to reach here. Nothing in this file uses either. Neutral
        // surfaces are `bg-secondary`, which reads `--secondary` directly and
        // carries the same value in both themes, and neutral ink is
        // `text-muted-foreground`, which is likewise a direct token — only
        // `--color-muted`, not `--color-muted-foreground`, is chained. Keep it
        // that way; a `bg-accent`/`bg-muted` added here is a bug waiting for a
        // portal edge case.
        data-onboarding-surface=""
        className="gap-0 p-0 sm:max-w-[560px]"
        // A click on the backdrop mid-upload would leave the request running
        // with nothing listening for its result.
        onInteractOutside={(event) => {
          if (uploading) event.preventDefault();
        }}
        showCloseButton={!uploading}
      >
        <DialogHeader className="gap-1 border-b border-border px-[22px] pt-5 pb-4">
          <span className="font-price text-[10.5px] font-semibold tracking-[0.09em] text-muted-foreground uppercase">
            {tRoot(meta.badgeKey)}
          </span>
          <DialogTitle className="text-[18px] leading-tight font-semibold tracking-[-0.01em]">
            {tRoot(meta.titleKey)}
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-[1.5]">
            {tRoot(meta.hintKey)}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 p-[22px]">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_CONTENT_TYPES.join(",")}
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              // Reset so re-picking the same file after a failure still fires
              // a change event.
              event.target.value = "";
              if (file) handleFile(file);
            }}
          />

          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              if (!uploading) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              if (uploading) return;
              const file = event.dataTransfer.files?.[0];
              if (file) handleFile(file);
            }}
            // Two swaps in the resting state, neither of which moves a pixel in
            // light mode:
            //
            // `border-input` rather than `border-border` — identical at
            // `oklch(0.922 0 0)` in light, but in dark `--border` is white at
            // 10% and `--input` at 15%. A dashed 1.5px rule at 10% over
            // `bg-popover` is close to invisible, and the dashed rule *is* the
            // dropzone's affordance: it is the only thing saying "drop a file
            // on me". The 15% edge is also what every input in the wizard uses
            // in dark, so the two read as the same kind of control.
            //
            // `bg-secondary/40` rather than `bg-muted/40` — the same value in
            // both themes, but off the `--admin-muted` var-chain, per the note
            // on `DialogContent` above.
            className={`flex w-full cursor-pointer flex-col items-center gap-2.5 rounded-[13px] border-[1.5px] border-dashed px-5 py-[34px] transition-colors disabled:cursor-wait ${
              dragging
                ? "border-onboarding-accent bg-onboarding-accent/5"
                : "border-input bg-secondary/40 hover:border-onboarding-accent hover:bg-onboarding-accent/5"
            }`}
          >
            <span className="flex size-10 items-center justify-center rounded-full bg-secondary text-muted-foreground">
              <UploadIcon className="size-[17px]" />
            </span>
            <span className="text-[14.5px] font-semibold">
              {uploading ? t("uploading") : t("dragOrBrowse")}
            </span>
            <span className="text-center text-[12.5px] leading-[1.5] text-muted-foreground">
              {tRoot(meta.guideKey)}
            </span>
            <span className="mt-0.5 font-price text-[11.5px] text-muted-foreground">
              {t("jpgOrPngMax10Mb")}
            </span>
          </button>

          {message ? (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-destructive"
            >
              <span>{message}</span>
              {/* Only a failed *upload* is retryable as-is; a rejected file has
                  to be replaced, so there is nothing to retry with. */}
              {pendingFile ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void upload(pendingFile)}
                >
                  {tRoot("common.shared.tryAgain")}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* `bg-secondary/40` rather than `bg-muted/40`: same colour in both
            themes, but off the `--admin-muted` var-chain (see `DialogContent`).
            It is also what the `DialogFooter` primitive reaches for by default,
            and for exactly this reason — the override here is only about the
            40% the design asks for instead of the primitive's 50%. */}
        <DialogFooter className="mx-0 mb-0 flex-row items-center justify-between gap-3.5 rounded-b-xl border-t border-border bg-secondary/40 px-[22px] py-3.5 sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {t("filesAreCheckedByTheReview")}
          </p>
          <Button
            type="button"
            variant="outline"
            size="lg"
            disabled={uploading}
            onClick={() => onOpenChange(false)}
          >
            {tRoot("common.shared.cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
