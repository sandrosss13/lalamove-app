/**
 * The bound on signed upload URLs, pinned without a server, a database or a
 * bucket: how many may be outstanding for one order or one vehicle, when one
 * stops counting, and what the buckets themselves must enforce.
 *
 * `src/lib/uploads/rules.ts` is the single statement of each rule; the two
 * upload-URL routes and `src/lib/uploads/pending-uploads.ts` ask it for every
 * decision. The HTTP checks need a session and a database, which this suite
 * must never be pointed at by default (see `playwright.config.ts`).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import {
  MAX_POD_PHOTOS,
  MAX_POD_PHOTO_BYTES,
  isAllowedPodContentType,
} from "@/lib/orders/pod-rules";
import {
  MAX_PENDING_POD_UPLOADS,
  MAX_PENDING_VEHICLE_DOCUMENT_UPLOADS,
  REQUIRED_BUCKET_LIMITS,
  SIGNED_UPLOAD_URL_TTL_MS,
  pendingUploadDecision,
  pendingUploadExpiresAt,
} from "@/lib/uploads/rules";
import {
  MAX_VEHICLE_DOCUMENT_BYTES,
  VEHICLE_DOCUMENT_TYPES,
  isAllowedVehicleDocumentContentType,
} from "@/lib/vehicle-documents/rules";

const REPO = process.cwd();
const read = (...segments: string[]) =>
  readFileSync(join(REPO, ...segments), "utf8");

const now = new Date("2026-10-02T10:00:00.000Z");
const minutesFromNow = (minutes: number) =>
  new Date(now.getTime() + minutes * 60_000);

test.describe("how long a pending upload counts", () => {
  test("for the two hours its signed URL can be written to", () => {
    expect(SIGNED_UPLOAD_URL_TTL_MS).toBe(2 * 60 * 60 * 1000);
    expect(pendingUploadExpiresAt(now).toISOString()).toBe(
      "2026-10-02T12:00:00.000Z",
    );
  });
});

test.describe("the caps", () => {
  test("an order has room for its whole proof, retried once", () => {
    // Three photos and a signature, each attempted twice.
    expect(MAX_PENDING_POD_UPLOADS).toBe(2 * (MAX_POD_PHOTOS + 1));
  });

  test("a vehicle has room for each document attempted three times", () => {
    expect(MAX_PENDING_VEHICLE_DOCUMENT_UPLOADS).toBe(
      3 * VEHICLE_DOCUMENT_TYPES.length,
    );
  });
});

test.describe("pendingUploadDecision", () => {
  const cap = 3;

  test("allows an upload while fewer than the cap are outstanding", () => {
    for (const outstanding of [0, 1, 2]) {
      expect(
        pendingUploadDecision({
          liveExpiries: Array.from({ length: outstanding }, () =>
            minutesFromNow(60),
          ),
          cap,
          now,
        }),
      ).toEqual({ allowed: true });
    }
  });

  test("refuses at the cap, and beyond it", () => {
    for (const outstanding of [3, 4, 40]) {
      const decision = pendingUploadDecision({
        liveExpiries: Array.from({ length: outstanding }, () =>
          minutesFromNow(60),
        ),
        cap,
        now,
      });

      expect(decision.allowed).toBe(false);
    }
  });

  test("says when the soonest slot frees, whatever order the rows come in", () => {
    expect(
      pendingUploadDecision({
        liveExpiries: [
          minutesFromNow(90),
          minutesFromNow(12),
          minutesFromNow(119),
        ],
        cap,
        now,
      }),
    ).toEqual({ allowed: false, retryAfterSeconds: 12 * 60 });
  });

  test("never tells a client to retry in less than a second", () => {
    expect(
      pendingUploadDecision({
        liveExpiries: [
          new Date(now.getTime() + 1),
          minutesFromNow(5),
          minutesFromNow(5),
        ],
        cap,
        now,
      }),
    ).toEqual({ allowed: false, retryAfterSeconds: 1 });
  });

  test("a cap of zero refuses with a finite wait even with nothing outstanding", () => {
    // No row whose expiry would free a slot — and `Math.min()` of nothing is
    // Infinity, which must never reach a `Retry-After` header.
    expect(pendingUploadDecision({ liveExpiries: [], cap: 0, now })).toEqual({
      allowed: false,
      retryAfterSeconds: SIGNED_UPLOAD_URL_TTL_MS / 1000,
    });
  });
});

test.describe("what the buckets must be configured with", () => {
  test("the size limits are the ceilings registration enforces", () => {
    // An upload that is never registered is checked by the bucket alone, so
    // the two must agree: a bucket looser than the route would let an
    // abandoned upload be larger than any registered one.
    expect(REQUIRED_BUCKET_LIMITS["delivery-proofs"].fileSizeLimitBytes).toBe(
      MAX_POD_PHOTO_BYTES,
    );
    expect(REQUIRED_BUCKET_LIMITS["driver-documents"].fileSizeLimitBytes).toBe(
      MAX_VEHICLE_DOCUMENT_BYTES,
    );
  });

  test("the allowed types are exactly the ones the routes accept", () => {
    for (const type of REQUIRED_BUCKET_LIMITS["delivery-proofs"]
      .allowedMimeTypes) {
      expect(isAllowedPodContentType("PHOTO", type)).toBe(true);
    }

    for (const type of REQUIRED_BUCKET_LIMITS["driver-documents"]
      .allowedMimeTypes) {
      expect(isAllowedVehicleDocumentContentType(type)).toBe(true);
    }

    for (const bucket of Object.values(REQUIRED_BUCKET_LIMITS)) {
      expect(bucket.allowedMimeTypes).not.toContain("image/svg+xml");
      expect(bucket.public).toBe(false);
    }
  });
});

test.describe("the routes are bound to the database, not to memory", () => {
  const POD_UPLOAD = read(
    "src",
    "app",
    "api",
    "orders",
    "[id]",
    "pod",
    "upload-url",
    "route.ts",
  );
  const VEHICLE_UPLOAD = read(
    "src",
    "app",
    "api",
    "driver-profile",
    "vehicles",
    "[id]",
    "documents",
    "upload-url",
    "route.ts",
  );

  for (const [name, source] of [
    ["proof of delivery", POD_UPLOAD],
    ["vehicle documents", VEHICLE_UPLOAD],
  ] as const) {
    test(`${name}: a slot is reserved before a URL is signed`, () => {
      const reserve = source.indexOf("reservePendingUpload(");
      const sign = source.search(/await create\w+UploadUrl\(path\)/);

      expect(reserve).toBeGreaterThan(-1);
      expect(sign).toBeGreaterThan(reserve);
      expect(source).toContain('"TOO_MANY_PENDING_UPLOADS"');
      expect(source).toContain('"Retry-After"');
      expect(source).not.toContain("@/lib/rate-limit");
    });
  }

  test("registering an upload requires — and consumes — its pending row", () => {
    for (const route of [
      read("src", "app", "api", "orders", "[id]", "pod", "route.ts"),
      read(
        "src",
        "app",
        "api",
        "driver-profile",
        "vehicles",
        "[id]",
        "documents",
        "route.ts",
      ),
    ]) {
      expect(route).toContain("claimPendingUpload(");
    }
  });

  test("a vehicle's document objects are removed with it, after the database", () => {
    const route = read(
      "src",
      "app",
      "api",
      "driver-profile",
      "vehicles",
      "[id]",
      "route.ts",
    );
    const handler = route.slice(
      route.indexOf("export async function DELETE("),
      route.indexOf("export async function PATCH("),
    );

    const remove = handler.indexOf("tx.vehicle.delete(");
    const discard = handler.indexOf("discardVehicleDocumentObjects(");

    expect(handler).toContain("documents: { select: { storagePath: true } }");
    expect(handler).toContain(
      "pendingUploads: { select: { storagePath: true } }",
    );
    expect(remove).toBeGreaterThan(-1);
    // Files strictly after the commit: a Storage failure can leave an orphan,
    // never a vehicle whose documents point at nothing.
    expect(discard).toBeGreaterThan(remove);
  });
});

test("the rules module has no runtime imports", () => {
  expect(read("src", "lib", "uploads", "rules.ts")).not.toMatch(
    /^\s*import\s/m,
  );
});
