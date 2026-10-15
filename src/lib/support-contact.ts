/**
 * How a driver reaches support — one server-side setting, read at request time.
 *
 * No `server-only` marker and no imports on purpose: it reads one environment
 * variable and nothing else, which keeps it loadable by a pure spec.
 */

/**
 * The driver-support phone number from `DRIVER_SUPPORT_PHONE`, or `null` when
 * the variable is unset or blank.
 *
 * **There is no default and there must not be one.** A number invented here
 * would be dialled by a driver standing at a loading bay with a problem; a
 * null makes the app hide its call button, which is the honest state of a
 * deployment nobody has given a support line to.
 *
 * Returned exactly as configured (trimmed) — the operator decides the spelling
 * the app shows and dials. Not `NEXT_PUBLIC_`: it is served through the
 * authenticated `GET /api/dashboard/hub/me` rather than baked into a bundle, so
 * changing the line needs no rebuild.
 */
export function getDriverSupportPhone(): string | null {
  const value = process.env.DRIVER_SUPPORT_PHONE?.trim();

  return value ? value : null;
}

/**
 * The phone number a *client* is pointed at — today only when a route is too
 * long to price online (`manual_quote_required`) and needs a quote by hand.
 *
 * `CLIENT_SUPPORT_PHONE` when set, else the driver line (`DRIVER_SUPPORT_PHONE`):
 * most deployments have one support desk, and asking the operator to configure
 * the same number twice is how one of the two ends up blank. `null` when
 * neither is set — the booking form then names support without a number,
 * rather than inventing one (see `getDriverSupportPhone` on why there is no
 * default).
 */
export function getClientSupportPhone(): string | null {
  const value = process.env.CLIENT_SUPPORT_PHONE?.trim();

  return value ? value : getDriverSupportPhone();
}
