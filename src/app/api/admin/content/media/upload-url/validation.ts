import {
  isSupportedSiteMediaContentType,
  SITE_MEDIA_PURPOSES,
  UNSUPPORTED_CONTENT_TYPE_ERROR_KEY,
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
 * first failure as a sentence naming the field it is about, translated through
 * `t` (a root-scoped translator for the reader's locale).
 */
export function parseMediaUploadUrlBody(
  body: unknown,
  t: (key: string, values?: Record<string, string | number>) => string,
): { data: MediaUploadUrlInput } | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: t("common.shared.requestBodyMustBeAJson") };
  }

  const record = body as Record<string, unknown>;

  const { purpose } = record;
  if (
    typeof purpose !== "string" ||
    !SITE_MEDIA_PURPOSES.includes(purpose as SiteMediaPurpose)
  ) {
    return {
      error: t("common.shared.fieldMustBeOneOf", {
        field: "purpose",
        options: SITE_MEDIA_PURPOSES.join(", "),
      }),
    };
  }

  const { fileName } = record;
  if (typeof fileName !== "string" || fileName.trim() === "") {
    return { error: t("common.shared.filenameIsRequiredAndMustBe") };
  }
  if (fileName.trim().length > MAX_FILE_NAME_LENGTH) {
    return {
      error: t("common.shared.fieldMaxLength", {
        field: "fileName",
        max: MAX_FILE_NAME_LENGTH,
      }),
    };
  }

  const { contentType } = record;
  if (typeof contentType !== "string" || contentType.trim() === "") {
    return { error: t("common.shared.contenttypeIsRequiredAndMustBe") };
  }
  // The storage helper's own message (by key), so every rejection of the same
  // file reads as the same sentence.
  if (!isSupportedSiteMediaContentType(contentType.trim())) {
    return { error: t(UNSUPPORTED_CONTENT_TYPE_ERROR_KEY) };
  }

  return {
    data: {
      purpose: purpose as SiteMediaPurpose,
      fileName: fileName.trim(),
      contentType: contentType.trim(),
    },
  };
}
