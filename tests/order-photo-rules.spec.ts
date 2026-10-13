/**
 * The cargo-photo rules `POST /api/orders/[id]/photos` enforces: what counts as
 * an image (by its bytes, never its label), how big one may be, how many an
 * order may hold, which statuses may still change them, and where the object
 * lands in the shared private bucket.
 *
 * **Why this runs with no browser and no database**, as
 * `tests/dispatch-fit.spec.ts` does: `src/lib/order-photos/rules.ts` is free of
 * `server-only`, of Storage and of any Prisma value import (its one Prisma
 * import is type-only), so every rule can be asserted on byte arrays built
 * here. Keep it that way — a value import would turn these into integration
 * tests.
 */

import { expect, test } from "@playwright/test";

import {
  canAddOrderPhoto,
  isOrderPhotoEditableStatus,
  ORDER_PHOTO_MAX_BYTES,
  ORDER_PHOTO_MAX_COUNT,
  orderPhotoStoragePath,
  sniffOrderPhotoContentType,
  validateOrderPhoto,
} from "@/lib/order-photos/rules";

/** A byte array that starts with `head` and is padded to `length`. */
function bytesStartingWith(head: number[], length = 64): Uint8Array {
  const bytes = new Uint8Array(Math.max(length, head.length));
  bytes.set(head);
  return bytes;
}

const JPEG_HEAD = [0xff, 0xd8, 0xff, 0xe0];
const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
// "RIFF", a four-byte size, then "WEBP".
const WEBP_HEAD = [
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
];

const ascii = (text: string): number[] =>
  Array.from(text, (char) => char.charCodeAt(0));

test.describe("sniffOrderPhotoContentType", () => {
  test("recognises JPEG, PNG and WebP by their magic numbers", () => {
    expect(sniffOrderPhotoContentType(bytesStartingWith(JPEG_HEAD))).toBe(
      "image/jpeg",
    );
    expect(sniffOrderPhotoContentType(bytesStartingWith(PNG_HEAD))).toBe(
      "image/png",
    );
    expect(sniffOrderPhotoContentType(bytesStartingWith(WEBP_HEAD))).toBe(
      "image/webp",
    );
  });

  test("refuses a RIFF container that is not WebP (e.g. WAV)", () => {
    const wav = [...ascii("RIFF"), 0x24, 0x00, 0x00, 0x00, ...ascii("WAVE")];
    expect(sniffOrderPhotoContentType(bytesStartingWith(wav))).toBeNull();
  });

  test("refuses SVG, HTML, GIF and PDF however they are labelled", () => {
    for (const text of [
      "<svg xmlns=",
      "<!DOCTYPE html>",
      "GIF89a",
      "%PDF-1.7",
    ]) {
      expect(sniffOrderPhotoContentType(bytesStartingWith(ascii(text)))).toBe(
        null,
      );
    }
  });

  test("refuses a file too short to carry a signature", () => {
    expect(sniffOrderPhotoContentType(new Uint8Array([0xff, 0xd8]))).toBeNull();
    expect(
      sniffOrderPhotoContentType(new Uint8Array(PNG_HEAD.slice(0, 7))),
    ).toBeNull();
  });
});

test.describe("validateOrderPhoto", () => {
  test("accepts a real JPEG and records the sniffed type", () => {
    expect(
      validateOrderPhoto({
        declaredType: "image/jpeg",
        bytes: bytesStartingWith(JPEG_HEAD),
      }),
    ).toEqual({ ok: true, contentType: "image/jpeg" });
  });

  test("trusts the bytes over the label: a PNG sent as image/jpeg is a PNG", () => {
    expect(
      validateOrderPhoto({
        declaredType: "image/jpeg",
        bytes: bytesStartingWith(PNG_HEAD),
      }),
    ).toEqual({ ok: true, contentType: "image/png" });
  });

  test("accepts an empty declared type when the bytes are an image", () => {
    expect(
      validateOrderPhoto({
        declaredType: "",
        bytes: bytesStartingWith(WEBP_HEAD),
      }),
    ).toEqual({ ok: true, contentType: "image/webp" });
  });

  test("refuses SVG content labelled as a JPEG", () => {
    expect(
      validateOrderPhoto({
        declaredType: "image/jpeg",
        bytes: bytesStartingWith(ascii("<svg onload=alert(1)>")),
      }),
    ).toEqual({ ok: false, error: "UNSUPPORTED_TYPE" });
  });

  test("refuses an unaccepted declared type even with image bytes", () => {
    expect(
      validateOrderPhoto({
        declaredType: "image/svg+xml",
        bytes: bytesStartingWith(PNG_HEAD),
      }),
    ).toEqual({ ok: false, error: "UNSUPPORTED_TYPE" });
  });

  test("refuses an empty file", () => {
    expect(
      validateOrderPhoto({
        declaredType: "image/png",
        bytes: new Uint8Array(),
      }),
    ).toEqual({ ok: false, error: "EMPTY_FILE" });
  });

  test("accepts exactly the maximum size and refuses one byte over", () => {
    expect(
      validateOrderPhoto({
        declaredType: "image/jpeg",
        bytes: bytesStartingWith(JPEG_HEAD, ORDER_PHOTO_MAX_BYTES),
      }),
    ).toEqual({ ok: true, contentType: "image/jpeg" });

    expect(
      validateOrderPhoto({
        declaredType: "image/jpeg",
        bytes: bytesStartingWith(JPEG_HEAD, ORDER_PHOTO_MAX_BYTES + 1),
      }),
    ).toEqual({ ok: false, error: "FILE_TOO_LARGE" });
  });

  test("the maximum stays under Vercel's 4.5 MB request body limit", () => {
    expect(ORDER_PHOTO_MAX_BYTES).toBeLessThan(4.5 * 1000 * 1000);
  });
});

test.describe("photo count and status", () => {
  test("an order holds at most three photos", () => {
    expect(ORDER_PHOTO_MAX_COUNT).toBe(3);
    expect(canAddOrderPhoto(0)).toBe(true);
    expect(canAddOrderPhoto(2)).toBe(true);
    expect(canAddOrderPhoto(3)).toBe(false);
    expect(canAddOrderPhoto(4)).toBe(false);
  });

  test("only an unpaid (INITIATED) order may change its photos", () => {
    expect(isOrderPhotoEditableStatus("INITIATED")).toBe(true);
    for (const status of [
      "PENDING",
      "CLAIMED",
      "ACCEPTED",
      "IN_TRANSIT",
      "COMPLETED",
      "CANCELLED",
    ] as const) {
      expect(isOrderPhotoEditableStatus(status)).toBe(false);
    }
  });
});

test.describe("orderPhotoStoragePath", () => {
  test("namespaces under order-photos/<orderId>/ with the sniffed extension", () => {
    expect(orderPhotoStoragePath("ord_1", "image/jpeg", "abc")).toBe(
      "order-photos/ord_1/abc.jpg",
    );
    expect(orderPhotoStoragePath("ord_1", "image/png", "abc")).toBe(
      "order-photos/ord_1/abc.png",
    );
    expect(orderPhotoStoragePath("ord_1", "image/webp", "abc")).toBe(
      "order-photos/ord_1/abc.webp",
    );
  });
});
