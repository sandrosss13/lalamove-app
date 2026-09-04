/**
 * Placeholder data for the Driver Hub — every number the design shows that the
 * schema cannot source yet.
 *
 * **Nothing in this file is real.** It exists so the seven hub screens can be
 * built, reviewed and shipped ahead of the schema work that would make these
 * figures true, instead of the screens either waiting on a migration or
 * quietly inventing numbers wherever they happen to be rendered. Keeping the
 * whole gap in one module is what makes the honesty rule enforceable: a screen
 * that imports from here renders a `<SampleNote />` next to whatever it fed,
 * and a `grep` for this file's path is an exact inventory of what is still
 * fictional.
 *
 * Every export below carries a comment naming the schema change that retires
 * it. When that model or column lands, delete the export and follow the type
 * errors — each one is a call site that now has real data to read instead.
 *
 * Two deliberate non-rules:
 *
 * - No `server-only`. Client screens import these values directly, because the
 *   values are constants; routing them through a server pass would only dress
 *   them up as data that had been fetched from somewhere.
 * - No Prisma, no `fetch`, no `Date.now()`. Everything here is a plain constant
 *   or a pure function of its arguments, so a screen renders identically on the
 *   server and on the client and nothing in here can drift between the two.
 *
 * Money is in GEL major units (`142.6` = ₾142.60), matching `Order.price`.
 */

/* ------------------------------------------------------------------------- */
/* Shared shapes                                                             */
/* ------------------------------------------------------------------------- */

/**
 * How a period-over-period delta should read. `tone` drives the colour only —
 * "good" is green, "bad" is amber — and is stated per metric because the
 * direction that counts as good differs (a falling cancellation rate is good, a
 * falling jobs-per-day is not).
 */
export type SampleMetricDelta = {
  /** Ready-to-render copy, e.g. "+3 pts vs last week". */
  label: string;
  tone: "good" | "bad";
};

/* ------------------------------------------------------------------------- */
/* Online time                                                               */
/* ------------------------------------------------------------------------- */

/**
 * Today's online time, as the header sub-line prints it.
 *
 * Retire once an `OnlineSession` model records the intervals between a driver
 * going online and offline; today `DriverProfile.isOnline` is a single boolean
 * with no history behind it, so no duration can be computed from it at all.
 */
export const SAMPLE_ONLINE_TIME_TODAY_LABEL = "6h 12m";

/**
 * Assumed online hours per completed job, used to turn a real job count into
 * the "Nh online" note and the per-online-hour figure on Earnings.
 *
 * Retire once an `OnlineSession` model exists: the real figure is summed
 * session duration over the range, not a ratio guessed from job volume.
 */
export const SAMPLE_ONLINE_HOURS_PER_JOB = 0.92;

/**
 * Estimated online hours for a real completed-job count.
 *
 * Pure and deliberately crude — it is a placeholder, and a more elaborate model
 * would only make a fabricated number look more trustworthy than it is.
 *
 * Retire with `SAMPLE_ONLINE_HOURS_PER_JOB`.
 */
export function sampleOnlineHours(completedJobs: number): number {
  return Number((completedJobs * SAMPLE_ONLINE_HOURS_PER_JOB).toFixed(1));
}

/** One column of the Performance screen's "online hours vs jobs" chart. */
export type SampleOnlineHoursDay = {
  /** Three-letter weekday label, Monday first. */
  day: string;
  onlineHours: number;
  /**
   * Jobs completed that day. Real data exists for this half of the chart, but
   * it is carried here so the two series stay consistent while the hours half
   * is still fictional — a real jobs bar next to a fake hours bar invites the
   * reader to compare them.
   */
  jobsCompleted: number;
};

/**
 * The rolling-week bars on Performance.
 *
 * Retire once an `OnlineSession` model can be bucketed by Tbilisi day; the
 * `jobsCompleted` half then comes from `Order` and this constant goes entirely.
 */
export const SAMPLE_ONLINE_HOURS_WEEK: readonly SampleOnlineHoursDay[] = [
  { day: "Mon", onlineHours: 7.2, jobsCompleted: 7 },
  { day: "Tue", onlineHours: 8.6, jobsCompleted: 9 },
  { day: "Wed", onlineHours: 6.4, jobsCompleted: 6 },
  { day: "Thu", onlineHours: 9.1, jobsCompleted: 10 },
  { day: "Fri", onlineHours: 6.2, jobsCompleted: 8 },
  { day: "Sat", onlineHours: 5.0, jobsCompleted: 5 },
  { day: "Sun", onlineHours: 0, jobsCompleted: 0 },
];

/* ------------------------------------------------------------------------- */
/* Performance metrics                                                       */
/* ------------------------------------------------------------------------- */

