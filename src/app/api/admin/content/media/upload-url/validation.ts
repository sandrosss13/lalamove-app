import {
  isSupportedSiteMediaContentType,
  SITE_MEDIA_PURPOSES,
  UNSUPPORTED_CONTENT_TYPE_ERROR,
  type SiteMediaPurpose,
} from "@/lib/site-media-storage";

/**
 * The wire contract and input rules for
 * `POST /api/admin/content/media/upload-url`.
 *
 * They live in a sibling module for the same reason
 * `@/app/api/admin/content/pages/validation` does: a `route.ts` is a Next.js
 * entry point and may only export handlers and Next's route config, so shared
 * runtime helpers cannot live in one. The response type additionally has to be
 * importable — type-only — by the client uploader, which cannot import the
 * route.
 *
 * Importing the runtime values above out of the `server-only` storage module is
 * safe here: nothing but the route reaches this file.
 */

/** Request body of `POST /api/admin/content/media/upload-url`. */
export type MediaUploadUrlInput = {
  purpose: SiteMediaPurpose;
  fileName: string;
  contentType: string;
};

/** Response body of the same endpoint. */
export type MediaUploadUrlResponse = {
  /** Storage object key, needed by `uploadToSignedUrl`. */
  path: string;
  /** Single-use upload token, needed by `uploadToSignedUrl`. */
  token: string;
  /** Where the object will be readable once the bytes land. */
  publicUrl: string;
};

/**
 * Cap on the original file name. It only ever becomes a suffix on a
 * UUID-prefixed object key, and `toSafeFileName` strips anything that could
 * escape the prefix, so nothing downstream depends on its content — the cap just
 * keeps a pathological key out of the bucket.
 */
const MAX_FILE_NAME_LENGTH = 200;

/**
 * Hand-rolled body validation, consistent with the rest of the API (the project
 * deliberately uses no validation library). Returns the cleaned input, or the
 * first failure as a sentence naming the field it is about.
 */
export function parseMediaUploadUrlBody(
  body: unknown,
): { data: MediaUploadUrlInput } | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: "Request body must be a JSON object." };
  }

  const record = body as Record<string, unknown>;

  const { purpose } = record;
  if (
    typeof purpose !== "string" ||
    !SITE_MEDIA_PURPOSES.includes(purpose as SiteMediaPurpose)
  ) {
    return {
      error: `purpose must be one of: ${SITE_MEDIA_PURPOSES.join(", ")}.`,
    };
  }

  const { fileName } = record;
  if (typeof fileName !== "string" || fileName.trim() === "") {
    return { error: "fileName is required and must be a non-empty string." };
  }
  if (fileName.trim().length > MAX_FILE_NAME_LENGTH) {
    return {
      error: `fileName must be ${MAX_FILE_NAME_LENGTH} characters or fewer.`,
    };
  }

  const { contentType } = record;
  if (typeof contentType !== "string" || contentType.trim() === "") {
    return { error: "contentType is required and must be a non-empty string." };
  }
  // The storage helper's own message, verbatim, so the browser shows the same
  // sentence its pre-flight check would have shown for the same file.
  if (!isSupportedSiteMediaContentType(contentType.trim())) {
    return { error: UNSUPPORTED_CONTENT_TYPE_ERROR };
  }

  return {
    data: {
      purpose: purpose as SiteMediaPurpose,
      fileName: fileName.trim(),
      contentType: contentType.trim(),
    },
  };
}
