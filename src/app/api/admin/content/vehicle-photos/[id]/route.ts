import { NextResponse } from "next/server";

import type { AdminRole } from "@prisma/client";

// Type-only import, so nothing of the sibling route's module reaches this one
// at runtime — it is erased at compile time. Sharing the wire shape with the
// endpoint that lists these rows is what stops the two responses drifting.
import { getRequestTranslations } from "@/i18n/request-locale";
import type { AdminVehiclePhotoRow } from "@/app/api/admin/content/vehicle-photos/route";
import { authorizeAdminApi } from "@/lib/admin/api-auth";
import { writeAuditLog } from "@/lib/admin/audit";
import { revalidateHomePage } from "@/lib/admin/home-page-data";
import { ADMIN_VEHICLE_PHOTO_SELECT } from "@/lib/admin/vehicle-photos";
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

/** The columns this endpoint may write, each optional but at least one set. */
type VehiclePhotoUpdate = {
  imageUrl?: string | null;
  showOnHomepage?: boolean;
};

/** The body keys this endpoint accepts; anything else is refused. */
const WRITABLE_KEYS: ReadonlySet<string> = new Set([
  "imageUrl",
  "showOnHomepage",
]);

/**
 * The request-locale translator, passed into the synchronous body validator so
 * its messages reach the admin in their own language.
 */
type RequestTranslator = Awaited<ReturnType<typeof getRequestTranslations>>;

/**
 * Validates `imageUrl` alone: null clears the photo, a string must be a usable
 * URL.
 */
function parseImageUrl(
  imageUrl: unknown,
  t: RequestTranslator,
): { value: string | null } | { error: string } {
  // Null clears the photo — a legitimate action, and the only way back to the
  // fallback glyph on the public page.
  if (imageUrl === null) {
    return { value: null };
  }

  if (typeof imageUrl !== "string" || imageUrl.trim() === "") {
    return {
      error: t("errors.adminContentVehiclePhotos.imageUrlNonEmptyOrNull"),
    };
  }
  if (imageUrl.trim().length > MAX_URL_LENGTH) {
    return {
      error: t("common.shared.fieldMaxLength", {
        field: "imageUrl",
        max: MAX_URL_LENGTH,
      }),
    };
  }
  if (!isUsableUrl(imageUrl.trim())) {
    return {
      error: t("common.shared.imageurlMustBeAnHttpS"),
    };
  }

  return { value: imageUrl.trim() };
}

/**
 * Hand-rolled body validation, consistent with the rest of the API (the project
 * deliberately uses no validation library).
 *
 * **`imageUrl` and `showOnHomepage` are the only writable columns on this
 * endpoint, and that is the whole reason it exists separately from anything
 * else that could edit a `VehicleTypeSpec`.** Both are marketing-only: the
 * photo on the public card, and whether the public marketing surfaces show the
 * type at all (homepage order is set through the sibling `reorder` endpoint).
 * The rest of the model is operational data: `label` appears in the booking
 * picker and on every order; `category` decides which cargo categories may
 * select the vehicle; `maxPayloadKg` and the three cargo dimensions drive order
 * matching; `loadingAccessType` is a capability claim made to clients; the 1-1
 * `PricingRule` is what `src/lib/pricing.ts` charges. A `CONTENT_MANAGER` sets
 * marketing presentation — not the fleet's physical specification and not its
 * rates. Specifications change through `prisma/seed.ts`, never through the back
 * office.
 */
