/**
 * Supabase Storage access for vehicle documents — the registration and
 * insurance files a driver uploads for a vehicle they own. Server-only: it
 * authenticates with the service role key.
 *
 * These live in the **same private bucket as the onboarding documents**
 * (`driver-documents`), under a `vehicles/` prefix, rather than in a bucket of
 * their own: they are the same kind of data (a driver's compliance paperwork)
 * for the same reader (the reviewing admin), so one bucket's policies and
 * retention fit both — and a bucket is a manual provisioning step this feature
 * then does not add. Reading and deleting therefore go through
 * `driver-document-storage.ts`, which is path-agnostic; what is here is the
 * half that module does not have: path minting for a vehicle, and a metadata
 * read that reports the **size** as well as the type.
 */

import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  deleteDriverDocuments,
  getDriverDocumentSignedUrls,
} from "@/lib/driver-document-storage";
/** The bucket `driver-document-storage.ts` owns. */
const DRIVER_DOCUMENT_BUCKET = "driver-documents";

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
export type VehicleDocumentObjectInfo = {
  /** Null when Storage recorded no type at all. */
  contentType: string | null;
  /** Null when Storage reported no size — treated by callers as unverifiable. */
  sizeBytes: number | null;
};

/**
 * Reads the content type and size Storage **recorded** for an uploaded object
 * — the enforcement half of checks that were advisory when the upload URL was
 * issued, exactly as `getPodObjectInfo` is for proof of delivery.
 *
 * Throws when the metadata cannot be read at all (the upload never landed, or
 * Storage is unreachable) so the caller fails closed.
 */
export async function getVehicleDocumentObjectInfo(
  path: string,
): Promise<VehicleDocumentObjectInfo> {
  const bucket = getStorageClient().storage.from(DRIVER_DOCUMENT_BUCKET);

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
      `Failed to read vehicle-document metadata for ${path}: ${
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
 * Issues a signed upload URL + token for the object at `path`. The app uploads
 * the bytes straight to Storage — they never pass through a route handler.
 *
 * `path` is minted by the caller (`vehicleDocumentObjectPath`), which records
 * it as a `PendingUpload` before a URL exists for it — see `createPodUploadUrl`
 * for why the two steps are split.
 */
export async function createVehicleDocumentUploadUrl(
  path: string,
): Promise<{ path: string; signedUrl: string; token: string }> {
  const { data, error } = await getStorageClient()
    .storage.from(DRIVER_DOCUMENT_BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data) {
    throw new Error(
      `Failed to create an upload URL: ${error?.message ?? "Storage returned no data."}`,
    );
  }

  return { path, signedUrl: data.signedUrl, token: data.token };
}

/**
 * Short-lived read URLs for several documents, as a `path -> signedUrl` map.
 * Never throws: a reviewer's panel with an unavailable image is still a panel,
 * so a Storage failure is logged and answered as "no URLs".
 */
export async function getVehicleDocumentSignedUrls(
  paths: string[],
): Promise<Record<string, string>> {
  try {
    return await getDriverDocumentSignedUrls(paths);
  } catch (error) {
    console.error("Failed to sign vehicle-document URLs:", error);
    return {};
  }
}

/**
 * Best-effort delete, for objects no live row points at any more. **Never
 * throws.** A failure is logged *with the paths*: by the time this runs the
 * rows that named these objects have usually been changed or deleted, so the
 * log line is the only remaining record of what was left behind. `context`
 * says whose they were (e.g. `"removed vehicle <id>"`).
 */
export async function discardVehicleDocumentObjects(
  paths: string[],
  context?: string,
): Promise<void> {
  if (paths.length === 0) {
    return;
  }

  await deleteDriverDocuments(paths).catch((error: unknown) => {
    console.error(
      `Failed to delete vehicle-document objects${
        context === undefined ? "" : ` of ${context}`
      }; orphaned objects:`,
      paths,
      error,
    );
  });
}