/**
 * Share of offered jobs the driver accepted, as a percentage.
 *
 * Retire once a `JobOffer` model records every dispatch offered to a driver and
 * whether it was accepted, declined or timed out. `Order` only ever stores the
 * offer that was *taken* — a declined offer leaves no row — so acceptance is
 * not merely unaggregated today, it is unrecorded.
 */
export const SAMPLE_ACCEPTANCE_RATE_PERCENT = 94;

/**
 * Average customer rating, and the number of rated jobs behind it.
 *
 * Retire once an `OrderRating` model (score + optional comment, one per
 * completed order) exists. Nothing in the schema captures customer feedback
 * today, so both figures are invented.
 */
export const SAMPLE_AVG_RATING = 4.86;
export const SAMPLE_RATED_JOB_COUNT = 61;

/**
 * Average minutes per online hour spent neither on a job nor heading to one.
 *
 * Retire once an `OnlineSession` model exists to supply the denominator; the
 * numerator is then online time minus the ACCEPTED→COMPLETED spans `Order`
 * already timestamps.
 */
export const SAMPLE_IDLE_MINUTES_PER_HOUR = 38;

/**
 * Cancellations attributed to the driver today, as the Today glance card counts
 * them.
 *
 * Retire once `Order` records *who* cancelled: `CANCELLED` is a status with no
 * actor, so a client-cancelled order is indistinguishable from a driver-
 * cancelled one and cannot fairly be counted against a driver.
 */
export const SAMPLE_CANCELLATIONS_TODAY = 1;

/** The five tiles across the top of Performance. */
export type SamplePerformanceMetric =
  "acceptance" | "completion" | "cancellations" | "rating" | "jobsPerDay";

/**
 * Period-over-period deltas for the Performance tiles.
 *
 * Sample even for the three metrics whose *current* value is real (completion,
 * cancellations, jobs per day): a delta needs the previous period's value held
 * somewhere comparable, and recomputing it from `Order` on every request is a
 * second full aggregation the screen does not currently run.
 *
 * Retire once a `DriverMetricSnapshot` model stores each metric per driver per
 * week; the delta is then this week's row minus last week's.
 */
export const SAMPLE_PERFORMANCE_DELTAS: Record<
  SamplePerformanceMetric,
  SampleMetricDelta
> = {
  acceptance: { label: "+3 pts vs last week", tone: "good" },
  completion: { label: "+1 pt vs last week", tone: "good" },
  cancellations: { label: "-0.4 pts vs last week", tone: "good" },
  // Not a delta at all in the design — the rating tile carries a cohort
  // ranking, which needs every other Tbilisi driver's rating to compute.
  rating: { label: "Top 15% in Tbilisi", tone: "good" },
  jobsPerDay: { label: "-0.6 vs last week", tone: "bad" },
};

/** One row of the Performance screen's "What affects your score" card. */
export type SampleScoreNote = {
  title: string;
  /** Pre-formatted because the four values have four different units. */
  value: string;
  body: string;
  tone: "good" | "bad";
};

/**
 * The explanatory copy under the Performance chart.
 *
 * Retire alongside the metrics each row describes — the bodies quote thresholds
 * ("above 5% pauses incentives") that are themselves a policy the product has
 * not yet written down anywhere the code can read.
 */
export const SAMPLE_SCORE_NOTES: readonly SampleScoreNote[] = [
  {
    title: "Acceptance rate",
    value: "94%",
    tone: "good",
    body: "Declines counted over the last 100 offers. Staying above 90% keeps priority matching.",
  },
  {
    title: "Cancellations",
    value: "2.1%",
    tone: "good",
    body: "Two cancellations this week, both before pickup. Above 5% pauses incentives.",
  },
  {
    title: "Rating",
    value: "4.86",
    tone: "good",
    body: "From 61 rated jobs. Ratings below 4.5 trigger a coaching review.",
  },
  {
    title: "Idle time",
    value: "38 min/h",
    tone: "bad",
    body: "Highest in Gldani. Moving to Vake between 09:00 and 11:00 cuts it by about a third.",
  },
];

/* ------------------------------------------------------------------------- */
/* Zone demand (Today)                                                       */
/* ------------------------------------------------------------------------- */

export type SampleZoneDemandLevel = "High" | "Medium" | "Low";

export type SampleZoneDemandRow = {
  /** District grouping, e.g. "Vake · Vera". Not a `GeorgianCity` — finer. */
  zone: string;
  driversOnline: number;
  level: SampleZoneDemandLevel;
  /** Per-job bonus in GEL, or `null` when the zone pays no surge. */
  bonusGel: number | null;
};

/**
 * The "Where the demand is" table.
 *
 * Retire once two things exist: a `Zone` model (districts below city level —
 * `GeorgianCity` stops at TBILISI, so "Vake · Vera" has nowhere to live) and a
 * surge/incentive model that sets the per-job bonus. The driver counts would
 * then come from `DriverProfile.currentLat`/`currentLng` joined to those zones.
 */