function parseUpdateBody(
  body: unknown,
  t: RequestTranslator,
): { data: VehiclePhotoUpdate } | { error: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { error: t("common.shared.requestBodyMustBeAJson") };
  }

  const record = body as Record<string, unknown>;

  // Rejected rather than ignored: a caller sending `label` or `maxPayloadKg`
  // has misunderstood what this endpoint does, and silently dropping the field
  // would let them believe it landed. See the note above on why only these two
  // are writable here.
  const unexpected = Object.keys(record).filter(
    (key) => !WRITABLE_KEYS.has(key),
  );
  if (unexpected.length > 0) {
    return {
      error: t("errors.adminContentVehiclePhotos.unexpectedFields", {
        fields: unexpected.join(", "),
      }),
    };
  }

  // An empty object would be a successful no-op write and an audit entry that
  // records nothing; refuse it so a broken client is noticed.
  if (!("imageUrl" in record) && !("showOnHomepage" in record)) {
    return { error: t("errors.adminContentVehiclePhotos.nothingToUpdate") };
  }

  const data: VehiclePhotoUpdate = {};

  if ("imageUrl" in record) {
    const imageUrl = parseImageUrl(record.imageUrl, t);
    if ("error" in imageUrl) {
      return imageUrl;
    }
    data.imageUrl = imageUrl.value;
  }

  if ("showOnHomepage" in record) {
    if (typeof record.showOnHomepage !== "boolean") {
      return {
        error: t(
          "errors.adminContentVehiclePhotos.showOnHomepageMustBeBoolean",
        ),
      };
    }
    data.showOnHomepage = record.showOnHomepage;
  }

  return { data };
}

/**
 * PATCH /api/admin/content/vehicle-photos/[id] — set or clear the marketing
 * photo on one vehicle type, and/or show or hide it on the homepage.
 *
 * Body: `{ imageUrl?: string | null, showOnHomepage?: boolean }`, at least one
 * key. Nothing about the vehicle's payload, dimensions, loading access or
 * pricing can be reached from here — see `parseUpdateBody` for why that
 * boundary is enforced rather than merely documented.
 *
 * **Changes go live the moment this returns.** `GET /api/vehicle-types` is
 * public and uncached; a `VehicleTypeSpec` has no draft state. Hiding a type
 * affects only the marketing surfaces built from `useLandingVehicleTypes` —
 * the type stays bookable from the signed-in booking form.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const authorized = await authorizeAdminApi(ALLOWED_ROLES);
  if (!authorized.ok) {
    return authorized.response;
  }

  const t = await getRequestTranslations();

  const { id } = await params;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: t("common.shared.requestBodyMustBeValidJson") },
      { status: 400 },
    );
  }

  const parsed = parseUpdateBody(rawBody, t);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  // Read before write, so a row deleted or re-seeded out from under the page is
  // a clean 404 rather than a Prisma "record not found" exception — and so the
  // audit entries below can record the values that are about to be overwritten.
  const existing = await prisma.vehicleTypeSpec.findUnique({
    where: { id },
    select: ADMIN_VEHICLE_PHOTO_SELECT,
  });

  if (!existing) {
    return NextResponse.json(
      { error: t("errors.adminContentVehiclePhotos.vehicleTypeNotFound") },
      { status: 404 },
    );
  }

  const { imageUrl, showOnHomepage } = parsed.data;

  const updated = await prisma.vehicleTypeSpec.update({
    where: { id },
    // The writable columns are named literally rather than spread from the
    // parsed object, so no future edit can widen what this endpoint writes by
    // widening what it parses. `undefined` leaves a column untouched.
    data: { imageUrl, showOnHomepage },
    select: ADMIN_VEHICLE_PHOTO_SELECT,
  });

  // One entry per kind of change, so the log can be filtered by action. Both
  // ends recorded: this is the only trace of the previous value once the column
  // is overwritten. `code` rather than the cuid alone, because that is the
  // identity a later reader of the log reasons about.
  if (imageUrl !== undefined) {
    await writeAuditLog({
      actorId: authorized.context.actorId,
      action: "vehicle_type_photo.update",
      entityType: "VehicleTypeSpec",
      entityId: existing.id,
      metadata: {
        code: existing.code,
        previousImageUrl: existing.imageUrl,
        imageUrl,
      },
    });
  }

  if (showOnHomepage !== undefined) {
    await writeAuditLog({
      actorId: authorized.context.actorId,
      action: "vehicle_type.homepage_visibility",
      entityType: "VehicleTypeSpec",
      entityId: existing.id,
      metadata: {
        code: existing.code,
        previousShowOnHomepage: existing.showOnHomepage,
        showOnHomepage,
      },
    });
  }

  // The landing sections read vehicle types client-side from the uncached
  // `GET /api/vehicle-types`, so this is belt-and-braces: it keeps any cached
  // render of the homepage from outliving the change.
  revalidateHomePage();

  const body: AdminVehiclePhotoResponse = { vehicleType: updated };

  return NextResponse.json(body, { status: 200 });
}
