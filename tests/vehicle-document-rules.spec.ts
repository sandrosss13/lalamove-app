/**
 * The rules of vehicle documents (registration, insurance), pinned without a
 * server, a database or a bucket: what may be uploaded and where it may live,
 * how a document's state is read off its rows, which expiry dates a reviewer
 * may approve with, and what a driver is told needs attention.
 *
 * `src/lib/vehicle-documents/rules.ts` is the single statement of each rule —
 * the driver routes, the admin review route and the hub's attention summary all
 * ask it — so a rule pinned here is the rule the HTTP surface applies.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import {
  DOCUMENT_EXPIRY_WARNING_DAYS,
  MAX_VEHICLE_DOCUMENT_BYTES,
  VEHICLE_DOCUMENT_TYPES,
  attentionForLicence,
  attentionForSlot,
  daysUntilExpiry,
  expiryDateToInstant,
  expiryRefusalFor,
  instantToExpiryDate,
  isAllowedVehicleDocumentContentType,
  isExpiryRequired,
  isVehicleDocumentObjectPath,
  isVehicleDocumentType,
  parseExpiryDate,
  summarizeVehicleDocuments,
  toAttentionSummary,
  toSafeVehicleDocumentFileName,
  validityOf,
  vehicleDocumentObjectPath,
  type LiveVehicleDocument,
} from "@/lib/vehicle-documents/rules";

const VEHICLE_ID = "cmvehicle0001";
const UUID = "3f2b8c1e-0000-4000-8000-000000000001";
const TODAY = "2026-10-02";
const VEHICLE = { id: VEHICLE_ID, plateNumber: "AA-001-AA" };

/** A live row, with the fields a test does not care about filled in. */
function row(
  overrides: Partial<LiveVehicleDocument> & Pick<LiveVehicleDocument, "id">,
): LiveVehicleDocument {
  return {
    type: "INSURANCE",
    status: "PENDING",
    flagReason: null,
    expiresAt: null,
    uploadedAt: "2026-10-01T08:00:00.000Z",
    reviewedAt: null,
    ...overrides,
  };
}

/** The insurance slot of a summary. */
function insuranceSlot(rows: LiveVehicleDocument[]) {
  const slot = summarizeVehicleDocuments(rows, TODAY).find(
    (candidate) => candidate.type === "INSURANCE",
  );

  if (slot === undefined) {
    throw new Error("summarizeVehicleDocuments returned no insurance slot");
  }

  return slot;
}

test.describe("what may be uploaded", () => {
  test("only the two document types are recognised", () => {
    expect(VEHICLE_DOCUMENT_TYPES).toEqual(["REGISTRATION", "INSURANCE"]);
    expect(isVehicleDocumentType("INSURANCE")).toBe(true);
    expect(isVehicleDocumentType("insurance")).toBe(false);
    expect(isVehicleDocumentType("LICENCE_FRONT")).toBe(false);
    expect(isVehicleDocumentType(undefined)).toBe(false);
  });

  test("JPG and PNG only — never SVG, HTML or PDF", () => {
    expect(isAllowedVehicleDocumentContentType("image/jpeg")).toBe(true);
    expect(isAllowedVehicleDocumentContentType("image/png")).toBe(true);
    for (const refused of [
      "image/svg+xml",
      "text/html",
      "application/pdf",
      "image/gif",
      "",
    ]) {
      expect(isAllowedVehicleDocumentContentType(refused)).toBe(false);
    }
  });

  test("the size cap is 10 MB", () => {
    expect(MAX_VEHICLE_DOCUMENT_BYTES).toBe(10 * 1024 * 1024);
  });
});

