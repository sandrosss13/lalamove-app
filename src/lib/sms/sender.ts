/**
 * The one seam a real SMS provider plugs into.
 *
 * No provider has been chosen yet, so `getSmsSender` returns `null` and phone
 * sign-in outside development test mode fails closed (see
 * `@/lib/sms/otp-delivery`). Wiring one in later is: implement `SmsSender` in a
 * file beside this one, read its credentials from the environment, and return
 * it here when they are present. Nothing else in the app changes.
 */

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
  return null;
}
