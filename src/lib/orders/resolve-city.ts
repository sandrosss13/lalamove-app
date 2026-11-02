/**
 * Resolving the `GeorgianCity` an address names. Moved out of
 * `src/lib/orders/order-input.ts` (which re-exports it) so that
 * `src/lib/pricing.ts` can classify a trip as CITY or INTERCITY from the same
 * resolution the order's `pickupCity`/`dropoffCity` columns are written from,
 * without `pricing.ts` -> `order-input.ts` -> `pricing.ts` import cycle.
 *
 * Pure: no Prisma, no env.
 */

import type { GeorgianCity } from "@prisma/client";

import { GEORGIAN_CITY_OPTIONS } from "@/lib/georgian-cities";

/**
 * Every `GeorgianCity` keyed by its lower-cased display label, built once at
 * module load rather than scanned per request.
 *
 * `GEORGIAN_CITY_OPTIONS` mirrors the `GeorgianCity` enum exactly — its `value`
 * strings *are* the enum members — and is read here rather than
 * `Object.values(GeorgianCity)` because only the option list carries the human
 * label ("Tskaltubo"), which is the form an address actually spells the city in.
 */
const GEORGIAN_CITY_BY_LABEL = new Map<string, GeorgianCity>(
  GEORGIAN_CITY_OPTIONS.map((option) => [
    option.label.toLowerCase(),
    option.value,
  ]),
);

/**
 * The `GeorgianCity` an address names, or `null` when it names none.
 *
 * Resolved server-side from the address the geocode lookup produced, never read
 * from the request body — `Order.pickupCity`/`dropoffCity` back the load board's
 * city filter, and a city a client could choose freely would let a booking
 * advertise itself into a market it is not in.
 *
 * Matched against whole comma-delimited components of the address rather than by
 * substring, which is the entire reason these columns exist instead of a
 * `LIKE '%Tbilisi%'` over `pickupAddress`: "Tbilisi Highway 4, Rustavi" is a
 * Rustavi address, and a substring match would file it under Tbilisi. Comparing
 * a trimmed component for equality cannot make that mistake — "Tbilisi Highway
 * 4" is not "Tbilisi". The first matching component wins because Google formats
 * an address most-specific-first ("Street, City, Region, Country").
 *
 * An address matching nothing resolves to `null`, and that is a correct answer
 * rather than a failure: a village, a roadside depot or a border crossing is not
 * in the 63-value enum, and forcing it to the nearest city would show the load
 * to drivers filtering for a city it is not in. A null simply never matches a
 * city filter while still appearing on the unfiltered board. Order creation
 * therefore never fails over an unresolvable city.
 */
export function resolveGeorgianCity(address: string): GeorgianCity | null {
  for (const component of address.split(",")) {
    const city = GEORGIAN_CITY_BY_LABEL.get(component.trim().toLowerCase());
    if (city) {
      return city;
    }
  }

  return null;
}
