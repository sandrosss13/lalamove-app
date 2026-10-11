/**
 * Pulls the API's `{ error }` message out of a failed admin response, so a
 * `403` for a role that may not do something says so instead of showing the
 * same "could not load" a network failure does. Falls back when the body is
 * not that shape (an HTML error page, an empty body).
 */
export async function readErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const body: unknown = await response.json().catch(() => null);

  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof body.error === "string"
  ) {
    return body.error;
  }

  return fallback;
}
