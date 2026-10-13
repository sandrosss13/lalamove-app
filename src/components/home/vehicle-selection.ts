/**
 * Which vehicle class the booking form's step 5 stands on, as the item list
 * changes underneath it.
 *
 * Step 5 recommends a vehicle (`recommendVehicles` in
 * `src/lib/orders/load-plan.ts`) and lets the client overrule it. That gives
 * the selection two lives, told apart by one flag, `chosenByClient`:
 *
 * - **Following** (`false`, where every booking starts, and where "Use
 *   recommended" puts it back): the form picked this class on the client's
 *   behalf, so it keeps picking. Every plan change moves the selection to the
 *   new recommendation — add a wardrobe and the MPV the form chose gives way
 *   to the van that takes it.
 * - **Chosen** (`true`, set by any click on a vehicle card): the client picked
 *   this class themselves, and a plan change never moves it. It is let go only
 *   when it can no longer be booked at all — the load cannot physically fit it
 *   (`cannot_fit`), or it is no longer on offer for this load (no carrier runs
 *   it with this body, or the items moved the order out of its duty class).
 *   Then the flag drops back to following, the selection moves to the
 *   recommendation, and the release is reported so the form can say why.
 *
 * Why the distinction matters: the client is usually looking at step 4 when
 * the plan changes, not at step 5. Moving a selection the client made, in a
 * step they are not looking at, is a change nobody sees until the quote is for
 * a vehicle they did not choose. Moving one the form made is the form keeping
 * its own recommendation honest.
 *
 * Pure — no React, no translator — so `tests/vehicle-selection.spec.ts` can
 * walk every transition as data. The form keeps the two pieces of state and
 * applies whatever this returns from one effect.
 */

/** Why a hand-picked class was let go. */
export type VehicleReleaseReason =
  /** The listed load fails a hard axis on it (`assessFit` → `cannot_fit`). */
  | "cannot_fit"
  /**
   * It can no longer be booked for this load for a reason other than size:
   * no carrier runs it with the body being booked, it does not offer that
   * body, or the item list's cargo category no longer allows its duty class.
   */
  | "unavailable";

export type VehicleSelection = {
  /** The selected class's code; `""` for none. */
  code: string;
  chosenByClient: boolean;
};

export type VehicleSelectionInput = VehicleSelection & {
  /**
   * Whether the inputs below describe a real, settled load: a plan exists with
   * one derived body and within the biggest class's payload, the vehicle types
   * and the catalogue have loaded, and a body is being booked. When `false`
   * nothing is judged and nothing moves — an emptied or conflicting list, or a
   * fetch still in flight, is a state the client is passing through, not a
   * verdict on the class they picked.
   */
  judged: boolean;
  /**
   * `false` only for a business that has not chosen a load space yet. There is
   * no vehicle to stand on without one, so any selection is dropped.
   */
  bodyChosen: boolean;
  /** The recommended class (`recommendVehicles(...).recommended`), if any. */
  recommendedCode: string | null;
  /** Classes the booking could be placed against, cheapest first. */
  bookableCodes: readonly string[];
  /** Classes the listed load cannot physically go on. */
  cannotFitCodes: readonly string[];
};

export type VehicleSelectionResult = VehicleSelection & {
  /** Set only on the transition that let a hand-picked class go. */
  released: { code: string; reason: VehicleReleaseReason } | null;
};

/**
 * The selection the form should be on, given where it is and what the plan
 * now says. Idempotent: feeding a result back in returns it unchanged (with
 * `released: null`), which is what keeps the form's effect from looping.
 */
export function reconcileVehicleSelection(
  input: VehicleSelectionInput,
): VehicleSelectionResult {
  const { code, chosenByClient } = input;

  if (!input.bodyChosen) {
    return { code: "", chosenByClient: false, released: null };
  }

  if (!input.judged) {
    return { code, chosenByClient, released: null };
  }

  if (!chosenByClient) {
    // Following. With nothing to recommend the selection stays where it is
    // rather than emptying: the card it is on explains itself, and the alert
    // above step 5 says what to change. `canSubmit` refuses it either way.
    return {
      code: input.recommendedCode ?? code,
      chosenByClient: false,
      released: null,
    };
  }

  if (input.bookableCodes.includes(code)) {
    return { code, chosenByClient: true, released: null };
  }

  return {
    code: input.recommendedCode ?? code,
    chosenByClient: false,
    released: {
      code,
      reason: input.cannotFitCodes.includes(code)
        ? "cannot_fit"
        : "unavailable",
    },
  };
}

/**
 * Whether the selection sits on a class the recommendation view does not show
 * — neither the recommended class nor the one above it. The form opens the
 * "Change vehicle" grid when this turns true, so the selected card is always
 * on screen somewhere.
 */
export function selectionOutsideRecommendation(
  code: string,
  recommendedCode: string | null,
  oneSizeUpCode: string | null,
): boolean {
  return code !== "" && code !== recommendedCode && code !== oneSizeUpCode;
}
