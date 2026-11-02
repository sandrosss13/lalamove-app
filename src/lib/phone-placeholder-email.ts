/**
 * The placeholder address a phone-number account is created with, and the
 * helpers screens use so it is never shown to anyone.
 *
 * Better Auth requires every user to have a unique email, and phone sign-up
 * collects none, so one is derived from the number
 * (`placeholderEmailForPhone` in `src/lib/phone-auth.ts`). `.invalid` is
 * reserved by RFC 2606 and can never resolve, so nothing is ever delivered to
 * it — and it means nothing to a person reading it.
 *
 * Dependency-free on purpose: safe to import from client components, unlike
 * `src/lib/phone-auth.ts`, which pulls in server-only Better Auth code.
 */

/** The domain of the placeholder address a phone account is created with. */
export const PHONE_PLACEHOLDER_EMAIL_DOMAIN = "phone.driver-app.invalid";

export function isPhonePlaceholderEmail(email: unknown): boolean {
  return (
    typeof email === "string" &&
    email.trim().toLowerCase().endsWith(`@${PHONE_PLACEHOLDER_EMAIL_DOMAIN}`)
  );
}

/**
 * The email to show for a user: the address itself, or `null` when there is
 * none worth showing — empty, or a phone account's placeholder. Callers render
 * `null` as nothing, a dash, or the phone number, whatever fits the screen.
 */
export function displayEmail(email: string | null | undefined): string | null {
  if (typeof email !== "string") return null;
  const trimmed = email.trim();
  if (trimmed === "" || isPhonePlaceholderEmail(trimmed)) return null;
  return trimmed;
}