export const SAMPLE_ZONE_DEMAND: readonly SampleZoneDemandRow[] = [
  { zone: "Vake · Vera", driversOnline: 14, level: "High", bonusGel: 3.0 },
  { zone: "Saburtalo", driversOnline: 22, level: "High", bonusGel: 2.0 },
  {
    zone: "Gldani · Didube",
    driversOnline: 31,
    level: "Medium",
    bonusGel: null,
  },
  { zone: "Isani · Samgori", driversOnline: 9, level: "Low", bonusGel: null },
];

/**
 * Freshness caption above the zone table. A literal rather than a computed
 * "N min ago" precisely because the rows never refresh — a live-looking
 * timestamp over frozen data is the kind of lie this module exists to avoid.
 *
 * Retire with `SAMPLE_ZONE_DEMAND`.
 */
export const SAMPLE_ZONE_DEMAND_CAPTION = "Sample snapshot";

/* ------------------------------------------------------------------------- */
/* Earnings: breakdown and payouts                                           */
/* ------------------------------------------------------------------------- */

/**
 * Assumed tip per completed job, in GEL.
 *
 * Retire once `Order` gains a `tipAmount` column. Until then the Jobs screen
 * omits its Tip fare line entirely rather than fabricating a per-order figure —
 * only the range-level rollup below is estimated, and it is badged as sample.
 */
export const SAMPLE_TIP_PER_JOB_GEL = 0.95;

/**
 * Share of completed jobs assumed to have been tipped, used only for the
 * breakdown card's "N customers" note.
 *
 * Retire with `SAMPLE_TIP_PER_JOB_GEL`.
 */
export const SAMPLE_TIPPING_CUSTOMER_SHARE = 0.4;

/**
 * Assumed weekend surge bonus per completed job, in GEL.
 *
 * Retire once an `Incentive` model records the campaigns a driver qualified for
 * and what each paid. Nothing in the schema knows a bonus was ever earned.
 */
export const SAMPLE_INCENTIVE_PER_WEEKEND_JOB_GEL = 1.4;

/** The three non-fare lines of the Earnings breakdown card. */
export type SampleEarningsExtras = {
  tipsGel: number;
  /** For the "N customers" note under the Tips line. */
  tippingCustomers: number;
  incentivesGel: number;
  adjustmentsGel: number;
  /** Note under the Adjustments line; "None in range" when zero. */
  adjustmentsNote: string;
};

/**
 * Estimates the tips, incentives and adjustments for a range whose fares and
 * job counts are real.
 *
 * Pure: caller passes the real counts it already aggregated, so this never
 * needs its own notion of "the range" or of what a weekend is.
 *
 * Adjustments are always zero. That is not laziness — an adjustment is a
 * deduction the platform made (a cancellation fee, a damage claim), and
 * inventing one would show a driver money being taken off them that never was.
 * Zero with a "None in range" note is the only honest placeholder.
 *
 * Retire once `Order.tipAmount`, an `Incentive` model and a `PayoutAdjustment`
 * model exist.
 */
export function sampleEarningsExtras(input: {
  completedJobs: number;
  /** Of those, the jobs completed on a Saturday or Sunday in Tbilisi. */
  weekendJobs: number;
}): SampleEarningsExtras {
  const tipsGel = Number(
    (input.completedJobs * SAMPLE_TIP_PER_JOB_GEL).toFixed(2),
  );
  const incentivesGel = Number(
    (input.weekendJobs * SAMPLE_INCENTIVE_PER_WEEKEND_JOB_GEL).toFixed(2),
  );

  return {
    tipsGel,
    tippingCustomers: Math.round(
      input.completedJobs * SAMPLE_TIPPING_CUSTOMER_SHARE,
    ),
    incentivesGel,
    adjustmentsGel: 0,
    adjustmentsNote: "None in range",
  };
}

/** Note under the Incentives tile and breakdown line. */
export const SAMPLE_INCENTIVES_NOTE = "Weekend surge + streak";

export type SamplePayoutStatus = "Paid" | "Processing";

export type SamplePayoutRow = {
  /** Human range label, e.g. "18–24 Aug". */
  period: string;
  jobs: number;
  incentivesGel: number;
  amountGel: number;
  status: SamplePayoutStatus;
};

/**
 * The payout-history table on Earnings. Deliberately *not* range-filtered — a
 * payout period is a fixed weekly settlement window, which is why the breakdown
 * card's footer reads "Range total" rather than "Payout total".
 *
 * Retire once a `Payout` model records each settlement (period start/end,
 * order set, incentive total, transfer status). Order revenue is settled weekly
 * per `LogisticsCompany.bankAccountIban`'s doc comment, but nothing persists
 * that a settlement happened.
 */
