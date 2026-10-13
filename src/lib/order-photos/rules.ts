/**
 * The rules a cargo photo has to pass before it is stored against an order.
 *
 * Pure and dependency-free on purpose — no Prisma, no Storage, no
 * `server-only` — so the same module is read by `POST /api/orders/[id]/photos`,
 * by the booking form (to reject a file before spending an upload on it), and
 * by `tests/order-photo-rules.spec.ts` without a browser or a database.
 *
 * The server is the authority, and it never trusts what the browser says a file
 * is. A `File.type` is a label the client chose; the bytes are what Storage will
 * later serve. That matters because photos are opened top-level from a signed
 * URL: an object that is really `image/svg+xml` or `text/html` would execute as
 * script on the Storage origin. So the content type that gets recorded — and
 * sent to Storage as the object's `Content-Type` — is the one sniffed from the
 * file's leading bytes, never the declared one.
 */

// Type-only: this module is also bundled into the booking form, and the
// generated Prisma client has no business in a browser bundle.
import type { OrderStatus } from "@prisma/client";

/** The most photos one order may carry. */
export const ORDER_PHOTO_MAX_COUNT = 3;

/**
 * The largest accepted photo, in bytes: 4 MiB.
 *
 * Bounded by the platform rather than by taste. Photos are uploaded *through*
 * a Next.js route handler (not straight to Storage), and Vercel refuses a
 * function request body over 4.5 MB before the handler runs — with an HTML
 * error page rather than this API's JSON. Staying under that, with room for
 * the multipart framing, keeps every refusal a readable `413` from this code.
 */
export const ORDER_PHOTO_MAX_BYTES = 4 * 1024 * 1024;

/**
 * Headroom allowed on top of `ORDER_PHOTO_MAX_BYTES` when judging a request by
 * its `Content-Length`, before the body is parsed: the multipart boundary and
 * part headers around the one file. Generous, because this check exists only
 * to refuse an obviously oversized body cheaply; the exact limit is enforced on
 * the parsed file.
 */
export const ORDER_PHOTO_MULTIPART_OVERHEAD_BYTES = 64 * 1024;

/** The image types a cargo photo may be, in the form Storage records them. */
export const ORDER_PHOTO_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type OrderPhotoContentType = (typeof ORDER_PHOTO_CONTENT_TYPES)[number];

/** File extension used in the object path for each accepted type. */
export const ORDER_PHOTO_EXTENSIONS: Record<OrderPhotoContentType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * The order statuses in which photos may be added or removed: only
 * `INITIATED`, the created-but-unpaid state `POST /api/orders` writes and
 * `POST /api/orders/[id]/pay` moves on to `PENDING`.
 *
 * Once paid, the order is on the load board and a carrier may already be
 * deciding on it — or driving to it — on the strength of what it showed, so the
 * photos are frozen with everything else the client booked.
 */
export const ORDER_PHOTO_EDITABLE_STATUSES: readonly OrderStatus[] = [
  "INITIATED",
];

/**
 * Machine-readable error codes the photo routes answer with, as
 * `{ error: "<CODE>" }`. Codes rather than sentences because the only caller is
 * the booking form, which maps each to its own localized copy.
 */
export type OrderPhotoErrorCode =
  | "UNAUTHORIZED"
  | "INVALID_REQUEST"
  | "FILE_REQUIRED"
  | "EMPTY_FILE"
  | "UNSUPPORTED_TYPE"
  | "FILE_TOO_LARGE"
  | "NOT_FOUND"
  | "ORDER_NOT_EDITABLE"
  | "PHOTO_LIMIT"
  | "UPLOAD_FAILED";

/** Leading bytes of a PNG file, per the PNG specification. */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** JPEG's start-of-image marker followed by the first marker's `0xFF`. */
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];

/** `RIFF` at offset 0 and `WEBP` at offset 8 mark a WebP container. */
const RIFF_SIGNATURE = [0x52, 0x49, 0x46, 0x46];
const WEBP_FORM_TYPE = [0x57, 0x45, 0x42, 0x50];
const WEBP_FORM_TYPE_OFFSET = 8;

