import { NextResponse } from "next/server";

import type { AdminRole } from "@prisma/client";

// Type-only import, so nothing of the sibling route's module reaches this one
// at runtime — it is erased at compile time. Sharing the wire shape with the
// endpoint that lists these rows is what stops the two responses drifting.
import type { AdminVehiclePhotoRow } from "@/app/api/admin/content/vehicle-photos/route";
import { authorizeAdminApi } from "@/lib/admin/api-auth";
import { writeAuditLog } from "@/lib/admin/audit";
import { prisma } from "@/lib/prisma";

/**
 * Staff who may attach or clear a vehicle type's marketing photo. Stated per
 * route rather than imported from one shared constant so the gate on each
 * endpoint can be read — and audited — without following an import.
 */
const ALLOWED_ROLES: readonly AdminRole[] = ["SUPER_ADMIN", "CONTENT_MANAGER"];

/**
 * Comfortably past the longest URL any browser will actually follow. Restated
 * here rather than imported, matching `src/app/api/admin/content/banners/route.ts`.
 */
const MAX_URL_LENGTH = 2048;

/** Body of a successful `PATCH`. */
type AdminVehiclePhotoResponse = {
  vehicleType: AdminVehiclePhotoRow;
};

/**
 * Whether a string is something a browser can actually load as an image.
 *
 * Root-relative paths are allowed so a photo can point at an asset inside this
 * app. Everything else must be an absolute `http(s)` URL, which rules out
 * `javascript:` and `data:` — this value ends up in an `src` on the public
 * homepage, so a scheme check is the cheap half of not letting a content editor
 * inject script into it.
 *
 * Copied verbatim from `src/app/api/admin/content/banners/route.ts`, which
 * guards the same class of value for the same reason; each route states the
 * rule its own column is held to rather than sharing one helper across entry
 * points.
 */
function isUsableUrl(value: string): boolean {
  // A leading `//` is protocol-relative, i.e. off-site despite looking local.
  if (value.startsWith("/")) {
    return !value.startsWith("//");
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }

  return parsed.protocol === "http:" || parsed.protocol === "https:";
}

/**
 * Hand-rolled body validation, consistent with the rest of the API (the project
 * deliberately uses no validation library).
 *
 * **`imageUrl` is the only writable column on this endpoint, and that is the
 * whole reason it exists separately from anything else that could edit a
 * `VehicleTypeSpec`.** The rest of the model is operational data: `label`
 * appears in the booking picker and on every order; `category` decides which
 * cargo categories may select the vehicle; `maxPayloadKg` and the three cargo
 * dimensions drive order matching; `loadingAccessType` is a capability claim
 * made to clients; the 1-1 `PricingRule` is what `src/lib/pricing.ts` charges.
 * A `CONTENT_MANAGER` sets marketing photography — not the fleet's physical
 * specification and not its rates. Specifications change through
 * `prisma/seed.ts`, never through the back office.
 */
function parseUpdateBody(
  body: unknown,
): { data: { imageUrl: string | null } } | { error: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { error: "Request body must be a JSON object." };
  }

  const record = body as Record<string, unknown>;

  // Rejected rather than ignored: a caller sending `label` or `maxPayloadKg`
  // has misunderstood what this endpoint does, and silently dropping the field
  // would let them believe it landed. See the note above on why only `imageUrl`
  // is writable here.
  const unexpected = Object.keys(record).filter((key) => key !== "imageUrl");
  if (unexpected.length > 0) {
    return {
      error:
        `This endpoint only sets imageUrl. Unexpected field(s): ${unexpected.join(", ")}. ` +
        "Vehicle specifications and pricing are changed through the seed, not the back office.",
    };
  }

  const { imageUrl } = record;

  // Null clears the photo — a legitimate action, and the only way back to the
  // fallback glyph on the public page.
  if (imageUrl === null) {
    return { data: { imageUrl: null } };
  }

  if (typeof imageUrl !== "string" || imageUrl.trim() === "") {
    return {
      error: "imageUrl must be a non-empty string, or null to clear it.",
    };
  }
  if (imageUrl.trim().length > MAX_URL_LENGTH) {
    return { error: `imageUrl must be ${MAX_URL_LENGTH} characters or fewer.` };
  }
  if (!isUsableUrl(imageUrl.trim())) {
    return {
      error: "imageUrl must be an http(s) URL or a path starting with /.",
    };
  }

  return { data: { imageUrl: imageUrl.trim() } };
}

/**
 * PATCH /api/admin/content/vehicle-photos/[id] — set or clear the marketing
 * photo on one vehicle type.
 *
 * Writes exactly one column. Nothing about the vehicle's payload, dimensions,
 * loading access or pricing can be reached from here — see `parseUpdateBody`
 * for why that boundary is enforced rather than merely documented.
 *
 * **The photo goes live the moment this returns.** `GET /api/vehicle-types` is
 * public and unfiltered; a `VehicleTypeSpec` has no draft state.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const authorized = await authorizeAdminApi(ALLOWED_ROLES);
  if (!authorized.ok) {
    return authorized.response;
  }

  const { id } = await params;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = parseUpdateBody(rawBody);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  // Read before write, so a row deleted or re-seeded out from under the page is
  // a clean 404 rather than a Prisma "record not found" exception — and so the
  // audit entry below can record the photo that is about to be overwritten.
  const existing = await prisma.vehicleTypeSpec.findUnique({
    where: { id },
    select: {
      id: true,
      code: true,
      label: true,
      category: true,
      imageUrl: true,
    },
  });

  if (!existing) {
    return NextResponse.json(
      { error: "Vehicle type not found." },
      { status: 404 },
    );
  }

  const updated = await prisma.vehicleTypeSpec.update({
    where: { id },
    // The one column is named literally rather than spread from the parsed
    // object, so no future edit can widen what this endpoint writes by
    // widening what it parses.
    data: { imageUrl: parsed.data.imageUrl },
    select: {
      id: true,
      code: true,
      label: true,
      category: true,
      imageUrl: true,
    },
  });

  await writeAuditLog({
    actorId: authorized.context.actorId,
    action: "vehicle_type_photo.update",
    entityType: "VehicleTypeSpec",
    entityId: existing.id,
    // Both ends recorded: this is the only trace of which photo a type used to
    // carry once the column is overwritten. `code` rather than the cuid alone,
    // because that is the identity a later reader of the log reasons about.
    metadata: {
      code: existing.code,
      previousImageUrl: existing.imageUrl,
      imageUrl: parsed.data.imageUrl,
    },
  });

  const body: AdminVehiclePhotoResponse = { vehicleType: updated };

  return NextResponse.json(body, { status: 200 });
}
