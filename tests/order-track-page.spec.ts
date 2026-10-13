/**
 * Who the order tracking page (`/orders/[id]/track`) is for, and which of its
 * sections each reader gets — `src/lib/orders/track-page.ts`.
 *
 * The rule that matters most here is the proof of delivery: the recipient's
 * signature and the drop-off photos are rendered as short-lived signed URLs,
 * and a URL is a bearer token. The page only queries and signs them when
 * `trackPageSections` says `proofOfDelivery`, so if that flag were ever true
 * for the driver (or `resolveTrackPageViewer` admitted an account with no claim
 * on the order) the page would hand them out. These specs pin both.
 *
 * Pure functions over literals, the same shape as `job-sheet-access.spec.ts`:
 * the module carries no runtime imports, so nothing here touches a database or
 * starts a browser. The end-to-end half — real sessions against a running
 * server — is `order-track-pod-access.spec.ts`.
 */

import type { OrderStatus } from "@prisma/client";
import { expect, test } from "@playwright/test";

import {
  isLiveTrackingStatus,
  resolveTrackPageViewer,
  trackPageSections,
} from "@/lib/orders/track-page";

const CLIENT = "user_client_tegeta";
const DRIVER = "user_driver_nino";
const STRANGER = "user_fleet_owner";

const ALL_STATUSES: OrderStatus[] = [
  "INITIATED",
  "PENDING",
  "CLAIMED",
  "ACCEPTED",
  "IN_TRANSIT",
  "COMPLETED",
  "CANCELLED",
];

test.describe("resolveTrackPageViewer", () => {
  const order = { clientId: CLIENT, driverId: DRIVER };

  test("recognises the client and the assigned driver", () => {
    expect(resolveTrackPageViewer(order, CLIENT)).toBe("CLIENT");
    expect(resolveTrackPageViewer(order, DRIVER)).toBe("DRIVER");
  });

  test("admits nobody else — the carrier company's own account included", () => {
    expect(resolveTrackPageViewer(order, STRANGER)).toBeNull();
    expect(resolveTrackPageViewer(order, "")).toBeNull();
  });

  test("an unassigned order has no driver reader", () => {
    expect(
      resolveTrackPageViewer({ clientId: CLIENT, driverId: null }, DRIVER),
    ).toBeNull();
  });

  test("an account that is both reads the client's page", () => {
    expect(
      resolveTrackPageViewer({ clientId: CLIENT, driverId: CLIENT }, CLIENT),
    ).toBe("CLIENT");
  });
});

test.describe("trackPageSections — proof of delivery", () => {
  const base = {
    isBusinessClient: true,
    documentAvailable: true,
  };

  test("the client sees it on a completed order, with or without proof", () => {
    for (const hasProof of [true, false]) {
      expect(
        trackPageSections({
          ...base,
          viewer: "CLIENT",
          status: "COMPLETED",
          hasProof,
        }).proofOfDelivery,
      ).toBe(true);
    }
  });

  test("the client sees it before completion only once proof exists", () => {
    expect(
      trackPageSections({
        ...base,
        viewer: "CLIENT",
        status: "IN_TRANSIT",
        hasProof: true,
      }).proofOfDelivery,
    ).toBe(true);
    expect(
      trackPageSections({
        ...base,
        viewer: "CLIENT",
        status: "IN_TRANSIT",
        hasProof: false,
      }).proofOfDelivery,
    ).toBe(false);
  });

  test("the driver never gets it, in any status", () => {
    for (const status of ALL_STATUSES) {
      for (const hasProof of [true, false]) {
        expect(
          trackPageSections({ ...base, viewer: "DRIVER", status, hasProof })
            .proofOfDelivery,
        ).toBe(false);
      }
    }
  });
});

test.describe("trackPageSections — order-details document", () => {
  test("only a BUSINESS client, only when a document exists", () => {
    const sections = (
      viewer: "CLIENT" | "DRIVER",
      isBusinessClient: boolean,
      documentAvailable: boolean,
    ) =>
      trackPageSections({
        viewer,
        status: "COMPLETED",
        hasProof: true,
        isBusinessClient,
        documentAvailable,
      }).serviceDocument;

    expect(sections("CLIENT", true, true)).toBe(true);
    expect(sections("CLIENT", false, true)).toBe(false);
    expect(sections("CLIENT", true, false)).toBe(false);
    expect(sections("DRIVER", true, true)).toBe(false);
  });
});

test.describe("trackPageSections — map and status panels", () => {
  test("the live map only while a driver is on the job", () => {
    expect(ALL_STATUSES.filter(isLiveTrackingStatus)).toEqual([
      "ACCEPTED",
      "IN_TRANSIT",
    ]);
  });

  test("exactly one of map / waiting / cancelled / delivered per status", () => {
    for (const status of ALL_STATUSES) {
      const s = trackPageSections({
        viewer: "CLIENT",
        status,
        hasProof: false,
        isBusinessClient: false,
        documentAvailable: false,
      });
      const shown = [
        s.liveMap,
        s.waitingNotice,
        s.cancelledNotice,
        s.delivered,
      ].filter(Boolean);
      expect(shown, status).toHaveLength(1);
    }
  });
});
