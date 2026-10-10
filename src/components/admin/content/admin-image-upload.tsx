"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

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

/** What the field holds: a still image, or a hero banner's video loop. */
export type AdminMediaKind = "image" | "video";

/**
 * Everything that differs between the two kinds: accepted types, size cap and
 * the `admin.adminImageUpload` keys for the wording.
 *
 * The content types are literals for the same reason as the cache lifetime
 * above — `@/lib/site-media-storage` is `server-only`, so its allowlists cannot
 * be imported here. They must stay a subset of what it accepts.
 *
 * The size caps are enforced here purely to fail fast with a sentence the
 * content manager can act on; Storage enforces its own limit regardless, so
 * nothing depends on this check holding. 8 MB is comfortably above every image
 * the design calls for (the largest is a 2400×900 hero banner) and is the
 * budget for a 6–15 s muted hero loop.
 */
const KIND_CONFIG: Record<
  AdminMediaKind,
  {
    contentTypes: string[];
    maxBytes: number;
    chooseKey: string;
    replaceKey: string;
    uploadingKey: string;
    wrongTypeKey: string;
    tooLargeKey: string;
    previewFailedKey: string;
    urlLabelKey: string;
    placeholder: string;
  }
> = {
  image: {
    contentTypes: ["image/jpeg", "image/png", "image/webp"],
    maxBytes: 8 * 1024 * 1024,
    chooseKey: "admin.adminImageUpload.chooseImage",
    replaceKey: "admin.adminImageUpload.replaceImage",
    uploadingKey: "admin.adminImageUpload.uploadingImage",
    wrongTypeKey: "admin.adminImageUpload.wrongFileType",
    tooLargeKey: "admin.adminImageUpload.fileTooLarge",
    // By far the most common cause is a `site-media` bucket created *private*:
    // uploads succeed against it and every resulting URL then renders broken.
    previewFailedKey: "admin.adminImageUpload.previewFailed",
    urlLabelKey: "common.shared.imageUrl",
    placeholder: "https://example.com/banner.jpg",
  },
  video: {
    contentTypes: ["video/mp4", "video/webm"],
    maxBytes: 8 * 1024 * 1024,
    chooseKey: "admin.adminImageUpload.chooseVideo",
    replaceKey: "admin.adminImageUpload.replaceVideo",
    uploadingKey: "admin.adminImageUpload.uploadingVideo",
    wrongTypeKey: "admin.adminImageUpload.videoWrongFileType",
    tooLargeKey: "admin.adminImageUpload.videoTooLarge",
    previewFailedKey: "admin.adminImageUpload.videoPreviewFailed",
    urlLabelKey: "admin.adminImageUpload.videoUrl",
    placeholder: "https://example.com/hero.mp4",
  },
};

/** Message paths — this module is plain constants, so text resolves at render. */
const UPLOAD_FAILED_FALLBACK_KEY =
  "onboarding.documentUploadDialog.uploadFailed";

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
  /** Called with the new public URL, or "" when the file is removed. */
  onChange: (url: string) => void;
  /** Ties the field to its `<Label htmlFor>`, which the parent owns. */
  id: string;
  /** The parent form is submitting; the whole control goes inert. */
  disabled?: boolean;
  /**
   * `"video"` turns the field into the hero banner's video picker: MP4/WebM,
   * a muted `<video>` preview, and the video size hint. Defaults to `"image"`.
   */
  kind?: AdminMediaKind;
};

/**
 * Rejects a file the endpoint would refuse anyway, before any request is made.
 * Returns the message path to show, or `null` when the file is fine.
 */
function rejectFile(file: File, kind: AdminMediaKind): string | null {
  const config = KIND_CONFIG[kind];

  if (!config.contentTypes.includes(file.type)) {
    return config.wrongTypeKey;
  }

  if (file.size > config.maxBytes) {
    return config.tooLargeKey;
  }

  return null;
}

/** The size/format hint under the field, chosen by kind and purpose. */
function hintKey(kind: AdminMediaKind, purpose: SiteMediaPurpose): string {
  if (kind === "video") {
    return "admin.adminImageUpload.videoFileHint";
  }

  return purpose === "partner-logos"
    ? "admin.adminImageUpload.fileHintLogos"
    : "admin.adminImageUpload.fileHint";
}

/**
 * The one media field the content admin uses, shared by every form that stores
 * an image URL (hero banners, partner logos, vehicle photos) and, with
 * `kind="video"`, the hero banner's optional video. Both consumers
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
  kind = "image",
}: AdminImageUploadProps) {
  const t = useTranslations();
  const config = KIND_CONFIG[kind];
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
          setMessage(payload?.error ?? t(UPLOAD_FAILED_FALLBACK_KEY));
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
        setMessage(t(UPLOAD_FAILED_FALLBACK_KEY));
        setShowUrlField(true);
      }
    },
    [onChange, purpose, t],
  );

  const handleFile = useCallback(
    (file: File) => {
      const rejection = rejectFile(file, kind);
      if (rejection) {
        // No request is made at all: the file is known-bad here. The URL field
        // stays as it was — a wrong file is the content manager's to replace,
        // not a sign that uploading is unavailable.
        setState("failed");
        setMessage(t(rejection));
        setPendingFile(null);
        return;
      }

      setPendingFile(file);
      void upload(file);
    },
    [kind, t, upload],
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
              {t("admin.adminImageUpload.noPreview")}
            </span>
          ) : kind === "video" ? (
            // Muted and inline so it may autoplay as the public slide will;
            // `key` restarts the element when the URL changes.
            <video
              key={value}
              src={value}
              muted
              loop
              playsInline
              autoPlay
              preload="metadata"
              aria-hidden="true"
              className="max-h-full max-w-full object-contain"
              onError={() => setPreviewFailed(true)}
            />
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
        accept={config.contentTypes.join(",")}
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
            ? t("onboarding.documentUploadDialog.uploading")
            : value !== ""
              ? t(config.replaceKey)
              : t(config.chooseKey)}
        </Button>

        {value !== "" && !uploading ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => onChange("")}
          >
            {t("common.shared.remove")}
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
            {t("common.shared.tryAgain")}
          </Button>
        ) : null}

        <button
          type="button"
          className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-50"
          disabled={controlsDisabled}
          onClick={() => setShowUrlField((shown) => !shown)}
        >
          {showUrlField
            ? t("admin.adminImageUpload.hideUrlField")
            : t("admin.adminImageUpload.pasteAUrlInstead")}
        </button>
      </div>

      {uploading ? (
        // Indeterminate on purpose: `uploadToSignedUrl` reports no progress, so
        // any percentage shown here would be invented.
        <div
          role="status"
          aria-label={t(config.uploadingKey)}
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
          placeholder={config.placeholder}
          disabled={disabled}
          aria-label={t(config.urlLabelKey)}
        />
      ) : null}

      <p className="text-xs text-muted-foreground">
        {t(hintKey(kind, purpose))}
      </p>

      {message !== null ? (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      ) : null}

      {previewFailed && value !== "" ? (
        <p role="alert" className="text-sm text-destructive">
          {t(config.previewFailedKey)}
        </p>
      ) : null}
    </div>
  );
}
