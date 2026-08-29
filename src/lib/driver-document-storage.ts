/**
 * Supabase Storage access for onboarding documents (profile photo, licence
 * front/back). Server-only: it authenticates with the service role key, which
 * bypasses row level security and must never reach the browser — import this
 * from route handlers and server components only.
 *
 * Unlike `src/lib/supabase-storage.ts` (public vehicle photos), this bucket is
 * private: nothing is persisted as a public URL. The database stores the object
 * *path*; a signed URL is minted on demand, short-lived, wherever a document
 * needs to be shown (the driver's own onboarding views, the admin review
 * drawer) — never cached, never logged. That also means there is no URL to
 * reverse-engineer a path out of when deleting, so this module has no
 * counterpart to `supabase-storage.ts`'s `storagePathFromPublicUrl`.
 *
 * The bucket is not provisioned by this code — create a **private** bucket
 * named `driver-documents` in the Supabase dashboard (Storage → New bucket,
 * leaving "Public bucket" unchecked) before uploads will work.
 */

import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Storage bucket holding every driver's onboarding documents. */
const DRIVER_DOCUMENT_BUCKET = "driver-documents";

/**
 * How long a read signed URL stays valid. Kept short because it is a bearer
 * token — anyone holding the URL can read the object until it expires,
 * independent of session state. One is re-minted on every request that needs
 * it, so a short TTL costs nothing in practice.
 */
const READ_SIGNED_URL_TTL_SECONDS = 300;

/**
 * The only content types accepted — the design specifies "JPG or PNG". A
 * client-supplied `File.type` is never trusted beyond being checked against
 * this list, and `image/svg+xml` is deliberately excluded: an SVG opened
 * top-level from a signed URL is an XSS vector.
 */
const ALLOWED_CONTENT_TYPES = new Set(["image/jpeg", "image/png"]);

/**
 * The single message shown for anything outside `ALLOWED_CONTENT_TYPES`, so the
 * pre-upload rejection and the post-upload verification below word it the same
 * way to the driver.
 */
export const UNSUPPORTED_CONTENT_TYPE_ERROR =
  "Only JPG and PNG files are accepted.";

/** Characters allowed in the file-name suffix of an object path. */
const UNSAFE_FILE_NAME_CHARS = /[^a-zA-Z0-9._-]+/g;

/** Fallback name for an uploaded file with no usable original name. */
const FALLBACK_FILE_NAME = "document";

/**
 * Lazily-built client, cached across requests. Building it eagerly at module
 * scope would make importing this file fail (and take the whole route down)
 * whenever the Supabase env vars are absent — for example in a checkout that
 * only runs the parts of the app that don't touch Storage.
 */
let cachedClient: SupabaseClient | null = null;

