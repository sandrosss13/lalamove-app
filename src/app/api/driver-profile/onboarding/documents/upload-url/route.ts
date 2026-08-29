import { NextResponse } from "next/server";

import {
  createDriverDocumentUploadUrl,
  isSupportedDriverDocumentContentType,
  UNSUPPORTED_CONTENT_TYPE_ERROR,
} from "@/lib/driver-document-storage";
import {
  asRecord,
  nonEmptyString,
  parseDocumentType,
  readJsonBody,
  resolveOnboardingDocumentContext,
} from "../guard";

/** Validated shape of a signed-upload-URL request body. */
type UploadUrlInput = {
  fileName: string;
  contentType: string;
};

/**
 * Hand-rolled body validation, consistent with the rest of this API (the
 * project deliberately uses no validation library). The document `type` is
 * validated separately by the caller — for a clean 400 rather than a surprise
 * later, even though this endpoint's response does not include it: the
 * signed-upload path minted below is type-independent.
 *
 * `contentType` is checked here as well as inside
 * `createDriverDocumentUploadUrl` so an unsupported file produces a clean 400
 * naming JPG/PNG, rather than surfacing that helper's thrown error as a 500.
 */
function parseUploadUrlBody(
  fields: Record<string, unknown>,
): { data: UploadUrlInput } | { error: string } {
  const fileName = nonEmptyString(fields.fileName);
  if (fileName === null) {
    return { error: "fileName is required and must be a non-empty string." };
  }

  const contentType = nonEmptyString(fields.contentType);
  if (contentType === null) {
    return { error: "contentType is required and must be a non-empty string." };
  }

  if (!isSupportedDriverDocumentContentType(contentType)) {
    return { error: UNSUPPORTED_CONTENT_TYPE_ERROR };
  }

  return { data: { fileName, contentType } };
}

/**
 * POST /api/driver-profile/onboarding/documents/upload-url — issue a signed
 * upload URL for one onboarding document.
 *
 * The browser uploads the bytes straight to Supabase Storage with the returned
 * `path`/`token` (via `uploadFileToSignedUrl`), then calls
 * `POST /api/driver-profile/onboarding/documents` to record the result. The
 * file itself never passes through a route handler, whose request-body limit is
 * below the design's 10MB-per-document cap.
 *
 * Issuing a URL neither creates nor reserves a document row: an upload that is
 * started and abandoned leaves an orphaned object and nothing else.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const guard = await resolveOnboardingDocumentContext(request);
  if ("error" in guard) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const parsedBody = await readJsonBody(request);
  if ("error" in parsedBody) {
    return NextResponse.json({ error: parsedBody.error }, { status: 400 });
  }

  const fields = asRecord(parsedBody.body);
  if (fields === null) {
    return NextResponse.json(
      { error: "Request body must be a JSON object." },
      { status: 400 },
    );
  }

  const parsedType = parseDocumentType(fields.type);
  if ("error" in parsedType) {
    return NextResponse.json({ error: parsedType.error }, { status: 400 });
  }

  const parsed = parseUploadUrlBody(fields);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const { path, signedUrl, token } = await createDriverDocumentUploadUrl(
      guard.context.driverProfileId,
      parsed.data.fileName,
      parsed.data.contentType,
    );

    return NextResponse.json({ path, signedUrl, token }, { status: 200 });
  } catch (error) {
    // A missing `driver-documents` bucket (a manual provisioning step, so the
    // expected first-run failure), absent Supabase env vars, or a Storage
    // outage — none is the caller's fault, and none should surface as an
    // unhandled crash, which Next.js renders as a 500 with no `{error}` body
    // for the client to show inline.
    console.error("Failed to create a document upload URL:", error);
    return NextResponse.json(
      { error: "Could not prepare the upload. Please try again." },
      { status: 502 },
    );
  }
}