function startsWithAt(
  bytes: Uint8Array,
  signature: readonly number[],
  offset = 0,
): boolean {
  if (bytes.length < offset + signature.length) {
    return false;
  }

  return signature.every((byte, index) => bytes[offset + index] === byte);
}

/**
 * The accepted image type `bytes` actually is, judged by its magic number, or
 * `null` when it is none of them. Only the first dozen bytes are read.
 */
export function sniffOrderPhotoContentType(
  bytes: Uint8Array,
): OrderPhotoContentType | null {
  if (startsWithAt(bytes, JPEG_SIGNATURE)) {
    return "image/jpeg";
  }

  if (startsWithAt(bytes, PNG_SIGNATURE)) {
    return "image/png";
  }

  if (
    startsWithAt(bytes, RIFF_SIGNATURE) &&
    startsWithAt(bytes, WEBP_FORM_TYPE, WEBP_FORM_TYPE_OFFSET)
  ) {
    return "image/webp";
  }

  return null;
}

/** Whether a declared (client-supplied) type is one this feature accepts. */
export function isAcceptedOrderPhotoContentType(
  contentType: string,
): contentType is OrderPhotoContentType {
  return (ORDER_PHOTO_CONTENT_TYPES as readonly string[]).includes(contentType);
}

/**
 * Judge one uploaded file: its declared type, its size and its real type.
 *
 * The declared type is checked only so an obviously wrong file (a PDF, a
 * video) is refused with the right code; an empty declared type is allowed,
 * because some browsers send none for a perfectly good photo. Whatever was
 * declared, the bytes decide — a PNG labelled `image/jpeg` is stored as the PNG
 * it is, and anything whose bytes are not an accepted image is refused however
 * it was labelled.
 *
 * Size is judged on the byte count actually received, not on any header.
 */
export function validateOrderPhoto(file: {
  declaredType: string;
  bytes: Uint8Array;
}):
  | { ok: true; contentType: OrderPhotoContentType }
  | { ok: false; error: OrderPhotoErrorCode } {
  if (file.bytes.length === 0) {
    return { ok: false, error: "EMPTY_FILE" };
  }

  if (file.bytes.length > ORDER_PHOTO_MAX_BYTES) {
    return { ok: false, error: "FILE_TOO_LARGE" };
  }

  if (
    file.declaredType !== "" &&
    !isAcceptedOrderPhotoContentType(file.declaredType)
  ) {
    return { ok: false, error: "UNSUPPORTED_TYPE" };
  }

  const sniffed = sniffOrderPhotoContentType(file.bytes);
  if (sniffed === null) {
    return { ok: false, error: "UNSUPPORTED_TYPE" };
  }

  return { ok: true, contentType: sniffed };
}

/** Whether an order already holding `existingCount` photos may take another. */
export function canAddOrderPhoto(existingCount: number): boolean {
  return existingCount < ORDER_PHOTO_MAX_COUNT;
}

/** Whether an order in `status` may still have photos added or removed. */
export function isOrderPhotoEditableStatus(status: OrderStatus): boolean {
  return ORDER_PHOTO_EDITABLE_STATUSES.includes(status);
}

/**
 * Top-level folder for cargo photos inside the shared private bucket. Driver
 * documents sit under `<driverProfileId>/`, a cuid, which can never equal this
 * literal, so the two features cannot collide.
 */
export const ORDER_PHOTO_PATH_PREFIX = "order-photos";

/**
 * The object path for a new photo: `order-photos/<orderId>/<uuid>.<ext>`.
 *
 * The order id comes from the database (the route looks the order up before
 * calling this), never straight from the URL, and the file name is generated —
 * nothing the client wrote reaches the path, so it cannot climb out of the
 * order's own prefix.
 */
export function orderPhotoStoragePath(
  orderId: string,
  contentType: OrderPhotoContentType,
  randomId: string,
): string {
  return `${ORDER_PHOTO_PATH_PREFIX}/${orderId}/${randomId}.${ORDER_PHOTO_EXTENSIONS[contentType]}`;
}
