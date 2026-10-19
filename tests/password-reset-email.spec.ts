/**
 * Password reset by email — who is sent a link, where it lands, and what
 * happens when the deployment cannot send mail at all.
 *
 * `@/lib/email/delivery` and `@/lib/email/password-reset` are the whole of
 * those decisions as pure functions; `src/lib/email/send-password-reset.ts`
 * only looks the account up and acts on them. They are pinned here rather
 * than through `POST /api/auth/request-password-reset` because that endpoint
 * needs a server wired to a database, and `DATABASE_URL` on this project is
 * production (see `playwright.config.ts`). The one server-side function under
 * test, `assertPasswordResetRequestAllowed`, touches no database: it decides
 * before Better Auth has looked the address up.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import {
  canDeliverEmail,
  emailDeliveryMisconfiguration,
  resolveEmailDelivery,
  wellFormedFrom,
  type EmailDeliveryEnvironment,
} from "@/lib/email/delivery";
import {
  passwordResetLink,
  passwordResetSkipReason,
  PASSWORD_RESET_TOKEN_TTL_SECONDS,
  renderPasswordResetEmail,
  resetLinkOrigin,
  type PasswordResetCandidate,
  type PasswordResetEmailCopy,
} from "@/lib/email/password-reset";
import {
  assertPasswordResetRequestAllowed,
  EMAIL_NOT_CONFIGURED_CODE,
} from "@/lib/email/send-password-reset";

const KEY = "re_test_123";
const FROM = "zomo <no-reply@zomo.ge>";

/** Nothing configured; overrides switch one piece on. */
function environment(
  overrides: Partial<EmailDeliveryEnvironment>,
): EmailDeliveryEnvironment {
  return {
    nodeEnv: undefined,
    resendApiKey: undefined,
    emailFrom: undefined,
    ...overrides,
  };
}

/** Every `NODE_ENV` a deployed or test process can have. */
const NOT_DEVELOPMENT = [undefined, "production", "test", "", "Development"];

test.describe("resolveEmailDelivery", () => {
  test("uses Resend when the key and the sender are both set", () => {
    for (const nodeEnv of ["production", "development", undefined]) {
      expect(
        resolveEmailDelivery(
          environment({ nodeEnv, resendApiKey: KEY, emailFrom: FROM }),
        ),
      ).toEqual({ mode: "PROVIDER", apiKey: KEY, from: FROM });
    }
  });

  test("trims both values", () => {
    expect(
      resolveEmailDelivery(
        environment({
          nodeEnv: "production",
          resendApiKey: `  ${KEY} `,
          emailFrom: ` ${FROM}  `,
        }),
      ),
    ).toEqual({ mode: "PROVIDER", apiKey: KEY, from: FROM });
  });

  test("logs to the console in development with no provider", () => {
    expect(
      resolveEmailDelivery(environment({ nodeEnv: "development" })),
    ).toEqual({ mode: "DEV_CONSOLE" });
  });

  test("fails closed outside development with no provider", () => {
    for (const nodeEnv of NOT_DEVELOPMENT) {
      expect(
        resolveEmailDelivery(environment({ nodeEnv })),
        String(nodeEnv),
      ).toEqual({ mode: "UNCONFIGURED" });
    }
  });

  test("treats half a configuration as none", () => {
    const halves: Partial<EmailDeliveryEnvironment>[] = [
      { resendApiKey: KEY },
      { emailFrom: FROM },
      { resendApiKey: KEY, emailFrom: "   " },
      { resendApiKey: "  ", emailFrom: FROM },
      { resendApiKey: KEY, emailFrom: "no-reply" },
      { resendApiKey: KEY, emailFrom: "zomo <no-reply>" },
    ];

    for (const half of halves) {
      expect(
        resolveEmailDelivery(environment({ nodeEnv: "production", ...half })),
        JSON.stringify(half),
      ).toEqual({ mode: "UNCONFIGURED" });
      // Development still gets the console fallback rather than real mail.
      expect(
        resolveEmailDelivery(environment({ nodeEnv: "development", ...half })),
        JSON.stringify(half),
      ).toEqual({ mode: "DEV_CONSOLE" });
    }
  });

  test("only an unconfigured deployment cannot offer email", () => {
    expect(canDeliverEmail({ mode: "UNCONFIGURED" })).toBe(false);
    expect(canDeliverEmail({ mode: "DEV_CONSOLE" })).toBe(true);
    expect(canDeliverEmail({ mode: "PROVIDER", apiKey: KEY, from: FROM })).toBe(
      true,
    );
  });
});

