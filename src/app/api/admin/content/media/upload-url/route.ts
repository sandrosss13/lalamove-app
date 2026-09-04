import { NextResponse } from "next/server";

import type { AdminRole } from "@prisma/client";

import { authorizeAdminApi } from "@/lib/admin/api-auth";
import { writeAuditLog } from "@/lib/admin/audit";
import { createSiteMediaUploadUrl } from "@/lib/site-media-storage";
import {
  parseMediaUploadUrlBody,
  type MediaUploadUrlResponse,
} from "./validation";

/**
 * Staff who may upload site media. Stated per route rather than imported from
 * one shared constant so the gate on each endpoint can be read — and audited —
 * without following an import.
 */
const ALLOWED_ROLES: readonly AdminRole[] = ["SUPER_ADMIN", "CONTENT_MANAGER"];

/**
 * POST /api/admin/content/media/upload-url — issue a signed upload URL for one
 * image destined for the public site.
 *
 * The browser uploads the bytes straight to Supabase Storage with the returned
 * `path`/`token` (via `uploadFileToSignedUrl`), then stores `publicUrl` on
 * whichever row it is editing. The file itself never passes through a route
 * handler, whose request-body limit is far below a 2400×900 hero banner.
 *
 * `signedUrl` is deliberately absent from the response: `uploadToSignedUrl`
 * needs only the path and the token, so returning it would be returning a value
 * nothing reads.
 *
 * Issuing a URL neither creates nor reserves a database row. An upload that is
 * started and abandoned — or an image replaced in a form that is then cancelled
 * — leaves an object nothing points at. The row is the source of truth, so an
 * orphan is a tidiness problem rather than a correctness one; `deleteSiteMedia`
 * exists for the forms to clean up after a row that owned an image is deleted.
 *
 * For the same reason the `media.upload_url_issued` audit row records *intent*,
 * not an outcome: the bytes may never arrive, and Storage will never tell this
 * route whether they did. The audit trail is not a list of images that exist.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const authorized = await authorizeAdminApi(ALLOWED_ROLES);
  if (!authorized.ok) {
    return authorized.response;
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = parseMediaUploadUrlBody(rawBody);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { purpose, fileName, contentType } = parsed.data;

  let path: string;
  let token: string;
  let publicUrl: string;

  try {
    ({ path, token, publicUrl } = await createSiteMediaUploadUrl(
      purpose,
      fileName,
      contentType,
    ));
  } catch (error) {
    // A missing `site-media` bucket (a manual provisioning step, so the
    // expected first-run failure), absent Supabase env vars, or a Storage
    // outage — none is the caller's fault, and none should surface as an
    // unhandled crash, which Next.js renders as a 500 with no `{error}` body
    // for the form to show inline.
    console.error("Failed to create a site media upload URL:", error);
    return NextResponse.json(
      { error: "Could not prepare the upload. Please try again." },
      { status: 502 },
    );
  }

  // After the mint, so a failed mint writes no row.
  await writeAuditLog({
    actorId: authorized.context.actorId,
    action: "media.upload_url_issued",
    entityType: "SiteMedia",
    entityId: path,
    metadata: { purpose, fileName, contentType, publicUrl },
  });

  return NextResponse.json(
    { path, token, publicUrl } satisfies MediaUploadUrlResponse,
    { status: 200 },
  );
}
