"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { UploadIcon } from "lucide-react";

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
  { title: string; hint: string; guide: string; badge: string }
> = {
  selfie: {
    title: "Upload your profile photo",
    hint: "A recent photo of your face, matched against your ID by the review team.",
    guide: "Face centred, no hat or sunglasses, plain background.",
    badge: "STEP 1 · PROFILE PHOTO",
  },
  licFront: {
    title: "Upload the front of your licence",
    hint: "The photo, name and licence number must be readable.",
    guide: "All four corners visible, no glare across the card.",
    badge: "STEP 2 · LICENCE FRONT",
  },
  licBack: {
    title: "Upload the back of your licence",
    hint: "The category table is what the reviewer checks.",
    guide: "All four corners visible, category rows legible.",
    badge: "STEP 2 · LICENCE BACK",
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

const UPLOAD_FAILED_FALLBACK =
  "The upload didn't finish. Check your connection and try again.";

/** What the response of `POST .../documents/upload-url` carries. */
type UploadUrlResponse = { path: string; signedUrl: string; token: string };

/**
 * Rejects a file the endpoints would refuse anyway, before any request is made.
 * Returns the message to show, or `null` when the file is fine.
 */
function rejectFile(file: File): string | null {
  if (!ACCEPTED_CONTENT_TYPES.includes(file.type)) {
    return "That file is not a JPG or PNG. Choose a different one.";
  }

  if (file.size > MAX_FILE_BYTES) {
    return "That file is larger than 10 MB. Choose a smaller one.";
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
          setMessage(payload?.error ?? UPLOAD_FAILED_FALLBACK);
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
          setMessage(payload?.error ?? UPLOAD_FAILED_FALLBACK);
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
          showToast("Uploaded. The preview will appear shortly.");
        } else {
          onUploaded(recorded.signedUrl);
        }

        onOpenChange(false);
      } catch {
        setState("failed");
        setMessage(UPLOAD_FAILED_FALLBACK);
      }
    },
    [onOpenChange, onUploaded, recordDocument, showToast, slot],
  );

  const handleFile = useCallback(
    (file: File) => {
      const rejection = rejectFile(file);
      if (rejection) {
        // No request is made at all: the file is known-bad here.
        setState("failed");
        setMessage(rejection);
        setPendingFile(null);
        return;
      }

      setPendingFile(file);
      void upload(file);
    },
    [upload],
  );

  const uploading = state === "uploading";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
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
            {meta.badge}
          </span>
          <DialogTitle className="text-[18px] leading-tight font-semibold tracking-[-0.01em]">
            {meta.title}
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-[1.5]">
            {meta.hint}
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
            className={`flex w-full cursor-pointer flex-col items-center gap-2.5 rounded-[13px] border-[1.5px] border-dashed px-5 py-[34px] transition-colors disabled:cursor-wait ${
              dragging
                ? "border-onboarding-accent bg-onboarding-accent/5"
                : "border-border bg-muted/40 hover:border-onboarding-accent hover:bg-onboarding-accent/5"
            }`}
          >
            <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <UploadIcon className="size-[17px]" />
            </span>
            <span className="text-[14.5px] font-semibold">
              {uploading
                ? "Uploading…"
                : "Drag a file here, or click to browse"}
            </span>
            <span className="text-center text-[12.5px] leading-[1.5] text-muted-foreground">
              {meta.guide}
            </span>
            <span className="mt-0.5 font-price text-[11.5px] text-muted-foreground">
              JPG or PNG · max 10 MB
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
                  Try again
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter className="mx-0 mb-0 flex-row items-center justify-between gap-3.5 rounded-b-xl border-t border-border bg-muted/40 px-[22px] py-3.5 sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Files are checked by the review team, not automatically.
          </p>
          <Button
            type="button"
            variant="outline"
            size="lg"
            disabled={uploading}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
