"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Type-only imports, so nothing of the `server-only` storage module or of the
// route's server dependencies is pulled into this client bundle — both are
// erased at compile time. Sharing the wire shape with the endpoint that
// produces it is what stops this component and the API drifting apart.
import type { MediaUploadUrlResponse } from "@/app/api/admin/content/media/upload-url/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  SITE_MEDIA_BUCKET,
  uploadFileToSignedUrl,
} from "@/lib/supabase-browser-client";
import type { SiteMediaPurpose } from "@/lib/site-media-storage";

const UPLOAD_URL_ENDPOINT = "/api/admin/content/media/upload-url";

/**
 * Cache lifetime sent with the bytes. Restated as a literal rather than
 * imported from `@/lib/site-media-storage` (which owns it as
 * `SITE_MEDIA_CACHE_CONTROL_SECONDS`) because that module is `server-only` and
 * would break the build if it were pulled into this client component. The
 * browser is what sets this, since the upload goes straight to Storage.
 */
const CACHE_CONTROL_SECONDS = "31536000";

/**
 * The three formats the storage helper accepts. Kept as a literal for the same
 * reason as the cache lifetime above — `@/lib/site-media-storage` is
 * `server-only`, so its `ALLOWED_CONTENT_TYPES` cannot be imported here.
 */
const ACCEPTED_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * Cap enforced here purely to fail fast with a sentence the content manager can
 * act on. Comfortably above every asset the design calls for — the largest is a
 * 2400×900 hero banner — and Storage enforces its own limit regardless, so
 * nothing depends on this check holding.
 */
const MAX_FILE_BYTES = 8 * 1024 * 1024;

const UPLOAD_FAILED_FALLBACK =
  "The upload didn't finish. Check your connection and try again.";

/**
 * Shown when the preview `<img>` fails to load. By far the most common cause is
 * a `site-media` bucket created *private*: uploads succeed against it and every
 * resulting URL then renders broken.
 */
const PREVIEW_FAILED_MESSAGE =
  "This image could not be loaded. If it was just uploaded, check the site-media bucket is public.";

/**
 * A neutral checkerboard behind the preview, so a transparent partner logo is
 * visible rather than white-on-white.
 */
const CHECKERBOARD_STYLE: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(45deg, var(--color-muted) 25%, transparent 25%), linear-gradient(-45deg, var(--color-muted) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, var(--color-muted) 75%), linear-gradient(-45deg, transparent 75%, var(--color-muted) 75%)",
  backgroundSize: "16px 16px",
  backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0",
};

export type AdminImageUploadProps = {
  /** Which prefix in the bucket the object is filed under. */
  purpose: SiteMediaPurpose;
  /** The URL currently stored on the row, or "" when there is none. */
  value: string;
  /** Called with the new public URL, or "" when the image is removed. */
  onChange: (imageUrl: string) => void;
  /** Ties the field to its `<Label htmlFor>`, which the parent owns. */
  id: string;
  /** The parent form is submitting; the whole control goes inert. */
  disabled?: boolean;
};

/**
 * Rejects a file the endpoint would refuse anyway, before any request is made.
 * Returns the message to show, or `null` when the file is fine.
 */
function rejectFile(file: File): string | null {
  if (!ACCEPTED_CONTENT_TYPES.includes(file.type)) {
    return "That file is not a JPG, PNG or WebP image. Choose a different one.";
  }

  if (file.size > MAX_FILE_BYTES) {
    return "That file is larger than 8 MB. Choose a smaller one.";
  }

  return null;
}

/**
 * The one image field the content admin uses, shared by every form that stores
 * an image URL (hero banners, partner logos, vehicle photos). Both consumers
 * treat it as a controlled field over a single string: it never writes to the
 * database itself, it only hands back the URL its parent should save.
 *
 * The upload underneath is the repo's usual three-leg shape, minus the recording
 * leg the parent form performs on submit:
 *
 * 1. `POST /api/admin/content/media/upload-url` mints a signed upload URL.
 * 2. `uploadFileToSignedUrl` puts the bytes straight into Supabase Storage —
 *    never through a route handler, whose request-body limit is far below a
 *    2400×900 banner.
 * 3. `onChange(publicUrl)` hands the parent the URL to store.
 *
 * A failure at either leg lands in the same `failed` state with the file still
 * held, so "Try again" retries without asking for the file a second time — and
 * it reveals the "paste a URL instead" input, which is what keeps this field
 * usable when Storage is unconfigured, when the bucket has not been created yet,
 * or when the image genuinely lives on another host. Nothing here ever fails
 * silently, and nothing here can throw during render: `getBrowserClient()`
 * throws only from inside `uploadFileToSignedUrl`, which is inside the `try`.
 *
 * There is no progress bar. `@supabase/supabase-js` v2's `uploadToSignedUrl`
 * exposes no progress events, so the busy state is indeterminate rather than a
 * fabricated percentage.
 */
