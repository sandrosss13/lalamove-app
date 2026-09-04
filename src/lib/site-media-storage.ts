/**
 * Supabase Storage access for the images the marketing site renders — hero
 * banners, partner logos and vehicle photos.
 *
 * Server-only: it authenticates with the service role key, which bypasses row
 * level security and must never reach the browser. Import this from route
 * handlers and server components only.
 *
 * The bucket is not provisioned by this code — create a **public** bucket named
 * `site-media` in the Supabase dashboard (Storage → New bucket, ticking "Public
 * bucket") before uploads will work. "Public" is what makes `getPublicUrl`
 * resolvable without a signed request, which is what the public homepage needs:
 * these images are shown to signed-out visitors, so a short-lived signed read
 * URL would be re-minted on every render for no benefit. A bucket created
 * private uploads happily and then renders every image broken, so that tick box
 * is the first thing to check when an uploaded banner does not appear.
 *
 * **Why there is no post-upload content-type verification here.** A signed
 * upload URL cannot pin the content type of what is later PUT to it, so the
 * `ALLOWED_CONTENT_TYPES` check below is advisory at the mint step:
 * `createSiteMediaUploadUrl` can be handed `image/png` and the bytes that
 * follow can be anything. `src/lib/driver-document-storage.ts` closes that hole
 * with `getDriverDocumentContentType()` and a check before it will record a
 * row, because a driver document is *opened top-level* from a signed URL, where
 * an `image/svg+xml` or `text/html` object executes as script. Nothing in this
 * bucket is ever linked to directly: every URL it produces is rendered inside an
 * `<img>`, by both the admin preview and the public page, and an `<img>`
 * executes no script for any content type. The mitigation here is therefore the
 * render site rather than a second Storage round trip.
 */

import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Storage bucket holding every image the marketing site renders. */
const SITE_MEDIA_BUCKET = "site-media";

/**
 * The prefixes an object may be filed under. Storage has no folders, only key
 * prefixes, so a prefix per purpose is the only organisation this bucket gets —
 * and it is what lets a human browsing the dashboard tell a hero banner from a
 * partner logo.
 *
 * A closed union rather than a free-form string, unlike `Banner.placement`:
 * adding a placement is deliberately a content change, but nothing can render a
 * new *kind* of image without a code change anyway, so there is no value in
 * leaving the prefix open to typos.
 */
export const SITE_MEDIA_PURPOSES = [
  "banners",
  "partner-logos",
  "vehicles",
] as const;

/** One of the prefixes above. */
export type SiteMediaPurpose = (typeof SITE_MEDIA_PURPOSES)[number];

/**
 * Marker that separates the bucket prefix from the object path inside a public
 * URL (`<project>/storage/v1/object/public/<bucket>/<path>`). Used to recover
 * the object path when deleting, since only the URL is persisted.
 */
const PUBLIC_URL_MARKER = `/storage/v1/object/public/${SITE_MEDIA_BUCKET}/`;

/**
 * The only content types accepted. WebP is included here and absent from
 * `driver-document-storage.ts` because these are marketing images a designer
 * exports rather than phone-camera captures from a driver, and the size saving
 * on a 2400×900 hero is worth having.
 *
 * `image/svg+xml` is deliberately excluded, including for **partner logos** —
 * the one asset here that would plausibly arrive as an SVG. An SVG is a
 * document, not an image: it can carry `<script>`, `<foreignObject>` and inline
 * event handlers. This bucket is **public**, so every object in it has a stable
 * URL any visitor can open top-level, where the browser executes that script on
 * the Supabase project's own origin. Storage serves back the `Content-Type` it
 * recorded, so there is no place downstream to neutralise it. Sanitising
 * uploaded SVG properly is a whole dependency and a whole class of bypasses, and
 * all it buys is sharper logos at large sizes — which a 2× or 3× PNG already
 * delivers at the 360×96 the design calls for. Content managers must therefore
 * supply partner logos as **transparent PNG**; the uploader's helper text says
 * so, so it is not discovered as a mystery rejection.
 */
const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

/**
 * The single message shown for anything outside `ALLOWED_CONTENT_TYPES`, so the
 * route's 400 and the uploader's own pre-flight rejection word it identically
 * to the content manager.
 */
export const UNSUPPORTED_CONTENT_TYPE_ERROR =
  "Only JPG, PNG and WebP images are accepted.";

