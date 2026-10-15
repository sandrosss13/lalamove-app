/**
 * The hands-on work at each stop of a job (pricing model v1), shaped once for
 * every driver-facing surface: the web hub's job sheet, load board and offer,
 * and the mobile API (`HubStopWork` in `src/lib/mobile-api/contracts.ts`,
 * which this type mirrors).
 *
 * No money here and no imports: the helpers' pay is `Order.helperPayout`,
 * read beside it, and a client component can use this module freely.
 */

/** Helpers, floor and elevators at one stop. */
export type StopWork = {
  /** Helpers booked at this stop (0–4). */
  helpers: number;
  /** The floor the load is on; 0 is the ground floor. */
  floor: number;
  /** Whether a cargo elevator can be used there. */
  cargoElevator: boolean;
  /** Whether a passenger elevator can be used there. */
  passengerElevator: boolean;
  /**
   * Whether completing the job must report the helpers' actual minutes at this
   * stop — see `helperMinutesRequired`. A boolean, not the tariff version it
   * is derived from: the driver needs the decision, not the pricing detail.
   */
  helperMinutesRequired: boolean;
};

/**
 * Whether completion must report helper minutes at a stop: only on a pricing
 * model v1 order (`tariffVersion !== null`) and only where helpers were
 * booked. Pre-v1 orders carry `pickupHelpers`/`dropoffHelpers` backfilled
 * from `helperCount` by the v1 migration, but they had no helper overtime, so
 * asking for minutes there would collect a figure the server discards. The
 * ONE rule: the driver screens gate on it through `StopWork`, and
 * `resolveHelperMinutes` (`src/lib/orders/completion.ts`) enforces it.
 */
export function helperMinutesRequired(
  tariffVersion: number | null,
  helpers: number,
): boolean {
  return tariffVersion !== null && helpers > 0;
}

/** The `Order` columns `stopWorkOf` reads. */
export type StopWorkColumns = {
  pickupHelpers: number;
  pickupFloor: number;
  pickupCargoElevator: boolean;
  pickupPassengerElevator: boolean;
  dropoffHelpers: number;
  dropoffFloor: number;
  dropoffCargoElevator: boolean;
  dropoffPassengerElevator: boolean;
  /** Read only to derive `helperMinutesRequired`; never passed on. */
  tariffVersion: number | null;
};

/** Both stops' work, from an order row. */
export function stopWorkOf(order: StopWorkColumns): {
  pickupWork: StopWork;
  dropoffWork: StopWork;
} {
  return {
    pickupWork: {
      helpers: order.pickupHelpers,
      floor: order.pickupFloor,
      cargoElevator: order.pickupCargoElevator,
      passengerElevator: order.pickupPassengerElevator,
      helperMinutesRequired: helperMinutesRequired(
        order.tariffVersion,
        order.pickupHelpers,
      ),
    },
    dropoffWork: {
      helpers: order.dropoffHelpers,
      floor: order.dropoffFloor,
      cargoElevator: order.dropoffCargoElevator,
      passengerElevator: order.dropoffPassengerElevator,
      helperMinutesRequired: helperMinutesRequired(
        order.tariffVersion,
        order.dropoffHelpers,
      ),
    },
  };
}

/**
 * Whether a stop's work is worth showing: a helper, a floor above ground or an
 * elevator. Orders booked before v1 carry the column defaults (0, 0, false) at
 * both ends and describe their crew with `helperCount` alone, so a surface
 * falls back to that when neither stop says anything.
 */
export function hasStopWork(work: StopWork): boolean {
  return (
    work.helpers > 0 ||
    work.floor > 0 ||
    work.cargoElevator ||
    work.passengerElevator
  );
}