test.describe("object paths", () => {
  test("a minted path is namespaced by vehicle and type", () => {
    expect(
      vehicleDocumentObjectPath(VEHICLE_ID, "INSURANCE", UUID, "policy.jpg"),
    ).toBe(`vehicles/${VEHICLE_ID}/insurance/${UUID}-policy.jpg`);
  });

  test("a file name cannot escape its folder", () => {
    expect(toSafeVehicleDocumentFileName("../../etc/passwd")).not.toContain(
      "/",
    );
    expect(toSafeVehicleDocumentFileName("   ")).toBe("document");
    expect(toSafeVehicleDocumentFileName("..")).toBe("document");
  });

  test("a minted path is accepted for its own vehicle and type", () => {
    const path = vehicleDocumentObjectPath(
      VEHICLE_ID,
      "INSURANCE",
      UUID,
      "policy.jpg",
    );

    expect(isVehicleDocumentObjectPath(path, VEHICLE_ID, "INSURANCE")).toBe(
      true,
    );
  });

  test("another vehicle's path, another type's, and an onboarding path are refused", () => {
    const path = vehicleDocumentObjectPath(
      VEHICLE_ID,
      "INSURANCE",
      UUID,
      "policy.jpg",
    );

    expect(isVehicleDocumentObjectPath(path, "cmother", "INSURANCE")).toBe(
      false,
    );
    expect(isVehicleDocumentObjectPath(path, VEHICLE_ID, "REGISTRATION")).toBe(
      false,
    );
    // An onboarding document: `<driverProfileId>/<uuid>-<name>`.
    expect(
      isVehicleDocumentObjectPath(
        `cmprofile0001/${UUID}-licence.jpg`,
        VEHICLE_ID,
        "INSURANCE",
      ),
    ).toBe(false);
  });

  test("traversal, literal or percent-encoded, is refused", () => {
    for (const path of [
      `vehicles/${VEHICLE_ID}/insurance/../../other/insurance/x.jpg`,
      `vehicles/${VEHICLE_ID}/insurance/..`,
      `vehicles/${VEHICLE_ID}/insurance/%2e%2e%2fx.jpg`,
      `vehicles/${VEHICLE_ID}/insurance/a/b.jpg`,
      `vehicles/${VEHICLE_ID}/insurance/`,
      `vehicles//insurance/x.jpg`,
    ]) {
      expect(isVehicleDocumentObjectPath(path, VEHICLE_ID, "INSURANCE")).toBe(
        false,
      );
    }

    expect(
      isVehicleDocumentObjectPath("vehicles//insurance/x.jpg", "", "INSURANCE"),
    ).toBe(false);
  });
});

test.describe("expiry dates", () => {
  test("only a real YYYY-MM-DD date parses", () => {
    expect(parseExpiryDate("2027-03-31")).toBe("2027-03-31");
    for (const refused of [
      "2027-02-30",
      "2027-13-01",
      "31/03/2027",
      "2027-03-31T00:00:00.000Z",
      "",
      null,
      20270331,
    ]) {
      expect(parseExpiryDate(refused)).toBeNull();
    }
  });

  test("a date round-trips through its stored instant", () => {
    const instant = expiryDateToInstant("2027-03-31");

    expect(instant.toISOString()).toBe("2027-03-31T00:00:00.000Z");
    expect(instantToExpiryDate(instant)).toBe("2027-03-31");
  });

  test("days are counted to the expiry day itself", () => {
    expect(daysUntilExpiry("2026-10-22", TODAY)).toBe(20);
    expect(daysUntilExpiry(TODAY, TODAY)).toBe(0);
    expect(daysUntilExpiry("2026-10-01", TODAY)).toBe(-1);
  });

  test("a document is valid through its expiry day, and expiring inside the window", () => {
    expect(DOCUMENT_EXPIRY_WARNING_DAYS).toBe(30);
    expect(validityOf(null, TODAY)).toBe("VALID");
    expect(validityOf("2026-11-02", TODAY)).toBe("VALID"); // 31 days
    expect(validityOf("2026-11-01", TODAY)).toBe("EXPIRING"); // 30 days
    expect(validityOf(TODAY, TODAY)).toBe("EXPIRING"); // the last valid day
    expect(validityOf("2026-10-01", TODAY)).toBe("EXPIRED");
  });

  test("insurance needs an expiry to be approved; a registration does not", () => {
    expect(isExpiryRequired("INSURANCE")).toBe(true);
    expect(isExpiryRequired("REGISTRATION")).toBe(false);
    expect(expiryRefusalFor("INSURANCE", null, TODAY)).toBe("EXPIRY_REQUIRED");
    expect(expiryRefusalFor("REGISTRATION", null, TODAY)).toBeNull();
    expect(expiryRefusalFor("INSURANCE", "2027-10-01", TODAY)).toBeNull();
  });

  test("a date already past cannot be approved; today can", () => {
    expect(expiryRefusalFor("INSURANCE", "2026-10-01", TODAY)).toBe(
      "EXPIRY_IN_PAST",
    );
    expect(expiryRefusalFor("REGISTRATION", "2026-10-01", TODAY)).toBe(
      "EXPIRY_IN_PAST",
    );
    expect(expiryRefusalFor("INSURANCE", TODAY, TODAY)).toBeNull();
  });
});