/**
 * Cache lifetime for an uploaded object. Exported because the *browser* is what
 * sets it: the bytes go straight to Storage through a signed upload URL, so the
 * value has to travel with them (see `uploadFileToSignedUrl`). Object paths
 * embed a UUID and are never rewritten, so a stored image is immutable and can
 * be cached indefinitely.
 */
export const SITE_MEDIA_CACHE_CONTROL_SECONDS = "31536000";

/** Characters allowed in the file-name suffix of an object path. */
const UNSAFE_FILE_NAME_CHARS = /[^a-zA-Z0-9._-]+/g;

/** Fallback name for an uploaded file with no usable original name. */
const FALLBACK_FILE_NAME = "image";

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
 * escape its purpose's prefix.
 */
function toSafeFileName(fileName: string): string {
  const safe = fileName.trim().replace(UNSAFE_FILE_NAME_CHARS, "-");
  return safe.length > 0 ? safe : FALLBACK_FILE_NAME;
}

/**
 * Whether Storage should hold an object of this content type at all. Exported
 * so a route handler can reject a bad request with a readable 400 *before*
 * touching Storage, consulting the same one list rather than a second copy of
 * it that could drift.
 */
export function isSupportedSiteMediaContentType(contentType: string): boolean {
  return ALLOWED_CONTENT_TYPES.has(contentType);
}

/**
 * Issues a signed upload URL + token for one image, plus the public URL the
 * object will answer on once the bytes land.
 *
 * The browser uploads directly to Supabase with the returned `path`/`token`
 * (via `uploadFileToSignedUrl` in `src/lib/supabase-browser-client.ts`) — the
 * file itself never passes through a Next.js route handler, whose request-body
 * limit is far below a 2400×900 hero banner.
 *
 * Objects are namespaced by `purpose` so the bucket stays browsable in the
 * dashboard, and prefixed with a UUID so two uploads of the same file name never
 * collide. `publicUrl` is resolvable the moment the object lands and depends
 * only on the path, so it is computed here and handed back with the token: the
 * caller never has to construct it, and never has to guess the project's Storage
 * URL shape.
 */
export async function createSiteMediaUploadUrl(
  purpose: SiteMediaPurpose,
  fileName: string,
  contentType: string,
): Promise<{
  path: string;
  signedUrl: string;
  token: string;
  publicUrl: string;
}> {
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw new Error(
      `Unsupported file type: ${contentType}. ${UNSUPPORTED_CONTENT_TYPE_ERROR}`,
    );
  }

  const client = getStorageClient();
  const path = `${purpose}/${crypto.randomUUID()}-${toSafeFileName(fileName)}`;

  const { data, error } = await client.storage
    .from(SITE_MEDIA_BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data) {
    throw new Error(
      `Failed to create an upload URL: ${error?.message ?? "Storage returned no data."}`,
    );
  }

  const { data: publicUrlData } = client.storage
    .from(SITE_MEDIA_BUCKET)
    .getPublicUrl(path);

  return {
    path,
    signedUrl: data.signedUrl,
    token: data.token,
    publicUrl: publicUrlData.publicUrl,
  };
}

/**
 * Recovers the object path from a public URL produced by
 * `createSiteMediaUploadUrl`. Returns `null` for anything that isn't a URL into
 * this bucket — image URLs are stored as plain strings, and the uploader's
 * "paste a URL instead" escape hatch means a perfectly valid value can point at
 * another host entirely.
 */
function storagePathFromPublicUrl(publicUrl: string): string | null {
  const markerIndex = publicUrl.indexOf(PUBLIC_URL_MARKER);
  if (markerIndex === -1) {
    return null;
  }

  const path = publicUrl.slice(markerIndex + PUBLIC_URL_MARKER.length);
  return path.length > 0 ? decodeURIComponent(path) : null;
}

/**
 * Deletes the objects behind the given public URLs, silently ignoring any URL
 * that is not in this bucket. Throws on a Storage error so callers can log it;
 * the database row is the source of truth, so an orphaned object is a tidiness
 * problem rather than a correctness one — the same reasoning already documented
 * in `supabase-storage.ts`.
 *
 * Provided for the admin forms to call when a row that owned an image is
 * deleted. It has no caller until those forms exist.
 */
export async function deleteSiteMedia(publicUrls: string[]): Promise<void> {
  const paths = publicUrls
    .map(storagePathFromPublicUrl)
    .filter((path): path is string => path !== null);

  if (paths.length === 0) {
    return;
  }

  const { error } = await getStorageClient()
    .storage.from(SITE_MEDIA_BUCKET)
    .remove(paths);

  if (error) {
    throw new Error(`Failed to delete site media: ${error.message}`);
  }
}
