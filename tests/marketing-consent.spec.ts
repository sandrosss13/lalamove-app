/**
 * The client marketing-consent rules (`src/lib/client-profile/
 * marketing-consent.ts`) and the CRM audience gate built on them
 * (`src/lib/crm/marketing-audience.ts`).
 *
 * Pure, like `tests/client-legal-address.spec.ts`: no browser, no server, no
 * database. The routes map the reason code onto catalog keys, and the policy
 * link points at a seeded static page, so both are checked against the files
 * that must provide them — a typo'd key would render raw, a missing seed row
 * would make the link a 404.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import {
  DEFAULT_MARKETING_CONSENT,
  MARKETING_PRIVACY_POLICY_HREF,
  MARKETING_PRIVACY_POLICY_SLUG,
  parseMarketingConsent,
  shouldRecordMarketingConsent,
} from "@/lib/client-profile/marketing-consent";
import {
  MARKETABLE_CLIENT_WHERE,
  marketingAudienceWhere,
} from "@/lib/crm/marketing-audience";

test.describe("parseMarketingConsent", () => {
  test("absent means 'not answered' and leaves the stored value alone", () => {
    expect(parseMarketingConsent(undefined)).toEqual({
      marketingConsent: undefined,
    });
  });

  test("a boolean is the answer", () => {
    expect(parseMarketingConsent(true)).toEqual({ marketingConsent: true });
    expect(parseMarketingConsent(false)).toEqual({ marketingConsent: false });
  });

  test("nothing else is coerced into an answer", () => {
    for (const value of [null, "true", "false", 1, 0, "", {}, []]) {
      expect(parseMarketingConsent(value)).toEqual({ error: "notABoolean" });
    }
  });
});

test.describe("shouldRecordMarketingConsent", () => {
  test("a new profile always records its answer", () => {
    expect(shouldRecordMarketingConsent(null, true)).toBe(true);
    expect(shouldRecordMarketingConsent(null, false)).toBe(true);
  });

  test("an existing profile records only a change", () => {
    expect(shouldRecordMarketingConsent(true, false)).toBe(true);
    expect(shouldRecordMarketingConsent(false, true)).toBe(true);
    expect(shouldRecordMarketingConsent(true, true)).toBe(false);
    expect(shouldRecordMarketingConsent(false, false)).toBe(false);
  });
});

test("consent is on by default, matching the column default", () => {
  expect(DEFAULT_MARKETING_CONSENT).toBe(true);

  const schema = readFileSync(
    join(process.cwd(), "prisma", "schema.prisma"),
    "utf8",
  );
  expect(schema).toMatch(/marketingConsent\s+Boolean\s+@default\(true\)/);
});

test.describe("CRM audience gate", () => {
  test("only consenting clients are marketable", () => {
    expect(MARKETABLE_CLIENT_WHERE).toEqual({
      role: "CLIENT",
      deactivatedAt: null,
      clientProfile: { is: { marketingConsent: true } },
    });
  });

  test("a segment filter is AND-ed in, never merged over the gate", () => {
    // A segment that names its own `clientProfile` filter must not replace
    // the consent clause, which a spread would do.
    const segment = { clientProfile: { is: { accountType: "BUSINESS" } } };
    expect(
      marketingAudienceWhere(
        segment as Parameters<typeof marketingAudienceWhere>[0],
      ),
    ).toEqual({ AND: [MARKETABLE_CLIENT_WHERE, segment] });
    expect(marketingAudienceWhere()).toEqual({
      AND: [MARKETABLE_CLIENT_WHERE, {}],
    });
  });
});

test("the policy page is seeded, published, in both content locales", () => {
  expect(MARKETING_PRIVACY_POLICY_HREF).toBe(
    `/pages/${MARKETING_PRIVACY_POLICY_SLUG}`,
  );

  const migration = readFileSync(
    join(
      process.cwd(),
      "prisma",
      "migrations",
      "20261023100000_marketing_consent",
      "migration.sql",
    ),
    "utf8",
  );

  for (const locale of ["EN", "KA"]) {
    expect(migration).toContain(
      `'${MARKETING_PRIVACY_POLICY_SLUG}', '${locale}'::"ContentLocale"`,
    );
  }
  expect(migration).toContain('ON CONFLICT ("slug", "locale") DO NOTHING');
});

test("every catalog key the feature renders exists in both locales", () => {
  const keys: [file: string, path: string[]][] = [
    ["common", ["marketingConsent", "statement"]],
    ["account", ["accountMarketingConsentCard", "title"]],
    ["account", ["accountMarketingConsentCard", "saved"]],
    ["account", ["accountMarketingConsentCard", "couldNotSave"]],
    ["errors", ["clientProfile", "marketingConsentMustBeABoolean"]],
    ["errors", ["clientProfile", "clientProfileNotFound"]],
  ];

  for (const locale of ["en", "ka"]) {
    for (const [file, path] of keys) {
      const catalog = JSON.parse(
        readFileSync(
          join(process.cwd(), "src", "messages", locale, `${file}.json`),
          "utf8",
        ),
      ) as Record<string, unknown>;
      const value = path.reduce<unknown>(
        (node, key) => (node as Record<string, unknown> | undefined)?.[key],
        catalog,
      );
      expect({ locale, file, path, type: typeof value }).toEqual({
        locale,
        file,
        path,
        type: "string",
      });
    }
  }

  // The link is a rich-text tag; both translations must carry it.
  for (const locale of ["en", "ka"]) {
    const common = JSON.parse(
      readFileSync(
        join(process.cwd(), "src", "messages", locale, "common.json"),
        "utf8",
      ),
    ) as { marketingConsent: { statement: string } };
    expect(common.marketingConsent.statement).toMatch(
      /<policy>[^<]+<\/policy>/,
    );
  }
});