export const SAMPLE_PAYOUT_HISTORY: readonly SamplePayoutRow[] = [
  {
    period: "25–31 Aug",
    jobs: 46,
    incentivesGel: 92.0,
    amountGel: 658.4,
    status: "Processing",
  },
  {
    period: "18–24 Aug",
    jobs: 51,
    incentivesGel: 108.0,
    amountGel: 712.3,
    status: "Paid",
  },
  {
    period: "11–17 Aug",
    jobs: 44,
    incentivesGel: 64.0,
    amountGel: 596.8,
    status: "Paid",
  },
  {
    period: "4–10 Aug",
    jobs: 48,
    incentivesGel: 80.0,
    amountGel: 641.1,
    status: "Paid",
  },
];

/**
 * The weekly-incentive progress card pinned to the bottom of the sidebar.
 *
 * Retire with the `Incentive` model — a target, a count against it and a payout
 * are all campaign facts the schema has no place for.
 */
export const SAMPLE_WEEKLY_INCENTIVE = {
  jobsDone: 12,
  jobsTarget: 15,
  note: "3 more jobs by Sunday for a ₾40 bonus.",
} as const;

/* ------------------------------------------------------------------------- */
/* Per-vehicle facts                                                         */
/* ------------------------------------------------------------------------- */

/** Compliance state of a document the schema does not store dates for. */
export type SampleComplianceStatus =
  "Valid" | "Expiring soon" | "Expired" | "Pending";

/** One line of the vehicle detail panel's "Running costs · this month". */
export type SampleRunningCost = { label: string; amountGel: number };

export type SampleVehicleFacts = {
  odometerKm: number;
  costPerKmGel: number;
  /** Fuel type, e.g. "Diesel". */
  fuel: string;
  /**
   * Cities this vehicle works. Distinct from
   * `LogisticsCompany.citiesOfOperation`, which is fleet-wide.
   */
  operatingCities: readonly string[];
  /** Jobs completed this week in this vehicle. */
  jobsThisWeek: number;
  insuranceStatus: SampleComplianceStatus;
  /** Human date, e.g. "10 Sep 2026", or "not on file". */
  insuranceDue: string;
  inspectionDue: string;
};

/**
 * What a vehicle with no row in `SAMPLE_VEHICLE_FACTS` shows.
 *
 * Every one of these fields is missing from `Vehicle`, so a real fleet of any
 * size lands here — the keyed map below only matches the handoff's own seeded
 * plates. The fallback is deliberately neutral (zero odometer, fleet-average
 * cost, nothing on file) rather than plausible-looking, so an un-mapped vehicle
 * reads as "we do not track this yet" instead of as a real reading.
 *
 * Retire once `Vehicle` gains `odometerKm`, an `operatingCities` enum array and
 * a `VehicleCompliance` model holding insurance and inspection dates.
 */
export const SAMPLE_VEHICLE_FACTS_FALLBACK: SampleVehicleFacts = {
  odometerKm: 0,
  costPerKmGel: 0.4,
  fuel: "Diesel",
  operatingCities: ["Tbilisi"],
  jobsThisWeek: 0,
  insuranceStatus: "Pending",
  insuranceDue: "not on file",
  inspectionDue: "not on file",
};

/**
 * Per-vehicle placeholders, keyed by `Vehicle.plateNumber` (which is `@unique`,
 * so it is a safe key and — unlike a cuid — one a designer can read).
 *
 * These are the handoff prototype's seven plates. In any database but a seeded
 * demo they simply will not match, and `sampleVehicleFacts()` falls through to
 * the neutral fallback above; the map exists so the designed screen can be
 * compared against the design pixel for pixel.
 *
 * Retire with `SAMPLE_VEHICLE_FACTS_FALLBACK`.
 */
