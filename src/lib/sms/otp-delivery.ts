/**
 * How a phone sign-in code reaches its owner — the whole decision, as a pure
 * function of the environment.
 *
 * Three outcomes, and only three:
 *
 * - `DEV_FIXED_CODE` — no SMS is sent and the configured test code verifies.
 *   Requires **both** `NODE_ENV === "development"` **and** a well-formed
 *   `DEV_PHONE_OTP_CODE`. `next build`/`next start` (and therefore every Vercel
 *   deployment, preview included) run with `NODE_ENV === "production"`, so a
 *   test code left in a deployed environment is inert.
 * - `SMS_PROVIDER` — a real sender is configured; the plugin's own random code
 *   is sent and verified.
 * - `UNCONFIGURED` — neither. The send and verify endpoints refuse with
 *   `SMS_NOT_CONFIGURED`; nothing is accepted.
 *
 * No runtime imports, so `tests/phone-otp-delivery.spec.ts` pins the gating
 * without a server.
 */

/** Length of every one-time code, real or test. */
export const PHONE_OTP_LENGTH = 6;

const DEV_CODE_PATTERN = new RegExp(`^\\d{${PHONE_OTP_LENGTH}}$`);

export type OtpDeliveryEnvironment = {
  nodeEnv: string | undefined;
  devPhoneOtpCode: string | undefined;
  hasSmsProvider: boolean;
};

export type OtpDelivery =
  | { mode: "DEV_FIXED_CODE"; code: string }
  | { mode: "SMS_PROVIDER" }
  | { mode: "UNCONFIGURED" };

/**
 * The test code, or `null` unless this is a development process with a
 * well-formed code configured. A malformed value (wrong length, non-digits) is
 * treated as unset rather than accepted in some altered form.
 */
export function resolveDevOtpCode(
  environment: Pick<OtpDeliveryEnvironment, "nodeEnv" | "devPhoneOtpCode">,
): string | null {
  if (environment.nodeEnv !== "development") {
    return null;
  }

  const code = environment.devPhoneOtpCode?.trim() ?? "";

  return DEV_CODE_PATTERN.test(code) ? code : null;
}

/** See the module comment. Test mode wins over a provider, in development only. */
export function resolveOtpDelivery(
  environment: OtpDeliveryEnvironment,
): OtpDelivery {
  const devCode = resolveDevOtpCode(environment);

  if (devCode !== null) {
    return { mode: "DEV_FIXED_CODE", code: devCode };
  }

  return environment.hasSmsProvider
    ? { mode: "SMS_PROVIDER" }
    : { mode: "UNCONFIGURED" };
}
