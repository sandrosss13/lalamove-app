/**
 * The rules of proof of delivery, pinned without a server, a database or a
 * bucket: what may be uploaded, where it may live, how much of it a delivery
 * needs, and when `POST /api/orders/[id]/complete` may waive it.
 *
 * `src/lib/orders/pod-rules.ts` is the single statement of each rule — the
 * routes under `src/app/api/orders/[id]/pod` and the completion route ask it
 * for every decision — so a rule pinned here is the rule the HTTP surface
 * applies. The HTTP checks themselves need a session and a database, which
 * this suite must never be pointed at by default (see `playwright.config.ts`).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import {
  MAX_POD_PHOTOS,
  MAX_POD_PHOTO_BYTES,
  MAX_POD_SIGNATURE_BYTES,
  MIN_POD_PHOTOS,
  POD_WAIVER_HEADER,
  POD_WAIVER_WEB_HUB,
  TAKEN_AT_CLOCK_SKEW_MS,
  isAllowedPodContentType,
  isPodKind,
  isPodObjectPath,
  isPodWaived,
  maxPodBytes,
  podCompletionDenial,
  podObjectPath,
  resolveTakenAt,
  toSafePodFileName,
} from "@/lib/orders/pod-rules";
import { getDriverSupportPhone } from "@/lib/support-contact";

const ORDER_ID = "cmorder0001";
const UUID = "3f2b8c1e-0000-4000-8000-000000000001";

test.describe("podCompletionDenial", () => {
  test("lets a delivery with a photo and a signature complete", () => {
    for (
      let photoCount = MIN_POD_PHOTOS;
      photoCount <= MAX_POD_PHOTOS;
      photoCount++
    ) {
      expect(
        podCompletionDenial({ photoCount, hasSignature: true }),
      ).toBeNull();
    }
  });

  test("refuses a delivery with no photo", () => {
    expect(podCompletionDenial({ photoCount: 0, hasSignature: true })).toBe(
      "POD_PHOTO_REQUIRED",
    );
  });

  test("refuses a delivery with no signature", () => {
    expect(podCompletionDenial({ photoCount: 2, hasSignature: false })).toBe(
      "POD_SIGNATURE_REQUIRED",
    );
  });

  test("reports the photo when both are missing", () => {
    // One stable answer for the both-missing case, in the order the capture
    // screen lists the fields.
    expect(podCompletionDenial({ photoCount: 0, hasSignature: false })).toBe(
      "POD_PHOTO_REQUIRED",
    );
  });

  test("the design's bounds: one to three photos", () => {
    expect(MIN_POD_PHOTOS).toBe(1);
    expect(MAX_POD_PHOTOS).toBe(3);
  });
});

test.describe("content types", () => {
  test("a photo may be JPEG or PNG", () => {
    expect(isAllowedPodContentType("PHOTO", "image/jpeg")).toBe(true);
    expect(isAllowedPodContentType("PHOTO", "image/png")).toBe(true);
  });

  test("a signature may be PNG only", () => {
    expect(isAllowedPodContentType("SIGNATURE", "image/png")).toBe(true);
    expect(isAllowedPodContentType("SIGNATURE", "image/jpeg")).toBe(false);
  });

  for (const kind of ["PHOTO", "SIGNATURE"] as const) {
    for (const contentType of [
      // An SVG opened top-level from a signed URL runs script on the Storage
      // origin — the reason the signature is PNG though the design allows SVG.
      "image/svg+xml",
      "text/html",
      "application/pdf",
      "image/heic",
      "image/gif",
      "",
      // Exact match only: no parameters, no case folding, no prefix.
      "image/png; charset=utf-8",
      "IMAGE/PNG",
      "image/pngx",
    ]) {
      test(`a ${kind} may not be ${JSON.stringify(contentType)}`, () => {
        expect(isAllowedPodContentType(kind, contentType)).toBe(false);
      });
    }
  }

  test("isPodKind accepts the two kinds and nothing else", () => {
    expect(isPodKind("PHOTO")).toBe(true);
    expect(isPodKind("SIGNATURE")).toBe(true);

    for (const value of ["photo", "VIDEO", "", null, undefined, 1, {}]) {
      expect(isPodKind(value)).toBe(false);
    }
  });
});

test.describe("size limits", () => {
  test("10 MB for a photo, 1 MB for a signature", () => {
    expect(maxPodBytes("PHOTO")).toBe(10 * 1024 * 1024);
    expect(maxPodBytes("SIGNATURE")).toBe(1024 * 1024);
    expect(MAX_POD_PHOTO_BYTES).toBe(maxPodBytes("PHOTO"));
    expect(MAX_POD_SIGNATURE_BYTES).toBe(maxPodBytes("SIGNATURE"));
  });
});

test.describe("object paths", () => {
  test("a minted path is one the same order and kind may register", () => {
    for (const kind of ["PHOTO", "SIGNATURE"] as const) {
      const path = podObjectPath(ORDER_ID, kind, UUID, "IMG 0001 (1).jpg");

      expect(isPodObjectPath(path, ORDER_ID, kind)).toBe(true);
    }
  });

  test("names the order, then the kind, then a unique file", () => {
    expect(podObjectPath(ORDER_ID, "PHOTO", UUID, "door.jpg")).toBe(
      `${ORDER_ID}/photo/${UUID}-door.jpg`,
    );
    expect(podObjectPath(ORDER_ID, "SIGNATURE", UUID, "sig.png")).toBe(
      `${ORDER_ID}/signature/${UUID}-sig.png`,
    );
  });

  test("a path issued for another order is refused", () => {
    const path = podObjectPath("cmorder0002", "PHOTO", UUID, "door.jpg");

    expect(isPodObjectPath(path, ORDER_ID, "PHOTO")).toBe(false);
  });

  test("a photo path cannot be registered as the signature, or the reverse", () => {
    const photo = podObjectPath(ORDER_ID, "PHOTO", UUID, "door.jpg");
    const signature = podObjectPath(ORDER_ID, "SIGNATURE", UUID, "sig.png");

    expect(isPodObjectPath(photo, ORDER_ID, "SIGNATURE")).toBe(false);
    expect(isPodObjectPath(signature, ORDER_ID, "PHOTO")).toBe(false);
  });

  for (const path of [
    // Traversal, literal and percent-encoded, out of the order's own prefix.
    `${ORDER_ID}/photo/../../cmorder0002/photo/x.jpg`,
    `${ORDER_ID}/photo/..`,
    `${ORDER_ID}/photo/.`,
    `${ORDER_ID}/photo/%2e%2e%2fcmorder0002%2fphoto%2fx.jpg`,
    `${ORDER_ID}/%2e%2e/cmorder0002/photo/x.jpg`,
    // Wrong depth.
    `${ORDER_ID}/x.jpg`,
    `${ORDER_ID}/photo/a/b.jpg`,
    `${ORDER_ID}/photo/`,
    `/${ORDER_ID}/photo/x.jpg`,
    // Wrong folder, and characters `toSafePodFileName` can never emit.
    `${ORDER_ID}/video/x.mp4`,
    `${ORDER_ID}/photo/x y.jpg`,
    `${ORDER_ID}/photo/x?token=1`,
    "",
  ]) {
    test(`refuses ${JSON.stringify(path)}`, () => {
      expect(isPodObjectPath(path, ORDER_ID, "PHOTO")).toBe(false);
    });
  }

  test("an empty order id matches nothing", () => {
    expect(isPodObjectPath("/photo/x.jpg", "", "PHOTO")).toBe(false);
  });

  test("a file name cannot carry a separator into the path", () => {
    expect(toSafePodFileName("../../etc/passwd")).not.toContain("/");
    expect(toSafePodFileName("a/b\\c.jpg")).toBe("a-b-c.jpg");
    expect(toSafePodFileName("   ")).toBe("proof");
    expect(toSafePodFileName("..")).toBe("proof");
    expect(toSafePodFileName("ფოტო.jpg")).toBe("-.jpg");
  });

  test("a long file name is bounded", () => {
    expect(toSafePodFileName(`${"a".repeat(500)}.jpg`).length).toBe(80);
  });
});

test.describe("resolveTakenAt", () => {
  // The job was started at 09:00; the server receives the photo at 10:00.
  const startedAt = new Date("2026-10-02T09:00:00.000Z");
  const now = new Date("2026-10-02T10:00:00.000Z");
  const window = { startedAt, now };
  const SKEW_MINUTES = TAKEN_AT_CLOCK_SKEW_MS / 60_000;

  test("allows five minutes of clock skew at each end", () => {
    expect(SKEW_MINUTES).toBe(5);
  });

  test("falls back to the server clock when the app sends none", () => {
    expect(resolveTakenAt(undefined, window)).toBe(now);
    expect(resolveTakenAt(null, window)).toBe(now);
  });

  test("keeps a claim made during the job", () => {
    for (const claim of [
      "2026-10-02T09:00:00.000Z", // the moment it started
      "2026-10-02T09:58:30.000Z",
      "2026-10-02T10:00:00.000Z", // right now
    ]) {
      expect(resolveTakenAt(claim, window)?.toISOString()).toBe(claim);
    }
  });

  test("keeps a claim within clock skew of either end", () => {
    for (const claim of [
      "2026-10-02T08:55:00.000Z", // exactly the skew before the start
      "2026-10-02T10:05:00.000Z", // exactly the skew ahead of the server
    ]) {
      expect(resolveTakenAt(claim, window)?.toISOString()).toBe(claim);
    }
  });

  test("records the server time for a claim from before the job was started", () => {
    // A photo "taken" before the load was picked up cannot be of its delivery.
    for (const claim of [
      "2026-10-02T08:54:59.999Z",
      "2026-10-01T10:00:00.000Z",
      "1999-12-31T23:59:59.000Z",
    ]) {
      expect(resolveTakenAt(claim, window)).toBe(now);
    }
  });

  test("records the server time for a claim in the future — and does not refuse it", () => {
    // It used to be a 400. A phone with a wrong clock must still be able to
    // prove a delivery; it just does not get to write its time into the record.
    for (const claim of ["2026-10-02T10:05:00.001Z", "2031-01-01T00:00:00Z"]) {
      expect(resolveTakenAt(claim, window)).toBe(now);
    }
  });

  test("with no recorded start, keeps only a claim within skew of the server clock", () => {
    const unknownStart = { startedAt: null, now };

    expect(
      resolveTakenAt("2026-10-02T09:56:00.000Z", unknownStart)?.toISOString(),
    ).toBe("2026-10-02T09:56:00.000Z");
    expect(resolveTakenAt("2026-10-02T09:30:00.000Z", unknownStart)).toBe(now);
  });

  for (const value of ["yesterday", "", "   ", 1_790_000_000_000, {}, true]) {
    test(`refuses ${JSON.stringify(value)}, which is not an ISO date-time`, () => {
      expect(resolveTakenAt(value, window)).toBeNull();
    });
  }
});

test.describe("the web hub's waiver", () => {
  const headers = (init: Record<string, string>) => new Headers(init);

  test("is declared by exactly one header value", () => {
    expect(
      isPodWaived(headers({ [POD_WAIVER_HEADER]: POD_WAIVER_WEB_HUB })),
    ).toBe(true);
    expect(isPodWaived(headers({ "X-Pod-Waiver": " web-hub " }))).toBe(true);
  });

  test("is not granted by default, or by any other value", () => {
    // Fail closed: the driver app sends nothing and is held to the proof.
    expect(isPodWaived(headers({}))).toBe(false);

    for (const value of ["true", "1", "app", "WEB-HUB", "web-hub,app"]) {
      expect(isPodWaived(headers({ [POD_WAIVER_HEADER]: value }))).toBe(false);
    }
  });
});

test.describe("getDriverSupportPhone", () => {
  const KEY = "DRIVER_SUPPORT_PHONE";
  const original = process.env[KEY];

  test.afterEach(() => {
    if (original === undefined) delete process.env[KEY];
    else process.env[KEY] = original;
  });

  test("is null when unset or blank — there is no default number", () => {
    delete process.env[KEY];
    expect(getDriverSupportPhone()).toBeNull();

    process.env[KEY] = "   ";
    expect(getDriverSupportPhone()).toBeNull();
  });

  test("is the configured value, trimmed and otherwise untouched", () => {
    process.env[KEY] = " +995 32 200 01 11 ";
    expect(getDriverSupportPhone()).toBe("+995 32 200 01 11");
  });
});

test.describe("src/lib/orders/pod-rules.ts", () => {
  test("has no imports, so these specs need no server", () => {
    const source = readFileSync(
      join(process.cwd(), "src", "lib", "orders", "pod-rules.ts"),
      "utf8",
    );

    expect(source).not.toMatch(/^\s*import\s/m);
  });
});
