/**
 * The rules of a driver's support message, pinned without a server or a
 * database: the topic list, the body limits, and the rate-limit budget.
 *
 * `src/lib/support/rules.ts` is the single statement of each —
 * `POST /api/dashboard/hub/support/messages` asks it for every decision.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import {
  MAX_SUPPORT_MESSAGE_LENGTH,
  SUPPORT_MESSAGE_HISTORY_LIMIT,
  SUPPORT_MESSAGE_RATE_LIMIT,
  isSupportRateLimited,
  supportRateWindowStart,
  JOB_PROBLEM_TOPICS,
  SUPPORT_SCREEN_TOPICS,
  SUPPORT_TOPICS,
  isSupportMessageStatus,
  isSupportTopic,
  parseSupportBody,
} from "@/lib/support/rules";

const REPO = process.cwd();

test("the Support screen's topics are the design's five, in the design's order", () => {
  expect(SUPPORT_SCREEN_TOPICS).toEqual([
    "PICKUP_OR_DROPOFF",
    "CARGO_DAMAGED_OR_MISSING",
    "PAYMENT_OR_WITHDRAWAL",
    "DOCUMENTS_AND_ACCOUNT",
    "OTHER",
  ]);
});

test("the report-a-problem topics are the design's seven, in the design's order", () => {
  expect(JOB_PROBLEM_TOPICS).toEqual([
    "CONTACT_UNREACHABLE",
    "ADDRESS_WRONG_OR_INACCESSIBLE",
    "CARGO_MISMATCH",
    "CARGO_DAMAGED_OR_MISSING",
    "VEHICLE_BREAKDOWN",
    "ACCIDENT",
    "OTHER",
  ]);
});

test("every topic of either screen is a real topic, and the original five still are", () => {
  for (const topic of [...SUPPORT_SCREEN_TOPICS, ...JOB_PROBLEM_TOPICS]) {
    expect(isSupportTopic(topic)).toBe(true);
  }

  expect(SUPPORT_TOPICS.slice(0, SUPPORT_SCREEN_TOPICS.length)).toEqual([
    ...SUPPORT_SCREEN_TOPICS,
  ]);
  expect(new Set(SUPPORT_TOPICS)).toEqual(
    new Set([...SUPPORT_SCREEN_TOPICS, ...JOB_PROBLEM_TOPICS]),
  );
});

test("every topic has an admin label key", () => {
  const dialog = readFileSync(
    join(
      REPO,
      "src",
      "components",
      "admin",
      "support-message-detail-dialog.tsx",
    ),
    "utf8",
  );

  for (const topic of SUPPORT_TOPICS) {
    expect(dialog).toMatch(new RegExp(`\\b${topic}:`));
  }
});

test("the topic list matches the database enum and the wire contract", () => {
  const schema = readFileSync(join(REPO, "prisma", "schema.prisma"), "utf8");
  const enumBody = /enum SupportTopic \{([^}]*)\}/.exec(schema)?.[1] ?? "";

  expect(enumBody.trim().split(/\s+/)).toEqual([...SUPPORT_TOPICS]);

  const contract = readFileSync(
    join(REPO, "src", "lib", "mobile-api", "contracts.ts"),
    "utf8",
  );
  const union = /export type SupportTopic =([^;]*);/.exec(contract)?.[1] ?? "";

  expect(union.match(/"([A-Z_]+)"/g)?.map((name) => name.slice(1, -1))).toEqual(
    [...SUPPORT_TOPICS],
  );
});

test("only a listed topic is a topic", () => {
  expect(isSupportTopic("OTHER")).toBe(true);
  expect(isSupportTopic("Something else")).toBe(false);
  expect(isSupportTopic("other")).toBe(false);
  expect(isSupportTopic(null)).toBe(false);
  expect(isSupportTopic(3)).toBe(false);
});

test("a status filter is OPEN or RESOLVED and nothing else", () => {
  expect(isSupportMessageStatus("OPEN")).toBe(true);
  expect(isSupportMessageStatus("RESOLVED")).toBe(true);
  expect(isSupportMessageStatus("CLOSED")).toBe(false);
  expect(isSupportMessageStatus(null)).toBe(false);
});

test.describe("parseSupportBody", () => {
  test("trims what it stores", () => {
    expect(parseSupportBody("  The gate was locked.\n")).toEqual({
      body: "The gate was locked.",
    });
  });

  test("keeps the driver's own line breaks", () => {
    expect(parseSupportBody("Line one\nLine two")).toEqual({
      body: "Line one\nLine two",
    });
  });

  test("whitespace, nothing, and a non-string are no message", () => {
    for (const value of ["", "   \n\t", undefined, null, 42, ["x"]]) {
      expect(parseSupportBody(value)).toEqual({ refusal: "BODY_REQUIRED" });
    }
  });

  test("the limit is 2000 characters, measured after trimming", () => {
    expect(MAX_SUPPORT_MESSAGE_LENGTH).toBe(2000);
    expect(parseSupportBody("a".repeat(2000))).toEqual({
      body: "a".repeat(2000),
    });
    expect(parseSupportBody(`  ${"a".repeat(2000)}  `)).toEqual({
      body: "a".repeat(2000),
    });
    expect(parseSupportBody("a".repeat(2001))).toEqual({
      refusal: "BODY_TOO_LONG",
    });
  });
});

test("the budget is five messages per ten minutes, and the history twenty", () => {
  expect(SUPPORT_MESSAGE_RATE_LIMIT).toEqual({
    limit: 5,
    windowMs: 600_000,
  });
  expect(SUPPORT_MESSAGE_HISTORY_LIMIT).toBe(20);
});

test.describe("the rate limit, counted from the driver's own rows", () => {
  const now = new Date("2026-10-02T10:00:00.000Z");

  test("the window is the ten minutes before now", () => {
    expect(supportRateWindowStart(now).toISOString()).toBe(
      "2026-10-02T09:50:00.000Z",
    );
  });

  test("the fifth message is sent; the sixth is refused", () => {
    // `recentCount` is how many the driver has already sent inside the window.
    for (const alreadySent of [0, 1, 4]) {
      expect(isSupportRateLimited(alreadySent)).toBe(false);
    }

    for (const alreadySent of [5, 6, 500]) {
      expect(isSupportRateLimited(alreadySent)).toBe(true);
    }
  });

  test("the route counts in the database, not in process memory", () => {
    // On serverless an in-memory counter is per instance and empties on a cold
    // start, so it bounds nothing. Pinned on the source because the difference
    // cannot be observed from one process.
    const route = readFileSync(
      join(
        REPO,
        "src",
        "app",
        "api",
        "dashboard",
        "hub",
        "support",
        "messages",
        "route.ts",
      ),
      "utf8",
    );

    expect(route).not.toContain("@/lib/rate-limit");
    expect(route).toContain("tx.supportMessage.count(");
    expect(route).toContain("pg_advisory_xact_lock");
  });
});

test("the rules module has no runtime imports", () => {
  const source = readFileSync(
    join(REPO, "src", "lib", "support", "rules.ts"),
    "utf8",
  );

  expect(source).not.toMatch(/^\s*import\s/m);
});

test("the driver route returns nothing that implies a reply is coming", () => {
  const source = readFileSync(
    join(
      REPO,
      "src",
      "app",
      "api",
      "dashboard",
      "hub",
      "support",
      "messages",
      "route.ts",
    ),
    "utf8",
  );

  // The created message is the whole 201 body — no notice, no ETA field.
  expect(source).toMatch(
    /\{ message: toSupportMessage\(toSupportMessageRecord\(created\)\) \}/,
  );
});
