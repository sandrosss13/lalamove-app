/**
 * The booking form's submit-time logic: `src/components/home/booking-submit.ts`.
 *
 * Guards the "Book delivery rewrites to Uploading photos…" bug: the Book
 * button must only claim an upload while one is actually happening, and the
 * photos must each be sent exactly once. No browser, no network, no database:
 * `fetch` is a recording stand-in.
 */

import { expect, test } from "@playwright/test";

import {
  bookButtonLabelKey,
  uploadCargoPhotoBlobs,
  type PhotoUploadFetch,
} from "@/components/home/booking-submit";

function recordingFetch(results: Array<boolean | "throw">) {
  const calls: Array<{ url: string; method: string; fileName: string }> = [];
  const impl: PhotoUploadFetch = async (url, init) => {
    const file = init.body.get("file");
    calls.push({
      url,
      method: init.method,
      fileName: file instanceof File ? file.name : String(file),
    });
    const result = results[calls.length - 1] ?? true;
    if (result === "throw") {
      throw new TypeError("network down");
    }
    return { ok: result };
  };
  return { impl, calls };
}

const jpeg = () =>
  new Blob([new Uint8Array([0xff, 0xd8, 0xff])], {
    type: "image/jpeg",
  });

test.describe("bookButtonLabelKey", () => {
  test("rests on the call to action", () => {
    expect(
      bookButtonLabelKey({
        submitting: false,
        phase: "uploading",
        isEditing: false,
      }),
    ).toBe("bookDelivery");
    expect(
      bookButtonLabelKey({
        submitting: false,
        phase: "booking",
        isEditing: true,
      }),
    ).toBe("saveChanges");
  });

  test("names the phase in flight", () => {
    expect(
      bookButtonLabelKey({
        submitting: true,
        phase: "pricing",
        isEditing: false,
      }),
    ).toBe("calculating");
    expect(
      bookButtonLabelKey({
        submitting: true,
        phase: "booking",
        isEditing: false,
      }),
    ).toBe("booking");
    expect(
      bookButtonLabelKey({
        submitting: true,
        phase: "booking",
        isEditing: true,
      }),
    ).toBe("saving");
    expect(
      bookButtonLabelKey({
        submitting: true,
        phase: "uploading",
        isEditing: false,
      }),
    ).toBe("uploadingPhotos");
  });
});

test.describe("uploadCargoPhotoBlobs", () => {
  test("no photos: no request and never enters the uploading phase", async () => {
    const { impl, calls } = recordingFetch([]);
    let started = 0;
    const failed = await uploadCargoPhotoBlobs("ord_1", [], impl, () => {
      started += 1;
    });
    expect(failed).toBe(0);
    expect(calls).toHaveLength(0);
    expect(started).toBe(0);
  });

  test("each photo is posted exactly once, in order, to the order", async () => {
    const { impl, calls } = recordingFetch([true, true, true]);
    let started = 0;
    const failed = await uploadCargoPhotoBlobs(
      "ord/2",
      [jpeg(), jpeg(), jpeg()],
      impl,
      () => {
        started += 1;
      },
    );
    expect(failed).toBe(0);
    expect(started).toBe(1);
    expect(calls).toEqual([
      {
        url: "/api/orders/ord%2F2/photos",
        method: "POST",
        fileName: "cargo-photo-1.jpg",
      },
      {
        url: "/api/orders/ord%2F2/photos",
        method: "POST",
        fileName: "cargo-photo-2.jpg",
      },
      {
        url: "/api/orders/ord%2F2/photos",
        method: "POST",
        fileName: "cargo-photo-3.jpg",
      },
    ]);
  });

  test("failures are counted, not retried, and never thrown", async () => {
    const { impl, calls } = recordingFetch([false, "throw", true]);
    const failed = await uploadCargoPhotoBlobs(
      "ord_3",
      [jpeg(), jpeg(), jpeg()],
      impl,
    );
    expect(failed).toBe(2);
    expect(calls).toHaveLength(3);
  });
});