test.describe("EMAIL_FROM", () => {
  test("accepts a bare address and a named one", () => {
    expect(wellFormedFrom("no-reply@zomo.ge")).toBe("no-reply@zomo.ge");
    expect(wellFormedFrom(FROM)).toBe(FROM);
    expect(wellFormedFrom("Zomo <no-reply@zomo.ge>")).toBe(
      "Zomo <no-reply@zomo.ge>",
    );
  });

  test("rejects values that are not an address", () => {
    for (const value of [
      undefined,
      "",
      "zomo",
      "zomo <>",
      "<no-reply@zomo.ge",
      "no reply@zomo.ge",
    ]) {
      expect(wellFormedFrom(value), String(value)).toBeNull();
    }
  });

  test("names the missing half of a configuration", () => {
    expect(emailDeliveryMisconfiguration({ resendApiKey: KEY })).toContain(
      "EMAIL_FROM",
    );
    expect(emailDeliveryMisconfiguration({ emailFrom: FROM })).toContain(
      "RESEND_API_KEY",
    );
    expect(
      emailDeliveryMisconfiguration({ resendApiKey: KEY, emailFrom: "zomo" }),
    ).toContain("EMAIL_FROM");
    expect(
      emailDeliveryMisconfiguration({ resendApiKey: KEY, emailFrom: FROM }),
    ).toBeNull();
    expect(emailDeliveryMisconfiguration({})).toBeNull();
  });
});

test.describe("assertPasswordResetRequestAllowed", () => {
  const saved = {
    NODE_ENV: process.env.NODE_ENV,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
  };

  /** `process.env` assignment stringifies `undefined`; delete instead. */
  function setEnv(name: keyof typeof saved, value: string | undefined) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      (process.env as Record<string, string>)[name] = value;
    }
  }

  test.afterEach(() => {
    for (const [name, value] of Object.entries(saved)) {
      setEnv(name as keyof typeof saved, value);
    }
  });

  test("refuses every address when nothing can deliver mail", () => {
    setEnv("NODE_ENV", "production");
    setEnv("RESEND_API_KEY", undefined);
    setEnv("EMAIL_FROM", undefined);

    // Same refusal for any address, before any lookup — not an oracle.
    for (const email of ["known@example.com", "unknown@example.com"]) {
      let caught: unknown = null;
      try {
        assertPasswordResetRequestAllowed({ email });
      } catch (error) {
        caught = error;
      }
      expect(caught, email).not.toBeNull();
      expect((caught as { body?: { code?: string } }).body?.code).toBe(
        EMAIL_NOT_CONFIGURED_CODE,
      );
      expect((caught as { statusCode?: number }).statusCode).toBe(503);
    }
  });

  test("lets the request through once Resend is configured", () => {
    // Not "production": the in-memory per-address limiter only counts there,
    // and this is about the configuration gate alone.
    setEnv("NODE_ENV", "test");
    setEnv("RESEND_API_KEY", KEY);
    setEnv("EMAIL_FROM", FROM);

    expect(() =>
      assertPasswordResetRequestAllowed({ email: "someone@example.com" }),
    ).not.toThrow();
  });

  test("lets the request through in development without a key", () => {
    setEnv("NODE_ENV", "development");
    setEnv("RESEND_API_KEY", undefined);
    setEnv("EMAIL_FROM", undefined);

    expect(() =>
      assertPasswordResetRequestAllowed({ email: "someone@example.com" }),
    ).not.toThrow();
  });
});

/** An ordinary client account; overrides make it something else. */
function candidate(
  overrides: Partial<PasswordResetCandidate>,
): PasswordResetCandidate {
  return {
    email: "client@example.com",
    role: "CLIENT",
    isSuspended: false,
    hasSystemUserProfile: false,
    ...overrides,
  };
}

test.describe("passwordResetSkipReason", () => {
  test("sends to ordinary client, driver and company accounts", () => {
    for (const role of ["CLIENT", "DRIVER", "COMPANY"]) {
      expect(passwordResetSkipReason(candidate({ role })), role).toBeNull();
    }
  });

  test("never sends to a phone account's placeholder address", () => {
    for (const email of [
      "995555123456@phone.driver-app.invalid",
      "995555123456@PHONE.DRIVER-APP.INVALID",
    ]) {
      expect(
        passwordResetSkipReason(candidate({ email, role: "DRIVER" })),
      ).toBe("PHONE_PLACEHOLDER_EMAIL");
    }
  });

  test("never sends to a back-office account", () => {
    expect(passwordResetSkipReason(candidate({ role: "ADMIN" }))).toBe(
      "BACK_OFFICE_ACCOUNT",
    );
    // The admin guard keys on the profile, not the role, so a profile on any
    // role counts — active or not.
    expect(
      passwordResetSkipReason(candidate({ hasSystemUserProfile: true })),
    ).toBe("BACK_OFFICE_ACCOUNT");
  });

  test("never sends to a suspended account", () => {
    expect(passwordResetSkipReason(candidate({ isSuspended: true }))).toBe(
      "SUSPENDED",
    );
    expect(
      passwordResetSkipReason(candidate({ role: "DRIVER", isSuspended: true })),
    ).toBe("SUSPENDED");
  });
});

