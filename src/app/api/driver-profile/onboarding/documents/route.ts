import { NextResponse } from "next/server";
import { DriverApplicationDocumentStatus, Prisma } from "@prisma/client";

import {
  deleteDriverDocuments,
  getDriverDocumentContentType,
  getDriverDocumentSignedUrl,
  isSupportedDriverDocumentContentType,
  UNSUPPORTED_CONTENT_TYPE_ERROR,
} from "@/lib/driver-document-storage";
import { prisma } from "@/lib/prisma";
import {
  asRecord,
  nonEmptyString,
  parseDocumentType,
  readJsonBody,
  resolveOnboardingDocumentContext,
} from "./guard";

/**
 * Shown whenever the uploaded object's metadata cannot be read at all — the
 * upload never landed, or Storage is unreachable. Either way the document is
 * not recorded: verification fails closed.
 */
const UNVERIFIABLE_UPLOAD_ERROR =
  "We couldn't verify the uploaded file. Please upload it again.";

/** Best-effort removal of an object the request is refusing to record. */
async function discardObject(path: string): Promise<void> {
  await deleteDriverDocuments([path]).catch((error: unknown) => {
    console.error("Failed to delete a rejected driver document:", error);
  });
}

/**
 * Exactly the character set `toSafeFileName` (`driver-document-storage.ts`) can
 * emit — it collapses everything outside this class into "-". Notably it
 * excludes "%", which is what keeps percent-encoded traversal out.
 */
const DOCUMENT_FILE_NAME = /^[A-Za-z0-9._-]+$/;

/**
 * Whether `path` is one this driver could have been issued an upload URL for.
 *
 * `createDriverDocumentUploadUrl` namespaces every object under the driver's
 * own profile id, so a path outside that prefix was not minted for this caller.
 * Without this check a driver could post *another* driver's object path and get
 * back a signed read URL for it in the response below — the object exists, so
 * "it wouldn't exist" is not the protection here. Costs no Storage round trip,
 * which is why it is done in addition to (not instead of) trusting the minted
 * path.
 *
 * Deliberately an allowlist matching the exact shape that helper mints
 * (`${driverProfileId}/${uuid}-${safeFileName}`) rather than a blacklist of
 * "..": the path is interpolated into a Storage URL downstream, and a URL
 * parser resolves "%2e%2e" into a dot segment just as it does a literal "..",
 * so blacklisting the two literal characters left
 * `<ownId>/%2e%2e/<otherId>/<object>` — which resolves to another driver's
 * document — passing. Rejecting every character outside the mintable set
 * closes all such encodings at once.
 */
function isOwnedPath(path: string, driverProfileId: string): boolean {
  // `extra` being empty and `fileName` being present together mean the path is
  // exactly two segments.
  const [prefix, fileName, ...extra] = path.split("/");

  return (
    extra.length === 0 &&
    fileName !== undefined &&
    prefix === driverProfileId &&
    // "." and "..", the two dot segments a URL parser resolves, are the only
    // members of the allowed character set that are not object names.
    fileName !== "." &&
    fileName !== ".." &&
    DOCUMENT_FILE_NAME.test(fileName)
  );
}

/**
 * Detects a violation of the partial unique index from the schema migration
 * (`driver_application_document_live_type_unique`), which allows only one
 * non-superseded row per `(driverApplicationId, type)`. Reachable only when two
 * uploads of the same document type race, since the transaction below
 * supersedes before it inserts.
 */
function isLiveDocumentConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

