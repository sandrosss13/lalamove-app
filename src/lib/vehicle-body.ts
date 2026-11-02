/**
 * Does a vehicle type offer a given load space (body)?
 *
 * **Why this is its own module.** The predicate used to live in
 * `src/components/home/order-vehicle-types.ts`, beside the data it reads. That
 * module is `"use client"` and imports React for its fetching hook, which is
 * fine for the booking form and wrong for anything that has to run on both
 * sides of the wire: `src/lib/orders/load-plan.ts` asks the same question while
 * recommending a vehicle, and is imported by `POST /api/orders` as well as by
 * the form. Importing the predicate from a client-component module would drag
 * React and the `"use client"` boundary into a route handler; copying it would
 * give the taxonomy two definitions of "offers this body" free to drift. So it
 * moved here, and `order-vehicle-types.ts` re-exports it so every existing
 * caller keeps its import unchanged.
 *
 * **Deliberately dependency-free**, for the same reason as
 * `src/lib/orders/vehicle-fit.ts`: no `server-only`, no Prisma import and no
 * Prisma type in the signature. The body list is typed by a type parameter
 * instead, so a caller holding `ChassisType[]` keeps that precision (a typo in
 * the body it asks about is still a type error) while a caller holding plain
 * strings — a test fixture, the load plan — needs nothing from the generated
 * client.
 *
 * **Not `offersBodyType`** (`src/lib/orders/class-substitution.ts`), and the
 * difference is intended. That predicate answers for an *order* whose body may
 * be `null` (orders placed before the column existed), and treats `null` as "no
 * requirement". This one answers for a client choosing a body right now, where
 * a body is always chosen. Folding them together would put a meaningless
 * `null` branch into the picker or drop a real one from the load board.
 *
 * A type with an empty `bodyTypes` offers nothing and drops out of every body's
 * grid. That is correct, not a bug — the column defaults to empty, so a type
 * seeded before the column existed (or seeded without it) is hidden from the
 * filter until its bodies are recorded.
 */
export function vehicleOffersBody<Body extends string>(
  vehicle: { readonly bodyTypes: readonly Body[] },
  body: Body,
): boolean {
  return vehicle.bodyTypes.includes(body);
}
