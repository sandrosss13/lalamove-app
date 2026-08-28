/**
 * Browser-safe Supabase client, used only to perform the actual file upload
 * once a route handler has already issued a signed upload URL (see
 * `src/lib/driver-document-storage.ts`).
 *
 * This is the only place in the codebase that talks to Supabase from the
 * browser. It uses the anon (public) key — never the service role key, which
 * bypasses row level security and must never reach the browser, so neither
 * `SUPABASE_SERVICE_ROLE_KEY` nor the server-only `SUPABASE_URL` may be read
 * from this file or anything else reachable from client code.
 */
"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Storage bucket holding every driver's onboarding documents. */
const DRIVER_DOCUMENT_BUCKET = "driver-documents";

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
 * `path`/`token` (from `POST /api/driver-profile/onboarding/documents/upload-url`,
 * built in task-06). The file never passes through a Next.js route handler,
 * whose request-body limit is below the design's 10MB-per-document cap.
 */
export async function uploadFileToSignedUrl(
  path: string,
  token: string,
  file: File,
): Promise<void> {
  const { error } = await getBrowserClient()
    .storage.from(DRIVER_DOCUMENT_BUCKET)
    .uploadToSignedUrl(path, token, file);

  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }
}