test.describe("summarizeVehicleDocuments", () => {
  test("a vehicle with no rows has both slots, both MISSING", () => {
    expect(summarizeVehicleDocuments([], TODAY)).toEqual([
      {
        type: "REGISTRATION",
        state: "MISSING",
        onFile: null,
        submission: null,
      },
      { type: "INSURANCE", state: "MISSING", onFile: null, submission: null },
    ]);
  });

  test("a first upload is UNDER_REVIEW with nothing on file", () => {
    const slot = insuranceSlot([row({ id: "new" })]);

    expect(slot.state).toBe("UNDER_REVIEW");
    expect(slot.onFile).toBeNull();
    expect(slot.submission?.id).toBe("new");
  });

  test("an approved document is read by the calendar", () => {
    const approved = (expiresAt: string | null) =>
      insuranceSlot([
        row({
          id: "ok",
          status: "APPROVED",
          expiresAt,
          reviewedAt: "2026-09-01T00:00:00.000Z",
        }),
      ]);

    expect(approved("2027-06-01").state).toBe("VALID");
    expect(approved("2026-10-22").state).toBe("EXPIRING");
    expect(approved("2026-10-22").onFile?.daysUntilExpiry).toBe(20);
    expect(approved("2026-09-30").state).toBe("EXPIRED");
    expect(approved(null).state).toBe("VALID");
    expect(approved(null).onFile?.daysUntilExpiry).toBeNull();
  });

  test("a renewal under review does not displace the document on file", () => {
    const slot = insuranceSlot([
      row({
        id: "old",
        status: "APPROVED",
        expiresAt: "2026-10-22",
        uploadedAt: "2025-10-20T08:00:00.000Z",
        reviewedAt: "2025-10-21T08:00:00.000Z",
      }),
      row({ id: "renewal", uploadedAt: "2026-10-02T08:00:00.000Z" }),
    ]);

    expect(slot.state).toBe("UNDER_REVIEW");
    expect(slot.onFile?.id).toBe("old");
    expect(slot.onFile?.validity).toBe("EXPIRING");
    expect(slot.submission?.id).toBe("renewal");
  });

  test("a flagged upload reports FLAGGED and carries its reason", () => {
    const slot = insuranceSlot([
      row({ id: "bad", status: "FLAGGED", flagReason: "Photo is blurry" }),
    ]);

    expect(slot.state).toBe("FLAGGED");
    expect(slot.submission).toMatchObject({
      status: "FLAGGED",
      flagReason: "Photo is blurry",
    });
  });

  test("one type's rows never bleed into the other's slot", () => {
    const [registration, insurance] = summarizeVehicleDocuments(
      [row({ id: "ins", type: "INSURANCE" })],
      TODAY,
    );

    expect(registration?.state).toBe("MISSING");
    expect(insurance?.state).toBe("UNDER_REVIEW");
  });
});