export const SAMPLE_VEHICLE_FACTS: Record<string, SampleVehicleFacts> = {
  "AB-482-QM": {
    odometerKm: 184210,
    costPerKmGel: 0.42,
    fuel: "Diesel",
    operatingCities: ["Tbilisi", "Rustavi"],
    jobsThisWeek: 46,
    insuranceStatus: "Expiring soon",
    insuranceDue: "10 Sep 2026",
    inspectionDue: "21 Oct 2026",
  },
  "CD-107-TB": {
    odometerKm: 96480,
    costPerKmGel: 0.38,
    fuel: "Diesel",
    operatingCities: ["Tbilisi"],
    jobsThisWeek: 46,
    insuranceStatus: "Valid",
    insuranceDue: "14 Mar 2027",
    inspectionDue: "14 Mar 2027",
  },
  "EF-556-GG": {
    odometerKm: 231900,
    costPerKmGel: 0.19,
    fuel: "Hybrid",
    operatingCities: ["Tbilisi", "Mtskheta"],
    jobsThisWeek: 46,
    insuranceStatus: "Valid",
    insuranceDue: "2 Feb 2027",
    inspectionDue: "2 Feb 2027",
  },
  "GH-903-KA": {
    odometerKm: 318640,
    costPerKmGel: 0.61,
    fuel: "Diesel",
    operatingCities: ["Kutaisi", "Batumi"],
    jobsThisWeek: 0,
    insuranceStatus: "Valid",
    insuranceDue: "9 Sep 2026",
    inspectionDue: "9 Sep 2026",
  },
  "IJ-221-QW": {
    odometerKm: 142050,
    costPerKmGel: 0.31,
    fuel: "Diesel",
    operatingCities: ["Tbilisi", "Gori"],
    jobsThisWeek: 46,
    insuranceStatus: "Valid",
    insuranceDue: "30 Nov 2026",
    inspectionDue: "30 Nov 2026",
  },
  "KL-640-BS": {
    odometerKm: 276330,
    costPerKmGel: 0.47,
    fuel: "Diesel",
    operatingCities: ["Batumi"],
    jobsThisWeek: 0,
    insuranceStatus: "Expired",
    insuranceDue: "4 Aug 2026",
    inspectionDue: "4 Aug 2026",
  },
  "MN-318-RS": {
    odometerKm: 61420,
    costPerKmGel: 0.44,
    fuel: "Diesel",
    operatingCities: ["Tbilisi", "Kutaisi", "Batumi"],
    jobsThisWeek: 0,
    insuranceStatus: "Valid",
    insuranceDue: "18 Jan 2027",
    inspectionDue: "18 Jan 2027",
  },
};

/**
 * Placeholders for one vehicle, by plate, never `undefined`.
 *
 * The lookup is total on purpose: the Vehicles screen renders whatever
 * `Vehicle` rows the fleet actually has, and a missing map entry must degrade
 * to a neutral row rather than blank out a column or throw.
 */
export function sampleVehicleFacts(plateNumber: string): SampleVehicleFacts {
  // `noUncheckedIndexedAccess` makes the miss explicit, which is exactly the
  // case this helper exists to absorb.
  return SAMPLE_VEHICLE_FACTS[plateNumber] ?? SAMPLE_VEHICLE_FACTS_FALLBACK;
}

/**
 * Assumed kilometres driven per month, the multiplier turning a cost-per-km
 * into the running-costs card's fuel line.
 *
 * Retire with `Vehicle.odometerKm`: real monthly distance is the difference
 * between two odometer readings, not a constant.
 */
export const SAMPLE_MONTHLY_KM = 1600;

/**
 * Fixed monthly running costs, identical for every vehicle because nothing
 * records them per vehicle.
 *
 * Retire once a `VehicleExpense` model records service, insurance and toll
 * charges against a vehicle and a date.
 */
export const SAMPLE_FIXED_RUNNING_COSTS: readonly SampleRunningCost[] = [
  { label: "Service & parts", amountGel: 280.0 },
  { label: "Insurance (monthly)", amountGel: 96.0 },
  { label: "Parking & tolls", amountGel: 64.5 },
];

/**
 * The vehicle detail panel's "Running costs · this month" lines: an estimated
 * fuel line derived from the vehicle's cost-per-km, then the fixed lines.
 *
 * Retire with `SAMPLE_FIXED_RUNNING_COSTS`.
 */
export function sampleRunningCosts(
  costPerKmGel: number,
): readonly SampleRunningCost[] {
  return [
    {
      label: "Fuel",
      amountGel: Number((costPerKmGel * SAMPLE_MONTHLY_KM).toFixed(2)),
    },
    ...SAMPLE_FIXED_RUNNING_COSTS,
  ];
}

/**
 * Fleet-wide cost per kilometre, for the Vehicles screen's fourth tile.
 *
 * Retire with `VehicleExpense`; the real figure is total expenses over total
 * distance, both of which the schema is missing.
 */
export const SAMPLE_FLEET_COST_PER_KM_GEL = 0.4;

/* ------------------------------------------------------------------------- */
/* Per-driver facts                                                          */
/* ------------------------------------------------------------------------- */

/** Status of one row in the driver detail panel's Verification list. */
export type SampleVerificationStatus =
  "Verified" | "In review" | "Valid" | "Expired";

export type SampleVerificationRow = {
  label: string;
  status: SampleVerificationStatus;
};

export type SampleDriverFacts = {
  /** Average customer rating, or `null` for a driver with no rated jobs. */
  rating: number | null;
  acceptanceRatePercent: number;
  verification: readonly SampleVerificationRow[];
};

/**
 * The verification rows shown for a driver with no entry in
 * `SAMPLE_DRIVER_FACTS`.
 *
 * "In review" throughout rather than "Verified": claiming a document has been
 * checked when nothing checked it is the one placeholder on these screens that
 * could actually mislead an operator into dispatching a non-compliant driver.
 *
 * Note that only the *status* is fictional — `DriverLicence.expiresAt` is real,
 * which is why the Today screen's licence-expiry alert is not in this module.
 *
 * Retire once a `DriverDocument` model tracks each required document's review
 * state (the admin application flow verifies them once at onboarding, but
 * `DriverApplication` does not model ongoing validity).
 */
