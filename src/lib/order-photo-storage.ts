/**
 * Supabase Storage access for cargo photos — the up-to-three images a client
 * attaches to an order at booking. Server-only: it authenticates with the
 * service role key, which bypasses row level security and must never reach the
 * browser — import this from route handlers and server components only.
 *
 * Mirrors `src/lib/driver-document-storage.ts`, and deliberately shares its
 * **private** `driver-documents` bucket rather than adding a bucket of its own:
 * that bucket already exists in every environment, so the feature needs no
 * manual Storage setup to ship. The two never collide — every object here sits
 * under `order-photos/<orderId>/` (see `orderPhotoStoragePath`), and driver
 * documents sit under a driver profile's cuid.
 *
 * As with driver documents, nothing is persisted as a URL. `OrderPhoto` stores
 * the object *path*; a signed read URL is minted on demand, short-lived,
 * wherever a photo is shown — never cached, never logged.
 *
 * Unlike driver documents, the bytes pass through the route handler rather than
 * going straight to Storage on a signed upload URL. That is what lets the route
 * sniff the real type from the file before anything is stored, and the 4 MiB
 * cap (`ORDER_PHOTO_MAX_BYTES`) keeps the body under Vercel's request limit.
 */

import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { OrderPhotoContentType } from "@/lib/order-photos/rules";

/** The private bucket shared with driver onboarding documents. */
const ORDER_PHOTO_BUCKET = "driver-documents";

/**
 * How long a read signed URL stays valid. Short because it is a bearer token —
 * anyone holding the URL can read the object until it expires, independent of
 * session state. Every page render re-mints it, so a short TTL costs nothing.
 */
const READ_SIGNED_URL_TTL_SECONDS = 300;

/**
 * Photos never change once written (a "replace" is a delete plus a new path),
 * so the object can be cached for as long as a signed URL is valid and then
 * some. Supabase takes this as a string of seconds.
 */
const PHOTO_CACHE_CONTROL_SECONDS = "3600";

/**
 * Lazily-built client, cached across requests. Built on first use rather than
 * at module scope so importing this file never fails — and never takes a page
 * down — in an environment without the Supabase variables.
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
 * Writes one already-validated photo at `path`.
 *
 * `contentType` must be the *sniffed* type from `validateOrderPhoto`, never the
 * browser's label: it is the `Content-Type` a signed URL will later serve the
 * object with. `upsert: false` because the path is unique by construction — an
 * object already there would mean something is badly wrong, so fail loudly
 * rather than overwrite somebody's photo.
 */
export async function uploadOrderPhoto(
  path: string,
  bytes: Uint8Array,
  contentType: OrderPhotoContentType,
): Promise<void> {
  const { error } = await getStorageClient()
    .storage.from(ORDER_PHOTO_BUCKET)
    .upload(path, bytes, {
      contentType,
      cacheControl: PHOTO_CACHE_CONTROL_SECONDS,
      upsert: false,
    });

  if (error) {
    throw new Error(`Failed to upload cargo photo: ${error.message}`);
  }
}

/** One short-lived signed URL for reading a single photo. */
export async function getOrderPhotoSignedUrl(path: string): Promise<string> {
  const { data, error } = await getStorageClient()
    .storage.from(ORDER_PHOTO_BUCKET)
    .createSignedUrl(path, READ_SIGNED_URL_TTL_SECONDS);

  if (error || !data) {
    throw new Error(
      `Failed to create a signed URL: ${error?.message ?? "Storage returned no data."}`,
    );
  }

  return data.signedUrl;
}

/**
 * Batch form of the above, for pages showing an order's photos together — one
 * round trip rather than one per thumbnail. Returns a `path -> signedUrl` map;
 * a path that fails to sign is omitted rather than failing the batch, so one
 * bad photo cannot take the rest of the page down.
 */
export async function getOrderPhotoSignedUrls(
  paths: string[],
): Promise<Record<string, string>> {
  if (paths.length === 0) {
    return {};
  }

  const { data, error } = await getStorageClient()
    .storage.from(ORDER_PHOTO_BUCKET)
    .createSignedUrls(paths, READ_SIGNED_URL_TTL_SECONDS);

  if (error || !data) {
    throw new Error(
      `Failed to create signed URLs: ${error?.message ?? "Storage returned no data."}`,
    );
  }

  const result: Record<string, string> = {};
  for (const entry of data) {
    // Every field of a batch entry is typed nullable, since one path can fail
    // while its siblings succeed; requiring all three keeps a partial failure
    // out of the map rather than adding an unusable entry.
    if (!entry.error && entry.path && entry.signedUrl) {
      result[entry.path] = entry.signedUrl;
    }
  }

  return result;
}

/**
 * Deletes the objects at the given paths. Throws on a Storage error so callers
 * can log it; the `OrderPhoto` row is the source of truth, so an orphaned
 * object is a tidiness problem rather than a correctness one.
 */
export async function deleteOrderPhotos(paths: string[]): Promise<void> {
  if (paths.length === 0) {
    return;
  }

  const { error } = await getStorageClient()
    .storage.from(ORDER_PHOTO_BUCKET)
    .remove(paths);

  if (error) {
    throw new Error(`Failed to delete cargo photos: ${error.message}`);
  }
}
