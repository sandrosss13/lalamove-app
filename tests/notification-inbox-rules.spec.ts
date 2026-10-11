/**
 * The rules of the driver's notification inbox, pinned without a server or a
 * database: which language an entry is written in, how a page is asked for,
 * what a "mark as read" body may hold, and what an entry looks like on the
 * wire.
 */

import { expect, test } from "@playwright/test";

import {
  DEFAULT_INBOX_LOCALE,
  DEFAULT_INBOX_PAGE_SIZE,
  MAX_INBOX_PAGE_SIZE,
  MAX_MARK_READ_IDS,
  parseInboxCursor,
  parseInboxLimit,
  parseMarkReadBody,
  pickInboxLocale,
  toHubDriverNotification,
  toInboxPage,
} from "@/lib/notifications/inbox-rules";
import {
  buildOfferPushMessage,
  buildRouteAlertPushMessage,
  offerPushData,
  routeAlertPushData,
} from "@/lib/push/rules";

test("the bounds are constants", () => {
  expect(DEFAULT_INBOX_PAGE_SIZE).toBe(20);
  expect(MAX_INBOX_PAGE_SIZE).toBe(50);
  expect(MAX_MARK_READ_IDS).toBe(200);
  // The platform default (`DEFAULT_LOCALE` is "ka").
  expect(DEFAULT_INBOX_LOCALE).toBe("KA");
});

test("an entry's data is exactly its push's data", () => {
  const copy = { token: "ExpoPushToken[x]", title: "t", body: "b" };

  expect(
    buildOfferPushMessage({ ...copy, offerId: "o1", ttlSeconds: 30 }).data,
  ).toEqual(offerPushData("o1"));
  expect(
    buildRouteAlertPushMessage({
      ...copy,
      alertId: "a1",
      orderId: "r1",
      ttlSeconds: 60,
    }).data,
  ).toEqual(routeAlertPushData("a1", "r1"));
});

test.describe("pickInboxLocale", () => {
  test("is the platform default with no device", () => {
    expect(pickInboxLocale([])).toBe("KA");
  });

  test("is the most recently seen device's language", () => {
    expect(
      pickInboxLocale([
        { locale: "KA", lastSeenAt: new Date("2026-10-01T00:00:00Z") },
        { locale: "EN", lastSeenAt: new Date("2026-10-09T00:00:00Z") },
        { locale: "KA", lastSeenAt: new Date("2026-10-05T00:00:00Z") },
      ]),
    ).toBe("EN");
  });
});

test.describe("parseInboxLimit", () => {
  test("defaults when missing or garbled", () => {
    for (const raw of [null, "", "abc", "-3", "2.5", "1e3"]) {
      expect(parseInboxLimit(raw)).toBe(DEFAULT_INBOX_PAGE_SIZE);
    }
  });

  test("clamps to 1..50", () => {
    expect(parseInboxLimit("0")).toBe(1);
    expect(parseInboxLimit("1")).toBe(1);
    expect(parseInboxLimit("35")).toBe(35);
    expect(parseInboxLimit("50")).toBe(50);
    expect(parseInboxLimit("5000")).toBe(50);
  });
});

test.describe("parseInboxCursor", () => {
  test("is the trimmed id, or null", () => {
    expect(parseInboxCursor(null)).toBeNull();
    expect(parseInboxCursor("   ")).toBeNull();
    expect(parseInboxCursor("x".repeat(65))).toBeNull();
    expect(parseInboxCursor(" cmabc123 ")).toBe("cmabc123");
  });
});

test.describe("parseMarkReadBody", () => {
  test("no body, {}, null or [] ids is every entry", () => {
    expect(parseMarkReadBody(undefined)).toEqual({ ids: "ALL" });
    expect(parseMarkReadBody({})).toEqual({ ids: "ALL" });
    expect(parseMarkReadBody({ ids: null })).toEqual({ ids: "ALL" });
    expect(parseMarkReadBody({ ids: [] })).toEqual({ ids: "ALL" });
  });

  test("names entries, once each", () => {
    expect(parseMarkReadBody({ ids: ["a", "b", "a"] })).toEqual({
      ids: ["a", "b"],
    });
  });

  test("refuses a body that is not an object", () => {
    for (const body of [null, [], "ids", 3]) {
      expect(parseMarkReadBody(body)).toEqual({
        refusal: "BODY_NOT_AN_OBJECT",
      });
    }
  });

  test("refuses ids that are not a list of ids", () => {
    for (const ids of ["a", 3, [1], ["a", ""], [null], ["x".repeat(65)]]) {
      expect(parseMarkReadBody({ ids })).toEqual({
        refusal: "IDS_NOT_A_LIST",
      });
    }
  });

  test("refuses more than the cap", () => {
    const ids = Array.from(
      { length: MAX_MARK_READ_IDS + 1 },
      (_, i) => `n${i}`,
    );

    expect(parseMarkReadBody({ ids })).toEqual({ refusal: "TOO_MANY_IDS" });
    expect(parseMarkReadBody({ ids: ids.slice(1) })).toEqual({
      ids: ids.slice(1),
    });
  });
});

test.describe("toHubDriverNotification", () => {
  const row = {
    id: "n1",
    type: "LOAD_OFFER" as const,
    title: "New load offer",
    body: "Open the app to respond before it expires.",
    data: offerPushData("offer1"),
    readAt: null,
    createdAt: new Date("2026-10-11T08:00:00.000Z"),
  };

  test("carries the push's data and ISO timestamps", () => {
    expect(toHubDriverNotification(row)).toEqual({
      id: "n1",
      type: "LOAD_OFFER",
      title: "New load offer",
      body: "Open the app to respond before it expires.",
      data: { type: "LOAD_OFFER", offerId: "offer1" },
      createdAt: "2026-10-11T08:00:00.000Z",
      readAt: null,
    });

    expect(
      toHubDriverNotification({
        ...row,
        type: "ROUTE_ALERT",
        data: routeAlertPushData("alert1", "order1"),
        readAt: new Date("2026-10-11T09:00:00.000Z"),
      }),
    ).toMatchObject({
      data: { type: "ROUTE_ALERT", alertId: "alert1", orderId: "order1" },
      readAt: "2026-10-11T09:00:00.000Z",
    });
  });

  test("answers anything but a plain object as null data", () => {
    for (const data of [null, [1], "x", 3]) {
      expect(toHubDriverNotification({ ...row, data }).data).toBeNull();
    }
  });
});

test.describe("toInboxPage", () => {
  const rows = ["a", "b", "c"].map((id) => ({ id }));

  test("a short read is the last page", () => {
    expect(toInboxPage(rows, 3)).toEqual({ page: rows, nextCursor: null });
    expect(toInboxPage([], 3)).toEqual({ page: [], nextCursor: null });
  });

  test("the extra row means there is a next page, after the last shown", () => {
    expect(toInboxPage(rows, 2)).toEqual({
      page: rows.slice(0, 2),
      nextCursor: "b",
    });
  });
});