export const SAMPLE_DRIVER_VERIFICATION_FALLBACK: readonly SampleVerificationRow[] =
  [
    { label: "Driver licence (GE)", status: "In review" },
    { label: "Vehicle registration", status: "In review" },
    { label: "Insurance policy", status: "In review" },
    { label: "Technical inspection", status: "In review" },
  ];

/**
 * What a driver with no row in `SAMPLE_DRIVER_FACTS` shows.
 *
 * `rating: null` — the roster prints "—" for it — because a made-up rating is
 * the sample value most likely to be read as a judgement about a real person.
 *
 * Retire once an `OrderRating` model and a `JobOffer` model exist (see
 * `SAMPLE_AVG_RATING` and `SAMPLE_ACCEPTANCE_RATE_PERCENT`).
 */
export const SAMPLE_DRIVER_FACTS_FALLBACK: SampleDriverFacts = {
  rating: null,
  acceptanceRatePercent: 0,
  verification: SAMPLE_DRIVER_VERIFICATION_FALLBACK,
};

/**
 * Per-driver placeholders, keyed by `DriverProfile.id`.
 *
 * Seeded from the handoff prototype, whose driver ids ("GE-88214") are display
 * ids the schema does not have — so in a real database every lookup misses and
 * `sampleDriverFacts()` returns the neutral fallback. Kept keyed rather than
 * flat so that seeding a demo fleet with these ids reproduces the design, and
 * so the shape is already right when a real per-driver source arrives.
 *
 * Retire with `SAMPLE_DRIVER_FACTS_FALLBACK`.
 */
export const SAMPLE_DRIVER_FACTS: Record<string, SampleDriverFacts> = {
  "GE-88214": {
    rating: 4.86,
    acceptanceRatePercent: 93,
    verification: [
      { label: "Driver licence (GE)", status: "Verified" },
      { label: "Vehicle registration", status: "Verified" },
      { label: "Insurance policy", status: "Valid" },
      { label: "Technical inspection", status: "Valid" },
    ],
  },
  "GE-88301": {
    rating: 4.92,
    acceptanceRatePercent: 93,
    verification: [
      { label: "Driver licence (GE)", status: "Verified" },
      { label: "Vehicle registration", status: "Verified" },
      { label: "Insurance policy", status: "Valid" },
      { label: "Technical inspection", status: "Valid" },
    ],
  },
  "GE-87940": {
    rating: 4.71,
    acceptanceRatePercent: 93,
    verification: [
      { label: "Driver licence (GE)", status: "Verified" },
      { label: "Vehicle registration", status: "Verified" },
      { label: "Insurance policy", status: "Valid" },
      { label: "Technical inspection", status: "Valid" },
    ],
  },
  "GE-88422": {
    rating: 4.88,
    acceptanceRatePercent: 93,
    verification: [
      { label: "Driver licence (GE)", status: "Verified" },
      { label: "Vehicle registration", status: "Verified" },
      { label: "Insurance policy", status: "Valid" },
      { label: "Technical inspection", status: "Valid" },
    ],
  },
  // A driver still being reviewed: registration not yet cleared.
  "GE-88510": {
    rating: null,
    acceptanceRatePercent: 93,
    verification: [
      { label: "Driver licence (GE)", status: "Verified" },
      { label: "Vehicle registration", status: "In review" },
      { label: "Insurance policy", status: "Valid" },
      { label: "Technical inspection", status: "Valid" },
    ],
  },
  "GE-87755": {
    rating: 4.79,
    acceptanceRatePercent: 93,
    verification: [
      { label: "Driver licence (GE)", status: "Verified" },
      { label: "Vehicle registration", status: "Verified" },
      { label: "Insurance policy", status: "Valid" },
      { label: "Technical inspection", status: "Valid" },
    ],
  },
  // A suspended driver: the expired policy is why they are suspended.
  "GE-86903": {
    rating: 4.42,
    acceptanceRatePercent: 61,
    verification: [
      { label: "Driver licence (GE)", status: "Verified" },
      { label: "Vehicle registration", status: "Verified" },
      { label: "Insurance policy", status: "Expired" },
      { label: "Technical inspection", status: "Valid" },
    ],
  },
};

/**
 * Placeholders for one driver, by `DriverProfile.id`, never `undefined`.
 *
 * Total for the same reason `sampleVehicleFacts()` is: the Drivers screen
 * renders the fleet's real roster, however large, and an unmapped driver must
 * still produce a complete row.
 */
export function sampleDriverFacts(driverProfileId: string): SampleDriverFacts {
  return SAMPLE_DRIVER_FACTS[driverProfileId] ?? SAMPLE_DRIVER_FACTS_FALLBACK;
}

