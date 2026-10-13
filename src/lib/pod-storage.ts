/**
 * Supabase Storage access for proof of delivery — the photos and the recipient
 * signature a driver registers before closing a job. Server-only: it
 * authenticates with the service role key, which bypasses row level security
 * and must never reach a browser or the app.
 *
 * The sibling of `driver-document-storage.ts`, and built the same way: the
 * bucket is **private**, the database stores object *paths*, and a short-lived
 * signed URL is minted wherever an image is shown. A separate bucket rather
 * than a prefix inside `driver-documents` because the two hold different
 * people's data for different readers — identity documents an admin reviews,
 * versus delivery evidence a carrier (and, later, a client or a dispute
 * handler) is shown — and a bucket is the unit Storage policies and retention
 * are set on.
 *
 * The bucket is not provisioned by this code — create a **private** bucket
 * named `delivery-proofs` in the Supabase dashboard (Storage → New bucket,
 * leaving "Public bucket" unchecked) before uploads will work, and give it the
 * file-size limit and allowed MIME types in `REQUIRED_BUCKET_LIMITS`
 * (`src/lib/uploads/rules.ts`): they are the only check an upload that is
 * never registered ever gets.
 */

import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Storage bucket holding every delivery's proof. */
const POD_BUCKET = "delivery-proofs";

/**
 * How long a read signed URL stays valid. Short because it is a bearer token:
 * anyone holding the URL can read the image until it expires, independent of
 * session state. One is re-minted on every request that needs it.
 */
const READ_SIGNED_URL_TTL_SECONDS = 300;

/** Lazily built for the reason given in `driver-document-storage.ts`. */
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
    // No end user behind this client — it acts as the service role every time.
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return cachedClient;
}

/** What Storage recorded about an uploaded object. */
export type PodObjectInfo = {
  /** Null when Storage recorded no type at all. */
  contentType: string | null;
  /** Null when Storage reported no size — treated by callers as unverifiable. */
  sizeBytes: number | null;
};

/**
 * Reads the content type and size Storage **recorded** for an uploaded object.
 *
 * Both are the enforcement half of checks that were only advisory when the
 * upload URL was issued: a signed upload URL can pin neither the type nor the
 * size of what is later PUT to it. The recorded type is what a signed read URL
 * serves the object as; the recorded size is what the bucket is actually
 * holding.
 *
 * Throws when the metadata cannot be read at all (the upload never landed, or
 * Storage is unreachable) so the caller fails closed.
 */
export async function getPodObjectInfo(path: string): Promise<PodObjectInfo> {
  const bucket = getStorageClient().storage.from(POD_BUCKET);

  const { data, error } = await bucket.info(path);
  if (!error && data) {
    return {
      contentType: data.contentType ?? null,
      sizeBytes: typeof data.size === "number" ? data.size : null,
    };
  }

  // `info()` is served by an endpoint older self-hosted Storage releases do not
  // expose; a prefix listing reports the same recorded metadata less directly.
  const separatorIndex = path.lastIndexOf("/");
  const prefix = separatorIndex === -1 ? "" : path.slice(0, separatorIndex);
  const objectName = path.slice(separatorIndex + 1);

  const { data: listed, error: listError } = await bucket.list(prefix, {
    search: objectName,
  });

  // `search` is a substring match, so the exact name still has to be picked out.
  const match = listed?.find((entry) => entry.name === objectName);
  if (!match) {
    throw new Error(
      `Failed to read proof-of-delivery metadata for ${path}: ${
        listError?.message ?? error?.message ?? "the object does not exist."
      }`,
    );
  }

  const metadata = match.metadata as
    { mimetype?: unknown; size?: unknown } | null | undefined;

  return {
    contentType:
      typeof metadata?.mimetype === "string" ? metadata.mimetype : null,
    sizeBytes: typeof metadata?.size === "number" ? metadata.size : null,
  };
}

/**
 * Issues a signed upload URL + token for the object at `path`. The client
 * uploads the bytes straight to Storage — they never pass through a route
 * handler.
 *
 * `path` is minted by the caller (`podObjectPath`) rather than here, because
 * the upload-URL route has to record it as a `PendingUpload` — the row that
 * bounds how many URLs can be outstanding for one order — *before* a URL
 * exists for it. This function signs and does nothing else; the type and size
 * of what is later PUT are checked at registration and, for an upload that is
 * never registered, only by the bucket's own limits
 * (`REQUIRED_BUCKET_LIMITS` in `src/lib/uploads/rules.ts`).
 */
export async function createPodUploadUrl(
  path: string,
): Promise<{ path: string; signedUrl: string; token: string }> {
  const { data, error } = await getStorageClient()
    .storage.from(POD_BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data) {
    throw new Error(
      `Failed to create an upload URL: ${error?.message ?? "Storage returned no data."}`,
    );
  }

  return { path, signedUrl: data.signedUrl, token: data.token };
}

/**
 * Short-lived read URLs for several proof images at once, as a
 * `path -> signedUrl` map. A path that fails to sign is omitted rather than
 * failing the batch — one broken thumbnail must not take a job sheet down.
 *
 * Throws only when the whole call fails; callers that render a page catch that
 * and show the proof as present-but-unavailable.
 */
export async function getPodSignedUrls(
  paths: string[],
): Promise<Record<string, string>> {
  if (paths.length === 0) {
    return {};
  }

  const { data, error } = await getStorageClient()
    .storage.from(POD_BUCKET)
    .createSignedUrls(paths, READ_SIGNED_URL_TTL_SECONDS);

  if (error || !data) {
    throw new Error(
      `Failed to create signed URLs: ${error?.message ?? "Storage returned no data."}`,
    );
  }

  const result: Record<string, string> = {};
  for (const entry of data) {
    if (!entry.error && entry.path && entry.signedUrl) {
      result[entry.path] = entry.signedUrl;
    }
  }

  return result;
}

/**
 * Deletes the objects at the given paths. Throws on a Storage error so callers
 * can log it; the database row is the source of truth, so an orphaned object is
 * a tidiness problem rather than a correctness one.
 */
export async function deletePodObjects(paths: string[]): Promise<void> {
  if (paths.length === 0) {
    return;
  }

  const { error } = await getStorageClient()
    .storage.from(POD_BUCKET)
    .remove(paths);

  if (error) {
    throw new Error(`Failed to delete proof of delivery: ${error.message}`);
  }
}

/** Best-effort form of the above, for cleanup after the row has changed. */
export async function discardPodObjects(paths: string[]): Promise<void> {
  await deletePodObjects(paths).catch((error: unknown) => {
    console.error("Failed to delete proof-of-delivery objects:", error);
  });
}