const CLIENT = "https://zomo.ge";
const MERCHANT = "https://drive.zomo.ge";

test.describe("resetLinkOrigin", () => {
  test("drivers and companies land on the merchant host", () => {
    for (const role of ["DRIVER", "COMPANY"]) {
      expect(
        resetLinkOrigin({
          role,
          clientOrigin: CLIENT,
          merchantOrigin: MERCHANT,
        }),
        role,
      ).toBe(MERCHANT);
    }
  });

  test("clients, and anything unrecognised, land on the client host", () => {
    for (const role of ["CLIENT", "ADMIN", "", null, undefined, "driver"]) {
      expect(
        resetLinkOrigin({
          role,
          clientOrigin: CLIENT,
          merchantOrigin: MERCHANT,
        }),
        String(role),
      ).toBe(CLIENT);
    }
  });

  test("with the host split off there is only the client host", () => {
    for (const role of ["CLIENT", "DRIVER", "COMPANY"]) {
      expect(
        resetLinkOrigin({ role, clientOrigin: CLIENT, merchantOrigin: null }),
      ).toBe(CLIENT);
    }
  });
});

test.describe("passwordResetLink", () => {
  test("goes through Better Auth's callback back to the same host", () => {
    const link = new URL(
      passwordResetLink({ origin: MERCHANT, locale: "en", token: "abc123" }),
    );

    expect(link.origin).toBe(MERCHANT);
    expect(link.pathname).toBe("/api/auth/reset-password/abc123");
    expect(link.searchParams.get("callbackURL")).toBe(
      `${MERCHANT}/en/reset-password`,
    );
  });

  test("carries the reader's locale", () => {
    const link = new URL(
      passwordResetLink({ origin: CLIENT, locale: "ka", token: "t" }),
    );

    expect(link.searchParams.get("callbackURL")).toBe(
      `${CLIENT}/ka/reset-password`,
    );
  });

  test("tolerates a trailing slash and encodes the token", () => {
    const link = passwordResetLink({
      origin: `${CLIENT}/`,
      locale: "en",
      token: "a/b?c",
    });

    expect(
      link.startsWith(`${CLIENT}/api/auth/reset-password/a%2Fb%3Fc?`),
    ).toBe(true);
  });
});

const COPY: PasswordResetEmailCopy = {
  subject: "Reset your zomo password",
  heading: "Reset <your> password",
  intro: "Intro & more",
  button: "Set a new password",
  expiry: "Valid for 30 minutes.",
  ignore: "Ignore it otherwise.",
  linkFallback: "Copy this link:",
  signature: "— The zomo team",
};

test.describe("renderPasswordResetEmail", () => {
  const link =
    "https://zomo.ge/api/auth/reset-password/abc?callbackURL=https%3A%2F%2Fzomo.ge%2Fka%2Freset-password";
  const email = renderPasswordResetEmail({ copy: COPY, link, locale: "ka" });

  test("puts the link in both parts", () => {
    expect(email.text).toContain(link);
    expect(email.html).toContain(`href="${link}"`);
  });

  test("escapes the copy in the HTML part only", () => {
    expect(email.html).toContain("Reset &lt;your&gt; password");
    expect(email.html).toContain("Intro &amp; more");
    expect(email.html).not.toContain("<your>");
    expect(email.text).toContain("Reset <your> password");
  });

  test("declares the reader's language and keeps the subject", () => {
    expect(email.html).toContain('<html lang="ka">');
    expect(email.subject).toBe(COPY.subject);
  });
});

test.describe("password reset copy", () => {
  const read = (locale: string) =>
    JSON.parse(
      readFileSync(
        join(process.cwd(), "src", "messages", locale, "auth.json"),
        "utf8",
      ),
    ) as { passwordResetEmail: Record<string, string> };

  test("every email string exists, non-empty, in both languages", () => {
    const keys = Object.keys(COPY);

    for (const locale of ["ka", "en"]) {
      const catalog = read(locale).passwordResetEmail;
      for (const key of keys) {
        expect(catalog[key]?.trim(), `${locale}.${key}`).toBeTruthy();
      }
      expect(catalog.expiry, locale).toContain("{minutes}");
    }
  });

  test("the link lives as long as the screens say it does", () => {
    // `signInForm.enterTheEmailOnYourAccount` and the reset page both say 30.
    expect(PASSWORD_RESET_TOKEN_TTL_SECONDS).toBe(30 * 60);
  });
});