/**
 * Fleet-wide average rating and the rated-job count behind it, for the Drivers
 * screen's third tile.
 *
 * Retire with the `OrderRating` model.
 */
export const SAMPLE_FLEET_AVG_RATING = 4.76;
export const SAMPLE_FLEET_RATED_JOB_COUNT = 214;

/* ========================================================================= */
/* ROLE DEFINITIONS — real product content, not sample data                  */
/* ========================================================================= */

/**
 * Everything from here to the end of this block is **real product content**:
 * these are the roles the product offers a fleet and exactly what each one may
 * do. They live in this file only because there is no `Employee` /
 * `EmployeeRole` model to hang them off yet — not because they are invented.
 *
 * They are therefore the one thing on the Employees screen that must *not*
 * carry a `<SampleNote />`. The people in `SAMPLE_EMPLOYEE_ROSTER` below are
 * fictional; the permission matrices here are the specification.
 *
 * When the `EmployeeRole` model lands these move into it (or into a seed) —
 * unchanged. Nothing here needs revisiting for accuracy first.
 */

export type EmployeeRoleName =
  "Fleet manager" | "Dispatcher" | "Accountant" | "Mechanic" | "Driver";

/** What a role may do in one area of the product. */
export type EmployeePermissionLevel = "Manage" | "View" | "None";

export type EmployeePermission = {
  /** Area of the product, e.g. "Earnings & payouts". */
  area: string;
  level: EmployeePermissionLevel;
};

export type EmployeeRoleDefinition = {
  role: EmployeeRoleName;
  /** One-line summary, shown beside the role in the invite form. */
  summary: string;
  permissions: readonly EmployeePermission[];
};

/**
 * The order roles are offered in — most privileged first, which is also the
 * order the invite form's radio rows use.
 */
export const EMPLOYEE_ROLE_ORDER: readonly EmployeeRoleName[] = [
  "Fleet manager",
  "Dispatcher",
  "Accountant",
  "Mechanic",
  "Driver",
];

/** The five roles and their permission matrices. Real product content. */
export const EMPLOYEE_ROLE_DEFINITIONS: Record<
  EmployeeRoleName,
  EmployeeRoleDefinition
> = {
  "Fleet manager": {
    role: "Fleet manager",
    summary: "Vehicles, drivers and compliance",
    permissions: [
      { area: "Vehicles", level: "Manage" },
      { area: "Drivers", level: "Manage" },
      { area: "Compliance documents", level: "Manage" },
      { area: "Earnings & payouts", level: "View" },
      { area: "Employees", level: "View" },
    ],
  },
  Dispatcher: {
    role: "Dispatcher",
    summary: "Assigns jobs inside their zones",
    permissions: [
      { area: "Jobs", level: "Manage" },
      { area: "Drivers", level: "View" },
      { area: "Vehicles", level: "View" },
      { area: "Earnings & payouts", level: "None" },
      { area: "Employees", level: "None" },
    ],
  },
  Accountant: {
    role: "Accountant",
    summary: "Payouts, invoices and tax",
    permissions: [
      { area: "Earnings & payouts", level: "Manage" },
      { area: "Invoices & tax", level: "Manage" },
      { area: "Jobs", level: "View" },
      { area: "Drivers", level: "View" },
      { area: "Vehicles", level: "None" },
    ],
  },
  Mechanic: {
    role: "Mechanic",
    summary: "Service log and inspections",
    permissions: [
      { area: "Vehicles", level: "Manage" },
      { area: "Service log", level: "Manage" },
      { area: "Compliance documents", level: "View" },
      { area: "Jobs", level: "None" },
      { area: "Earnings & payouts", level: "None" },
    ],
  },
  Driver: {
    role: "Driver",
    summary: "Own jobs and earnings only",
    permissions: [
      { area: "Own jobs", level: "View" },
      { area: "Own earnings", level: "View" },
      { area: "Vehicles", level: "None" },
      { area: "Drivers", level: "None" },
      { area: "Employees", level: "None" },
    ],
  },
};

/**
 * One role's definition, never `undefined` — `EmployeeRoleName` is closed, so
 * this is total by construction and exists only to spare callers the
 * `noUncheckedIndexedAccess` narrowing on every read.
 */
export function employeeRoleDefinition(
  role: EmployeeRoleName,
): EmployeeRoleDefinition {
  return EMPLOYEE_ROLE_DEFINITIONS[role];
}

/* ========================================================================= */
/* END role definitions — everything below is sample data again              */
/* ========================================================================= */

/* ------------------------------------------------------------------------- */
/* Employees roster                                                          */
/* ------------------------------------------------------------------------- */

export type SampleEmployeeStatus = "Active" | "Invited" | "Suspended";

/** A key/value row in the employee detail panel's "Assigned" list. */
export type SampleEmployeeAssignment = { label: string; value: string };