function getStorageClient(): SupabaseClient {
  if (cachedClient) {
    return cachedClient;
  }

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase Storage is not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  cachedClient = createClient(url, serviceRoleKey, {
    // There is no end user behind this client — it acts as the service role on
    // every call, so session persistence and token refresh are dead weight.
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return cachedClient;
}

/**
 * Normalises an uploaded file's name for use inside an object path: Storage
 * keys treat "/" as a folder separator, so an unsanitised name could otherwise
 * escape the driver's own prefix.
 */
function toSafeFileName(fileName: string): string {
  const safe = fileName.trim().replace(UNSAFE_FILE_NAME_CHARS, "-");
  return safe.length > 0 ? safe : FALLBACK_FILE_NAME;
}

/**
 * Whether Storage should hold an object of this content type at all. Exported
 * so a route handler can reject a bad request with a readable 400 *before*
 * touching Storage, and so the post-upload check below consults the same one
 * list rather than a second copy of it that could drift.
 */
export function isSupportedDriverDocumentContentType(
  contentType: string,
): boolean {
  return ALLOWED_CONTENT_TYPES.has(contentType);
}

/**
 * Reads the `Content-Type` Storage actually recorded for an already-uploaded
 * object.
 *
 * This is the enforcement half of `createDriverDocumentUploadUrl`'s advisory
 * check: a signed upload URL cannot pin the content type of what is later PUT
 * to it, so a caller can mint a token claiming `image/png` and upload anything.
 * What matters downstream is not the claim but the type Storage recorded —
 * that is the `Content-Type` a signed read URL will serve the object with, and
 * documents are read by opening such a URL top-level, where an
 * `image/svg+xml` or `text/html` object would execute as script. Callers record
 * a document only once this returns a supported type.
 *
 * Throws when the object's metadata cannot be read at all (it was never
 * uploaded, or Storage is unreachable) so the caller can fail closed rather
 * than record an unverified document.
 */
export async function getDriverDocumentContentType(
  path: string,
): Promise<string | null> {
  const bucket = getStorageClient().storage.from(DRIVER_DOCUMENT_BUCKET);

  const { data, error } = await bucket.info(path);
  if (!error && data) {
    return data.contentType ?? null;
  }

  // `info()` is served by an endpoint older self-hosted Storage releases do not
  // expose. Falling back to a prefix listing keeps verification working there
  // instead of failing every upload closed — `list` reports the same recorded
  // mimetype, just less directly.
  const separatorIndex = path.lastIndexOf("/");
  const prefix = separatorIndex === -1 ? "" : path.slice(0, separatorIndex);
  const objectName = path.slice(separatorIndex + 1);

  const { data: listed, error: listError } = await bucket.list(prefix, {
    search: objectName,
  });

  // `search` is a substring match, so the exact name still has to be picked out
  // of the results.
  const match = listed?.find((entry) => entry.name === objectName);
  if (!match) {
    throw new Error(
      `Failed to read document metadata for ${path}: ${
        listError?.message ?? error?.message ?? "the object does not exist."
      }`,
    );
  }

  return match.metadata?.mimetype ?? null;
}

/**
 * Issues a signed upload URL + token for one document. The browser uploads
 * directly to Supabase with these (via `uploadFileToSignedUrl` in
 * `src/lib/supabase-browser-client.ts`) — the file itself never passes through
 * a Next.js route handler, whose request-body limit is below the design's
 * 10MB-per-document cap.
 *
 * Objects are namespaced by `driverProfileId` so a driver's documents stay
 * grouped together, and prefixed with a UUID so two uploads of the same file
 * name never collide.
 */
export async function createDriverDocumentUploadUrl(
  driverProfileId: string,
  fileName: string,
  contentType: string,
): Promise<{ path: string; signedUrl: string; token: string }> {
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw new Error(
      `Unsupported file type: ${contentType}. Only JPG and PNG are accepted.`,
    );
  }

  const client = getStorageClient();
  const path = `${driverProfileId}/${crypto.randomUUID()}-${toSafeFileName(fileName)}`;

  const { data, error } = await client.storage
    .from(DRIVER_DOCUMENT_BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data) {
    throw new Error(
      `Failed to create an upload URL: ${error?.message ?? "Storage returned no data."}`,
    );
  }

  return { path, signedUrl: data.signedUrl, token: data.token };
}

/** One short-lived signed URL for reading a single document. */
export async function getDriverDocumentSignedUrl(
  path: string,
): Promise<string> {
  const client = getStorageClient();
  const { data, error } = await client.storage
    .from(DRIVER_DOCUMENT_BUCKET)
    .createSignedUrl(path, READ_SIGNED_URL_TTL_SECONDS);

  if (error || !data) {
    throw new Error(
      `Failed to create a signed URL: ${error?.message ?? "Storage returned no data."}`,
    );
  }

  return data.signedUrl;
}

/**
 * Batch form of the above — used wherever several documents are shown at once
 * (the review step, the status screen, the admin drawer) to avoid one round
 * trip per thumbnail. Returns a `path -> signedUrl` map; a path that fails to
 * sign is simply omitted rather than failing the whole batch, since one bad
 * thumbnail shouldn't take the rest of the page down.
 */
export async function getDriverDocumentSignedUrls(
  paths: string[],
): Promise<Record<string, string>> {
  if (paths.length === 0) {
    return {};
  }

  const client = getStorageClient();
  const { data, error } = await client.storage
    .from(DRIVER_DOCUMENT_BUCKET)
    .createSignedUrls(paths, READ_SIGNED_URL_TTL_SECONDS);

  if (error || !data) {
    throw new Error(
      `Failed to create signed URLs: ${error?.message ?? "Storage returned no data."}`,
    );
  }

  const result: Record<string, string> = {};
  for (const entry of data) {
    // Supabase types every field of a batch entry as nullable, since a single
    // path can fail while its siblings succeed. Requiring all three (no error,
    // a path to key the map by, a URL to store) keeps a partial failure out of
    // the map entirely rather than adding an unusable entry under an empty key.
    if (!entry.error && entry.path && entry.signedUrl) {
      result[entry.path] = entry.signedUrl;
    }
  }

  return result;
}

/**
 * Deletes the objects at the given paths. Throws on a Storage error so callers
 * can log it; the database row is the source of truth, so an orphaned object is
 * a tidiness problem rather than a correctness one — the same reasoning already
 * documented in `supabase-storage.ts`. Used when a document is superseded by a
 * retake (the old object is removed best-effort after the new
 * `DriverApplicationDocument` row is created).
 */
export async function deleteDriverDocuments(paths: string[]): Promise<void> {
  if (paths.length === 0) {
    return;
  }

  const { error } = await getStorageClient()
    .storage.from(DRIVER_DOCUMENT_BUCKET)
    .remove(paths);

  if (error) {
    throw new Error(`Failed to delete documents: ${error.message}`);
  }
}