export function AdminImageUpload({
  purpose,
  value,
  onChange,
  id,
  disabled = false,
}: AdminImageUploadProps) {
  const [state, setState] = useState<"idle" | "uploading" | "failed">("idle");
  const [message, setMessage] = useState<string | null>(null);
  // The last file chosen, kept so the retry button can re-run the sequence.
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  // Revealed by the toggle, and forced open by any failure.
  const [showUrlField, setShowUrlField] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  // A new URL deserves a fresh attempt at rendering it: without this, one
  // broken image would leave the message up for every image chosen after it.
  useEffect(() => {
    setPreviewFailed(false);
  }, [value]);

  const upload = useCallback(
    async (file: File) => {
      setState("uploading");
      setMessage(null);

      try {
        const urlResponse = await fetch(UPLOAD_URL_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            purpose,
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
          // The most likely cause of a 502 here is a bucket nobody has created
          // yet, which no amount of retrying fixes — so offer the way out.
          setShowUrlField(true);
          return;
        }

        const { path, token, publicUrl } =
          (await urlResponse.json()) as MediaUploadUrlResponse;

        // Throws on failure, which the catch below turns into the same
        // retryable `failed` state as an API error.
        await uploadFileToSignedUrl(path, token, file, {
          bucket: SITE_MEDIA_BUCKET,
          cacheControl: CACHE_CONTROL_SECONDS,
        });

        onChange(publicUrl);
        setPendingFile(null);
        setState("idle");
      } catch {
        setState("failed");
        setMessage(UPLOAD_FAILED_FALLBACK);
        setShowUrlField(true);
      }
    },
    [onChange, purpose],
  );

  const handleFile = useCallback(
    (file: File) => {
      const rejection = rejectFile(file);
      if (rejection) {
        // No request is made at all: the file is known-bad here. The URL field
        // stays as it was — a wrong file is the content manager's to replace,
        // not a sign that uploading is unavailable.
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
  const controlsDisabled = disabled || uploading;

  return (
    <div className="flex flex-col gap-2">
      {value !== "" ? (
        <div
          className="flex h-32 w-full items-center justify-center overflow-hidden rounded-lg border border-border"
          style={CHECKERBOARD_STYLE}
        >
          {previewFailed ? (
            <span className="px-3 text-center text-xs text-muted-foreground">
              No preview
            </span>
          ) : (
            <>
              {/*
                Plain <img> rather than next/image: the URL can point at any
                host (the "paste a URL instead" field below allows it), so it
                can't be pinned in `remotePatterns` at build time.
              */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={value}
                alt=""
                loading="lazy"
                className="max-h-full max-w-full object-contain"
                onError={() => setPreviewFailed(true)}
              />
            </>
          )}
        </div>
      ) : null}

      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={ACCEPTED_CONTENT_TYPES.join(",")}
        className="sr-only"
        disabled={controlsDisabled}
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Reset so re-picking the same file after a failure still fires a
          // change event.
          event.target.value = "";
          if (file) handleFile(file);
        }}
      />

      <div className="flex flex-wrap items-center gap-2">
        {/* `type="button"` matters: an unspecified button inside the parent
            dialog's <form> would submit it. */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={controlsDisabled}
          onClick={() => inputRef.current?.click()}
        >
          {uploading
            ? "Uploading…"
            : value !== ""
              ? "Replace image"
              : "Choose image"}
        </Button>

        {value !== "" && !uploading ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => onChange("")}
          >
            Remove
          </Button>
        ) : null}

        {pendingFile !== null && state === "failed" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => void upload(pendingFile)}
          >
            Try again
          </Button>
        ) : null}

        <button
          type="button"
          className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-50"
          disabled={controlsDisabled}
          onClick={() => setShowUrlField((shown) => !shown)}
        >
          {showUrlField ? "Hide URL field" : "Paste a URL instead"}
        </button>
      </div>

      {uploading ? (
        // Indeterminate on purpose: `uploadToSignedUrl` reports no progress, so
        // any percentage shown here would be invented.
        <div
          role="status"
          aria-label="Uploading image"
          className="h-1 w-full overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
        </div>
      ) : null}

      {showUrlField ? (
        <Input
          type="url"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="https://example.com/banner.jpg"
          disabled={disabled}
          aria-label="Image URL"
        />
      ) : null}

      <p className="text-xs text-muted-foreground">
        {purpose === "partner-logos"
          ? "JPG, PNG or WebP · max 8 MB. Logos must be transparent PNG — SVG is not accepted."
          : "JPG, PNG or WebP · max 8 MB."}
      </p>

      {message !== null ? (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      ) : null}

      {previewFailed && value !== "" ? (
        <p role="alert" className="text-sm text-destructive">
          {PREVIEW_FAILED_MESSAGE}
        </p>
      ) : null}
    </div>
  );
}
