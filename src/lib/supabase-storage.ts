/**
 * Supabase Storage access for vehicle photos.
 *
 * Server-only: it authenticates with the service role key, which bypasses row
 * level security and must never reach the browser. Import this from route
 * handlers and server components only.
 *
 * The bucket is not provisioned by this code — create a **public** bucket named
 * `vehicle-photos` in the Supabase dashboard (Storage → New bucket) before
 * uploads will work. "Public" is what makes `getPublicUrl` resolvable without a
 * signed request, which is all the photos need: they are shown to the driver
 * who owns them and, later, to clients browsing available vehicles.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Storage bucket holding every driver's vehicle photos. */
const VEHICLE_PHOTO_BUCKET = "vehicle-photos";

/**
 * Marker that separates the bucket prefix from the object path inside a public
 * URL (`<project>/storage/v1/object/public/<bucket>/<path>`). Used to recover
 * the object path when deleting, since only the URL is persisted.
 */
const PUBLIC_URL_MARKER = `/storage/v1/object/public/${VEHICLE_PHOTO_BUCKET}/`;

/**
 * Cache lifetime sent with each upload. Object paths embed a UUID and are never
 * rewritten, so a stored photo is immutable and can be cached indefinitely.
 */
const PHOTO_CACHE_CONTROL_SECONDS = "31536000";

/** Characters allowed in the file-name suffix of an object path. */
const UNSAFE_FILE_NAME_CHARS = /[^a-zA-Z0-9._-]+/g;

/** Fallback name for an uploaded file with no usable original name. */
const FALLBACK_FILE_NAME = "photo";

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
 * Uploads one vehicle photo and returns its public URL.
 *
 * Objects are namespaced by `driverProfileId` so a driver's photos stay grouped
 * together, and prefixed with a UUID so two uploads of the same file name never
 * collide. Throws when Storage rejects the write; callers decide how to surface
 * that.
 */
export async function uploadVehiclePhoto(
  driverProfileId: string,
  file: File,
): Promise<string> {
  const client = getStorageClient();
  const path = `${driverProfileId}/${crypto.randomUUID()}-${toSafeFileName(file.name)}`;

  const { error } = await client.storage
    .from(VEHICLE_PHOTO_BUCKET)
    .upload(path, file, {
      cacheControl: PHOTO_CACHE_CONTROL_SECONDS,
      // The path is unique by construction, so an existing object at it would
      // mean something is badly wrong — fail loudly rather than overwrite.
      upsert: false,
      contentType: file.type || undefined,
    });

  if (error) {
    throw new Error(`Failed to upload vehicle photo: ${error.message}`);
  }

  const { data } = client.storage.from(VEHICLE_PHOTO_BUCKET).getPublicUrl(path);

  return data.publicUrl;
}

/**
 * Recovers the object path from a public URL produced by `uploadVehiclePhoto`.
 * Returns `null` for anything that isn't a URL into this bucket — photo URLs
 * are stored as plain strings, so a stale or hand-edited value is possible.
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
 * Deletes the objects behind the given public URLs. Throws on a Storage error
 * so callers can log it; the database row is the source of truth, so orphaned
 * objects are a tidiness problem rather than a correctness one.
 */
export async function deleteVehiclePhotos(publicUrls: string[]): Promise<void> {
  const paths = publicUrls
    .map(storagePathFromPublicUrl)
    .filter((path): path is string => path !== null);

  if (paths.length === 0) {
    return;
  }

  const { error } = await getStorageClient()
    .storage.from(VEHICLE_PHOTO_BUCKET)
    .remove(paths);

  if (error) {
    throw new Error(`Failed to delete vehicle photos: ${error.message}`);
  }
}
