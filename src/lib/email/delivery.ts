/**
 * Whether — and how — this deployment can deliver a transactional email: the
 * whole decision, as a pure function of the environment.
 *
 * Three outcomes, checked in this order:
 *
 * - `PROVIDER` — `RESEND_API_KEY` and a well-formed `EMAIL_FROM` are both set,
 *   so mail goes out through Resend (see `@/lib/email/sender`). A provider wins
 *   in every environment, development included, so a developer who sets a key
 *   locally gets real mail rather than a console line.
 * - `DEV_CONSOLE` — no provider, and `NODE_ENV === "development"`. Nothing is
 *   sent; the message (recipient, subject and the text body, which carries the
 *   link) is written to the server console instead, so a reset can be tested
 *   end to end on a laptop. `next build`/`next start` — and so every Vercel
 *   deployment, preview included — run with `NODE_ENV === "production"`, so
 *   this can never be what a deployed environment does.
 * - `UNCONFIGURED` — none of the above. Every feature that needs email must
 *   refuse up front (password reset answers `EMAIL_NOT_CONFIGURED` and its
 *   button stays disabled) rather than report a send that never happened.
 *
 * Half a configuration is `UNCONFIGURED`, not a guess: a key with no sender
 * address, or an address with no `@` in it, would be rejected by Resend on
 * every send, and failing at the gate is louder than failing in a log line no
 * one reads. `emailDeliveryMisconfiguration` names which half is missing so
 * the server can say so once at boot.
 *
 * No runtime imports, so `tests/password-reset-email.spec.ts` pins the gating
 * without a server — the same shape as `@/lib/sms/otp-delivery`.
 */

export type EmailDeliveryEnvironment = {
  nodeEnv: string | undefined;
  resendApiKey: string | undefined;
  /** `EMAIL_FROM`, e.g. `Zomo <no-reply@zomo.ge>` or a bare address. */
  emailFrom: string | undefined;
};

export type EmailDelivery =
  | { mode: "PROVIDER"; apiKey: string; from: string }
  | { mode: "DEV_CONSOLE" }
  | { mode: "UNCONFIGURED" };

/**
 * A sender value Resend will accept the shape of: either a bare address or
 * `Display Name <address>`. Deliberately loose — Resend (and the domain it is
 * verified for) is the authority; this only catches an obviously empty or
 * half-pasted value.
 */
const FROM_PATTERN =
  /^(?:[^<>]*<\s*[^\s@<>]+@[^\s@<>]+\s*>|[^\s@<>]+@[^\s@<>]+)$/;

function trimmed(value: string | undefined): string | null {
  const result = value?.trim() ?? "";

  return result.length > 0 ? result : null;
}

/** `EMAIL_FROM`, trimmed, or `null` when it is unset or not an address. */
export function wellFormedFrom(value: string | undefined): string | null {
  const from = trimmed(value);

  return from !== null && FROM_PATTERN.test(from) ? from : null;
}

/** See the module comment. */
export function resolveEmailDelivery(
  environment: EmailDeliveryEnvironment,
): EmailDelivery {
  const apiKey = trimmed(environment.resendApiKey);
  const from = wellFormedFrom(environment.emailFrom);

  if (apiKey !== null && from !== null) {
    return { mode: "PROVIDER", apiKey, from };
  }

  if (environment.nodeEnv === "development") {
    return { mode: "DEV_CONSOLE" };
  }

  return { mode: "UNCONFIGURED" };
}

/**
 * Why a half-set configuration is being ignored, or `null` when there is
 * nothing to say (fully set, or deliberately not set at all).
 */
export function emailDeliveryMisconfiguration(
  environment: Partial<
    Pick<EmailDeliveryEnvironment, "resendApiKey" | "emailFrom">
  >,
): string | null {
  const hasKey = trimmed(environment.resendApiKey) !== null;
  const rawFrom = trimmed(environment.emailFrom);
  const from = wellFormedFrom(environment.emailFrom);

  if (hasKey && rawFrom === null) {
    return "RESEND_API_KEY is set but EMAIL_FROM is not — email is disabled.";
  }

  if (rawFrom !== null && from === null) {
    return `EMAIL_FROM ("${rawFrom}") is not an address or "Name <address>" — email is disabled.`;
  }

  if (!hasKey && from !== null) {
    return "EMAIL_FROM is set but RESEND_API_KEY is not — email is disabled.";
  }

  return null;
}

/** Whether a feature that sends email may offer itself at all. */
export function canDeliverEmail(delivery: EmailDelivery): boolean {
  return delivery.mode !== "UNCONFIGURED";
}
