/**
 * The one seam an SMS provider plugs into.
 *
 * The provider is smsoffice.ge (`@/lib/sms/smsoffice`), live once both
 * `SMSOFFICE_API_KEY` and `SMSOFFICE_SENDER` are set. Without them
 * `getSmsSender` returns `null` and phone sign-in outside development test mode
 * and the staging allowlist fails closed (see `@/lib/sms/otp-delivery`).
 * Configuring the provider also switches the staging test code off.
 */

import {
  createSmsOfficeSender,
  smsOfficeConfigFromEnv,
} from "@/lib/sms/smsoffice";

export type SmsMessage = {
  /** Recipient in E.164 form (`+995555123456`). */
  to: string;
  body: string;
};

export interface SmsSender {
  /** Rejects when the provider did not accept the message. */
  send(message: SmsMessage): Promise<void>;
}

/** The configured provider, or `null` while there is none. */
export function getSmsSender(): SmsSender | null {
  const config = smsOfficeConfigFromEnv();

  return config ? createSmsOfficeSender(config) : null;
}
