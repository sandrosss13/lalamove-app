/**
 * Browser-safe Supabase client, used only to perform the actual file upload
 * once a route handler has already issued a signed upload URL (see
 * `src/lib/driver-document-storage.ts` for driver onboarding documents and
 * `src/lib/site-media-storage.ts` for the marketing site's images).
 *
 * This is the only place in the codebase that talks to Supabase from the
 * browser. It uses the anon (public) key — never the service role key, which
 * bypasses row level security and must never reach the browser, so neither
 * `SUPABASE_SERVICE_ROLE_KEY` nor the server-only `SUPABASE_URL` may be read
 * from this file or anything else reachable from client code.
 */
"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Bucket names are restated here as literals rather than imported from the
 * storage modules that own them (`src/lib/driver-document-storage.ts` and
 * `src/lib/site-media-storage.ts`): both are `server-only`, so importing either
 * from this `"use client"` module would fail the build.
 */

/** Storage bucket holding every driver's onboarding documents. */
const DRIVER_DOCUMENT_BUCKET = "driver-documents";

/** Storage bucket holding every image the marketing site renders. */
export const SITE_MEDIA_BUCKET = "site-media";

/**
 * Lazily-built client, cached for the lifetime of the page. Building it at
 * module scope would throw during hydration of any page that merely imports a
 * component from this module's tree, even one that never uploads anything.
 */
let cachedClient: SupabaseClient | null = null;

function getBrowserClient(): SupabaseClient {
  if (cachedClient) {
    return cachedClient;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Supabase browser client is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  cachedClient = createClient(url, anonKey);

  return cachedClient;
}

/**
 * Uploads `file` directly to Supabase Storage using a signed upload URL's
 * `path`/`token` (from `POST /api/driver-profile/onboarding/documents/upload-url`
 * or `POST /api/admin/content/media/upload-url`). The file never passes through
 * a Next.js route handler, whose request-body limit is below the design's
 * 10MB-per-document cap and far below a 2400×900 hero banner.
 *
 * `options` is optional and both of its defaults reproduce the original
 * behaviour exactly, so the driver-onboarding call site needs no change: pass
 * `bucket` to target a bucket other than `driver-documents`, and `cacheControl`
 * to override Storage's own one-hour default (public site media is immutable and
 * asks for a year).
 */
export async function uploadFileToSignedUrl(
  path: string,
  token: string,
  file: File,
  options?: { bucket?: string; cacheControl?: string },
): Promise<void> {
  // Built conditionally rather than passed as `{ cacheControl: undefined }`:
  // supabase-js spreads `fileOptions` *over* its own defaults, so an explicit
  // `undefined` would replace its "3600" and send the literal string
  // "undefined" as the object's cache lifetime — a behaviour change for callers
  // that pass no options at all.
  const fileOptions =
    options?.cacheControl === undefined
      ? undefined
      : { cacheControl: options.cacheControl };

  const { error } = await getBrowserClient()
    .storage.from(options?.bucket ?? DRIVER_DOCUMENT_BUCKET)
    .uploadToSignedUrl(path, token, file, fileOptions);

  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }
}