test.describe("what needs attention", () => {
  test("missing → under review → approved → expiring → expired", () => {
    const missing = attentionForSlot(insuranceSlot([]), VEHICLE);
    expect(missing).toMatchObject({
      document: "VEHICLE_INSURANCE",
      reason: "MISSING",
      underReview: false,
      vehicleId: VEHICLE_ID,
      plateNumber: "AA-001-AA",
    });

    const underReview = attentionForSlot(
      insuranceSlot([row({ id: "new" })]),
      VEHICLE,
    );
    expect(underReview).toMatchObject({ reason: "MISSING", underReview: true });

    const approved = (expiresAt: string) =>
      attentionForSlot(
        insuranceSlot([row({ id: "ok", status: "APPROVED", expiresAt })]),
        VEHICLE,
      );

    expect(approved("2027-06-01")).toBeNull();
    expect(approved("2026-10-22")).toMatchObject({
      reason: "EXPIRING",
      expiresAt: "2026-10-22",
      daysUntilExpiry: 20,
    });
    expect(approved("2026-09-30")).toMatchObject({
      reason: "EXPIRED",
      daysUntilExpiry: -2,
    });
  });

  test("a valid document with a renewal under review needs nothing", () => {
    expect(
      attentionForSlot(
        insuranceSlot([
          row({ id: "ok", status: "APPROVED", expiresAt: "2027-06-01" }),
          row({ id: "renewal" }),
        ]),
        VEHICLE,
      ),
    ).toBeNull();
  });

  test("an expiring document whose renewal is uploaded is marked underReview", () => {
    expect(
      attentionForSlot(
        insuranceSlot([
          row({ id: "ok", status: "APPROVED", expiresAt: "2026-10-22" }),
          row({ id: "renewal" }),
        ]),
        VEHICLE,
      ),
    ).toMatchObject({ reason: "EXPIRING", underReview: true });
  });

  test("a flagged upload is reported even over a valid document on file", () => {
    expect(
      attentionForSlot(
        insuranceSlot([
          row({ id: "ok", status: "APPROVED", expiresAt: "2027-06-01" }),
          row({ id: "bad", status: "FLAGGED", flagReason: "Document expired" }),
        ]),
        VEHICLE,
      ),
    ).toMatchObject({
      reason: "FLAGGED",
      flagReason: "Document expired",
      expiresAt: "2027-06-01",
      underReview: false,
    });
  });

  test("the licence is only ever expiring or expired", () => {
    expect(attentionForLicence(null, TODAY)).toBeNull();
    expect(attentionForLicence("2031-06-30", TODAY)).toBeNull();
    expect(attentionForLicence("2026-10-12", TODAY)).toMatchObject({
      document: "DRIVING_LICENCE",
      reason: "EXPIRING",
      vehicleId: null,
      daysUntilExpiry: 10,
    });
    expect(attentionForLicence("2026-01-01", TODAY)?.reason).toBe("EXPIRED");
  });

  test("the summary orders by urgency and counts only actionable items", () => {
    const item = (rows: LiveVehicleDocument[]) => {
      const result = attentionForSlot(insuranceSlot(rows), VEHICLE);
      if (result === null) throw new Error("expected an attention item");
      return result;
    };

    const summary = toAttentionSummary([
      item([row({ id: "a", status: "APPROVED", expiresAt: "2026-10-22" })]),
      item([
        row({ id: "b", status: "FLAGGED", flagReason: "Photo is blurry" }),
      ]),
      item([row({ id: "c" })]), // missing, renewal under review
      item([row({ id: "d", status: "APPROVED", expiresAt: "2026-09-01" })]),
    ]);

    expect(summary.expiryWarningDays).toBe(DOCUMENT_EXPIRY_WARNING_DAYS);
    expect(summary.items.map((entry) => entry.reason)).toEqual([
      "EXPIRED",
      "MISSING",
      "FLAGGED",
      "EXPIRING",
    ]);
    expect(summary.actionRequiredCount).toBe(3);
  });
});

test("the rules module has no runtime imports", () => {
  const source = readFileSync(
    join(process.cwd(), "src", "lib", "vehicle-documents", "rules.ts"),
    "utf8",
  );

  expect(source).not.toMatch(/^\s*import\s/m);
});