export type SampleEmployee = {
  name: string;
  email: string;
  role: EmployeeRoleName;
  /** What they cover, e.g. "Vake · Saburtalo · Vera". */
  scope: string;
  /** Pre-formatted relative time — see the roster's own comment. */
  lastActive: string;
  status: SampleEmployeeStatus;
  /** Sentence under the role pill in the detail panel. */
  roleNote: string;
  assigned: readonly SampleEmployeeAssignment[];
};

/**
 * The Employees screen's entire roster — **every person here is fictional**.
 *
 * This is the one screen with no real backing at all: there is no `Employee`
 * model, no membership record and no invitation flow, so the roster, the invite
 * action and the remove action are all placeholder (the two mutations ship
 * visibly disabled). Their permission sets come from
 * `EMPLOYEE_ROLE_DEFINITIONS` above, which *is* real — only the people are not.
 *
 * `lastActive` is a pre-formatted string rather than a timestamp on purpose: it
 * is not derived from anything, and storing a `Date` here would invite a screen
 * to render "2 minutes ago" against a clock that never moves.
 *
 * Retire once an `Employee` model (person, email, role, scope, invite state)
 * hangs off `LogisticsCompany`.
 */
export const SAMPLE_EMPLOYEE_ROSTER: readonly SampleEmployee[] = [
  {
    name: "Marika Dolidze",
    email: "marika@gizocargo.ge",
    role: "Fleet manager",
    scope: "All vehicles · all zones",
    lastActive: "5 min ago",
    status: "Active",
    roleNote:
      "Full access to vehicles, drivers and compliance. Cannot change payout accounts.",
    assigned: [
      { label: "Vehicles", value: "7" },
      { label: "Drivers", value: "7" },
      { label: "Zones", value: "Tbilisi (all)" },
    ],
  },
  {
    name: "Irakli Beruashvili",
    email: "irakli@gizocargo.ge",
    role: "Dispatcher",
    scope: "Vake · Saburtalo · Vera",
    lastActive: "2 min ago",
    status: "Active",
    roleNote:
      "Assigns and reassigns jobs inside their zones. No access to money or documents.",
    assigned: [
      { label: "Zones", value: "3" },
      { label: "Drivers", value: "4" },
      { label: "Shift", value: "08:00–17:00" },
    ],
  },
  {
    name: "Sopo Kiknadze",
    email: "sopo@gizocargo.ge",
    role: "Accountant",
    scope: "Payouts · invoices",
    lastActive: "1 h ago",
    status: "Active",
    roleNote:
      "Reconciles weekly payouts and exports invoices. Read-only on operations.",
    assigned: [
      { label: "Payout accounts", value: "2" },
      { label: "Tax ID", value: "404-882-140" },
      { label: "Period", value: "Weekly" },
    ],
  },
  {
    name: "Vano Shengelia",
    email: "vano@gizocargo.ge",
    role: "Mechanic",
    scope: "Service log · inspections",
    lastActive: "Yesterday",
    status: "Active",
    roleNote:
      "Records service work and inspection results against each vehicle.",
    assigned: [
      { label: "Vehicles", value: "7" },
      { label: "Open work orders", value: "2" },
      { label: "Garage", value: "Didube" },
    ],
  },
  {
    name: "Elene Abashidze",
    email: "elene@gizocargo.ge",
    role: "Dispatcher",
    scope: "Gldani · Didube · Isani",
    lastActive: "Invite sent 27 Aug",
    status: "Invited",
    roleNote: "Invitation pending. Permissions apply once they accept.",
    assigned: [
      { label: "Zones", value: "3" },
      { label: "Drivers", value: "3" },
      { label: "Shift", value: "12:00–21:00" },
    ],
  },
  {
    name: "Zurab Maisuradze",
    email: "zurab@gizocargo.ge",
    role: "Driver",
    scope: "Own jobs only",
    lastActive: "3 days ago",
    status: "Suspended",
    roleNote: "Employed driver. Access suspended while insurance is expired.",
    assigned: [
      { label: "Vehicle", value: "MN-318-RS" },
      { label: "Zone", value: "Samgori" },
      { label: "Contract", value: "Full time" },
    ],
  },
];

/**
 * The Employees screen's four tiles. Counts are stated rather than derived from
 * `SAMPLE_EMPLOYEE_ROSTER` so that the copy under each ("Accountant only") and
 * the number above it can never disagree.
 *
 * Retire with `SAMPLE_EMPLOYEE_ROSTER`.
 */
export const SAMPLE_EMPLOYEE_TILES = {
  employees: { value: 6, note: "1 invite pending" },
  rolesInUse: {
    value: 4,
    note: "Fleet manager, dispatcher, accountant, mechanic",
  },
  canMoveMoney: { value: 1, note: "Accountant only" },
  needsReview: { value: 2, note: "1 invited, 1 suspended" },
} as const;