/**
 * POST /api/driver-profile/onboarding/documents — record a document the browser
 * has just uploaded to Supabase Storage.
 *
 * Body: `{ type, path }`, where `path` is the value returned by
 * `POST .../documents/upload-url` and already uploaded to via
 * `uploadFileToSignedUrl`. The bytes never pass through this handler.
 *
 * Documents are versioned rather than overwritten: recording a type that
 * already has a live row supersedes that row and inserts a new one, so an
 * earlier reviewer's flag reason stays readable after a retake. Every row this
 * endpoint creates starts `PENDING`; only the admin review flow moves a
 * document to `APPROVED`/`FLAGGED`.
 *
 * `signedUrl` in the response is a short-lived read URL for the document just
 * recorded, so the caller can show the thumbnail without a second round trip.
 * It is null in the rare case where signing fails after the row is committed:
 * the document *is* recorded, and failing the whole request there would prompt
 * a retry that uploads and supersedes all over again.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const guard = await resolveOnboardingDocumentContext(request);
  if ("error" in guard) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const { driverProfileId, driverApplicationId } = guard.context;

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

  const { type } = parsedType;

  const path = nonEmptyString(fields.path);
  if (path === null) {
    return NextResponse.json(
      { error: "path is required and must be a non-empty string." },
      { status: 400 },
    );
  }

  if (!isOwnedPath(path, driverProfileId)) {
    return NextResponse.json(
      { error: "That upload does not belong to this application." },
      { status: 400 },
    );
  }

  // The content type checked when the upload URL was issued is only what the
  // client *claimed*: a signed upload URL cannot pin the type of what is later
  // PUT to it. What Storage recorded is what a signed read URL will serve the
  // object as, and documents are viewed by opening such a URL directly — so an
  // object Storage recorded as SVG or HTML is a live XSS vector, not a
  // theoretical one. Verify the recorded type before the row exists.
  let actualContentType: string | null;
  try {
    actualContentType = await getDriverDocumentContentType(path);
  } catch (error) {
    console.error("Failed to verify an uploaded driver document:", error);
    return NextResponse.json(
      { error: UNVERIFIABLE_UPLOAD_ERROR },
      { status: 400 },
    );
  }

  if (
    actualContentType === null ||
    !isSupportedDriverDocumentContentType(actualContentType)
  ) {
    await discardObject(path);
    return NextResponse.json(
      { error: UNSUPPORTED_CONTENT_TYPE_ERROR },
      { status: 400 },
    );
  }

  // Superseding before inserting, rather than after as the task describes: the
  // unique index is not deferrable, so it is checked at statement time and the
  // opposite order would trip over the old live row.
  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      const previous = await tx.driverApplicationDocument.findFirst({
        where: { driverApplicationId, type, supersededAt: null },
        select: { id: true, storagePath: true },
      });

      // The superseded object, unless something else still needs it. Null when
      // there was no previous row, or when one survives that points at it.
      let discardablePath: string | null = null;

      if (previous) {
        await tx.driverApplicationDocument.update({
          where: { id: previous.id },
          data: { supersededAt: new Date() },
        });

        // Nothing stops a driver from recording one object path under two
        // document types. Deleting the object on behalf of the type being
        // retaken would leave the other type's still-live row pointing at a
        // deleted object — a broken thumbnail in the review step and the admin
        // drawer. The row just superseded above no longer matches, and the new
        // row does not exist yet, so this sees only genuine other references.
        const stillReferenced = await tx.driverApplicationDocument.findFirst({
          where: {
            driverApplicationId,
            storagePath: previous.storagePath,
            supersededAt: null,
          },
          select: { id: true },
        });

        discardablePath = stillReferenced ? null : previous.storagePath;
      }

      const document = await tx.driverApplicationDocument.create({
        data: {
          driverApplicationId,
          type,
          storagePath: path,
          status: DriverApplicationDocumentStatus.PENDING,
        },
        select: { createdAt: true },
      });

      return { document, discardablePath };
    });
  } catch (error) {
    if (isLiveDocumentConflict(error)) {
      return NextResponse.json(
        { error: "Another upload for this document is still finishing." },
        { status: 409 },
      );
    }

    throw error;
  }

  // The row is the source of truth, so the superseded object is removed
  // best-effort once the transaction has committed — a Storage failure here
  // leaves an orphaned file, which is a tidiness problem, not a correctness
  // one. Skipped when the retake reuses the same path, which would otherwise
  // delete the object just recorded, and when the transaction found another
  // live row still referencing it.
  const { discardablePath } = result;
  if (discardablePath !== null && discardablePath !== path) {
    await discardObject(discardablePath);
  }

  let signedUrl: string | null = null;
  try {
    signedUrl = await getDriverDocumentSignedUrl(path);
  } catch (error) {
    console.error("Failed to sign a just-recorded driver document:", error);
  }

  return NextResponse.json(
    {
      type,
      status: DriverApplicationDocumentStatus.PENDING,
      signedUrl,
      uploadedAt: result.document.createdAt.toISOString(),
    },
    { status: 200 },
  );
}
