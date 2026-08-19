/**
 * The contract for the composable landing page, shared by three places that
 * would otherwise drift apart:
 *
 * - the admin form (`@/components/admin/content/home-page-section-form-dialog`),
 *   which builds a `content` object per section type;
 * - the `/api/admin/content/home-page-sections` routes, which validate whatever
 *   arrives before it becomes a `HomePageSection.content` JSON column;
 * - the public landing page, which reads those rows back and hands the parsed
 *   content to the components under `@/components/landing/`.
 *
 * `HomePageSection.type` and `.content` are a free-form `String` and `Json` in
 * the schema on purpose (adding a section is a content change, not a
 * migration), so this module is the only thing giving them a shape. It is
 * deliberately dependency-free — no Prisma, no `server-only` — because the
 * public landing sections are client components and import it directly.
 *
 * The default copy lives here rather than inside each landing component so
 * there is exactly one source for it: the components fall back to these values
 * when no `HomePageSection` row exists (the expected state until a human seeds
 * real content), and the admin form pre-fills a new section with the same copy
 * that is currently on the page.
 */

/** Every section type the landing page knows how to render, ordered by type. */
export const HOME_PAGE_SECTION_TYPES = [
  "hero",
  "category_tiles",
  "vehicle_types",
  "how_it_works",
  "faq",
  "driver_cta",
] as const;

export type HomePageSectionType = (typeof HOME_PAGE_SECTION_TYPES)[number];

/** How each type is named in the admin UI. */
export const HOME_PAGE_SECTION_TYPE_LABELS: Record<
  HomePageSectionType,
  string
> = {
  hero: "Hero",
  category_tiles: "What we carry (category tiles)",
  vehicle_types: "The fleet (vehicle types)",
  how_it_works: "How it works",
  faq: "FAQ",
  driver_cta: "Driver CTA",
};

/**
 * `Banner.placement` keys the landing page reads. The column is free-form (see
 * the model doc), so these constants are the convention the admin banner form
 * and this page agree on.
 */
export const HOME_HERO_BANNER_PLACEMENT = "home_hero";
export const HOME_SECONDARY_BANNER_PLACEMENT = "home_secondary";

/**
 * The hero's editable copy. The three stat figures beside it are counted from
 * the live vehicle taxonomy rather than written by hand, so they are not
 * content and do not appear here.
 */
export type HeroContent = {
  eyebrow: string;
  /** Leading half of the headline, before the accented word. */
  headline: string;
  /** The accented, underlined word that closes the headline. */
  headlineHighlight: string;
  subtext: string;
  primaryCtaLabel: string;
  primaryCtaHref: string;
  secondaryCtaLabel: string;
  secondaryCtaHref: string;
};

/**
 * The category tiles' framing copy only. The tiles themselves are generated
 * from the cargo taxonomy and its pricing rules, so they are never authored.
 */
export type CategoryTilesContent = {
  eyebrow: string;
  heading: string;
  intro: string;
};

/** Framing copy for the fleet section; the vehicles come from the taxonomy. */
export type VehicleTypesContent = {
  eyebrow: string;
  heading: string;
};

export type HowItWorksStep = {
  title: string;
  body: string;
};

export type HowItWorksContent = {
  eyebrow: string;
  heading: string;
  /** The short paragraph set opposite the heading. */
  aside: string;
  /** Steps in order; the displayed number is the position, not a field. */
  steps: HowItWorksStep[];
};

export type FaqItem = {
  question: string;
  answer: string;
};

export type FaqContent = {
  eyebrow: string;
  heading: string;
  intro: string;
  items: FaqItem[];
};

/**
 * The driver CTA's copy. Its button target is not editable: where a driver
 * signs up depends on whether the merchant/client host split is enabled, which
 * is deployment configuration rather than content.
 */
export type DriverCtaContent = {
  eyebrow: string;
  /** Rendered line by line, so a newline is a deliberate line break. */
  headline: string;
  subtext: string;
  ctaLabel: string;
  points: string[];
};

/** Maps each section type to the shape of its `content` column. */
export type HomePageSectionContentByType = {
  hero: HeroContent;
  category_tiles: CategoryTilesContent;
  vehicle_types: VehicleTypesContent;
  how_it_works: HowItWorksContent;
  faq: FaqContent;
  driver_cta: DriverCtaContent;
};

export type HomePageSectionContent =
  HomePageSectionContentByType[HomePageSectionType];

/**
 * A validated section: a discriminated union, so `switch (section.type)` in the
 * renderer narrows `content` to exactly the shape that type's component needs.
 */
export type HomePageSectionData = {
  [Type in HomePageSectionType]: {
    type: Type;
    content: HomePageSectionContentByType[Type];
  };
}[HomePageSectionType];

/** Whether a stored `HomePageSection.type` string is one this app renders. */
export function isHomePageSectionType(
  value: string,
): value is HomePageSectionType {
  return (HOME_PAGE_SECTION_TYPES as readonly string[]).includes(value);
}

/**
 * The copy currently on the public landing page, which is also what it falls
 * back to when a locale has no `HomePageSection` rows yet.
 */
export const DEFAULT_HOME_PAGE_CONTENT: HomePageSectionContentByType = {
  hero: {
    eyebrow: "Commercial freight & cargo",
    headline: "Move anything across the",
    headlineHighlight: "city",
    subtext:
      "Furniture, appliances, full relocations, industrial cargo. Set the route, pick the truck that carries the load, and get a price before you book — then watch a nearby driver move it, door to door.",
    primaryCtaLabel: "Get started",
    primaryCtaHref: "/sign-up",
    secondaryCtaLabel: "Sign in",
    secondaryCtaHref: "/sign-in",
  },
  category_tiles: {
    eyebrow: "What we carry",
    heading: "Ship anything, across the city",
    intro:
      "Pick the category your load falls under and the vehicle rated to carry it comes with it. Figures below are a starting point for a short cross-town run — your price is calculated on the route you enter.",
  },
  vehicle_types: {
    eyebrow: "The fleet",
    heading: "Pick the vehicle the load actually needs",
  },
  how_it_works: {
    eyebrow: "How it works",
    heading: "Three steps from kerb to kerb",
    aside:
      "Built for the load that won't fit in a car boot — an office move, a pallet of stock, a machine that needs a tail lift.",
    steps: [
      {
        title: "Set the route",
        body: "Type the pickup and dropoff — addresses autocomplete as you go — then tell us what you're moving: furniture, appliances, retail stock, or a full relocation.",
      },
      {
        title: "Lock the price",
        body: "Pick a vehicle rated for the load and we quote it on real distance, driving time and whether you need a helper. No auction, no surprise line items at the door.",
      },
      {
        title: "Track it to the door",
        body: "A nearby driver accepts the job and it goes live on your map. Follow the vehicle from loading to unload, and keep every order in your account.",
      },
    ],
  },
  faq: {
    eyebrow: "Questions",
    heading: "Before you book",
    intro:
      "What sits behind the quote, how a vehicle is matched to the load, and what happens once a driver takes the job.",
    items: [
      {
        question: "How is the price worked out?",
        answer:
          "We geocode both addresses and price the distance between them with the vehicle type's own rates: a base fare, a per-kilometre rate and a rate for the estimated time of the trip. A helper, if you ask for one, adds a flat fee on top. You get the total itemised, and the same calculation runs when you place the order — the estimate is not a separate marketing number.",
      },
      {
        question: "Which vehicle should I book?",
        answer:
          "Vehicles come in two duty classes, medium-duty and heavy-duty, and each cargo category only offers the classes that can take it. Furniture, appliances, retail stock and event equipment go either way; a full relocation, industrial supplies and construction materials are heavy-duty only. Every type lists its maximum payload, so you can match the rating to the load.",
      },
      {
        question: "What does adding a helper do?",
        answer:
          "A helper is a second pair of hands who rides along to load and unload with the driver. It is a flat fee on top of the distance and time components, so tick it before you price the job and it is already in the total and in the breakdown you see.",
      },
      {
        question: "Who actually moves my cargo?",
        answer:
          "An order starts out pending until a transport provider takes it. That is either an independent driver, who accepts it with one of the vehicles registered to their profile, or a logistics company, which claims the job and dispatches it to a driver on its own roster.",
      },
      {
        question: "Can I follow the delivery?",
        answer:
          "Yes. Once an order is accepted it gets its own tracking page: pickup and dropoff on a map, plus the driver's position as they report it, refreshed while you watch. The status moves from accepted to in transit to completed, and the order stays in your account afterwards.",
      },
    ],
  },
  driver_cta: {
    eyebrow: "For transport providers",
    headline: "Own a truck?\nPut it to work.",
    subtext:
      "Sign up as a driver or a logistics company, register your vehicles, and start accepting freight jobs from shippers near you.",
    ctaLabel: "Become a driver",
    points: [
      "Take the loads that suit your vehicle, your payload rating and your day.",
      "Every job shows the route, the cargo and the payout before you accept.",
      "Driving your own truck or running a fleet — both sign up here.",
    ],
  },
};

/** Either a validated value or the reason it was rejected. */
type Parsed<Value> = { data: Value } | { error: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Reads a fixed set of required, non-empty string fields off a record.
 *
 * Every content shape here is (mostly) a bag of trimmed strings, so one helper
 * covers them instead of each parser repeating the same eight checks. The
 * `Record<Key, string>` it returns is structurally the content type the caller
 * declares, which is what keeps the parsers this short.
 */
function readStrings<Key extends string>(
  record: Record<string, unknown>,
  keys: readonly Key[],
  context: string,
): Parsed<Record<Key, string>> {
  const result = {} as Record<Key, string>;

  for (const key of keys) {
    const value = record[key];

    if (typeof value !== "string" || value.trim() === "") {
      return {
        error: `${context}.${key} is required and must be a non-empty string.`,
      };
    }

    result[key] = value.trim();
  }

  return { data: result };
}

/**
 * Reads an array of repeated sub-entries (FAQ items, how-it-works steps), each
 * validated with the same string rules as a top-level field.
 *
 * An empty array is allowed: a section with no items yet is a half-finished
 * edit, not corrupt data, and it renders as an empty list rather than breaking.
 */
function readEntryArray<Key extends string>(
  record: Record<string, unknown>,
  key: string,
  fields: readonly Key[],
  context: string,
): Parsed<Record<Key, string>[]> {
  const value = record[key];

  if (!Array.isArray(value)) {
    return { error: `${context}.${key} must be an array.` };
  }

  const entries: Record<Key, string>[] = [];

  for (const [index, entry] of value.entries()) {
    const entryRecord = asRecord(entry);

    if (!entryRecord) {
      return { error: `${context}.${key}[${index}] must be an object.` };
    }

    const parsed = readStrings(
      entryRecord,
      fields,
      `${context}.${key}[${index}]`,
    );

    if ("error" in parsed) {
      return { error: parsed.error };
    }

    entries.push(parsed.data);
  }

  return { data: entries };
}

/** Reads an array of plain non-empty strings (the driver CTA's bullet list). */
function readStringArray(
  record: Record<string, unknown>,
  key: string,
  context: string,
): Parsed<string[]> {
  const value = record[key];

  if (!Array.isArray(value)) {
    return { error: `${context}.${key} must be an array.` };
  }

  const entries: string[] = [];

  for (const [index, entry] of value.entries()) {
    if (typeof entry !== "string" || entry.trim() === "") {
      return {
        error: `${context}.${key}[${index}] must be a non-empty string.`,
      };
    }

    entries.push(entry.trim());
  }

  return { data: entries };
}

function parseHeroContent(value: unknown): Parsed<HeroContent> {
  const record = asRecord(value);
  if (!record) {
    return { error: "hero content must be an object." };
  }

  return readStrings(
    record,
    [
      "eyebrow",
      "headline",
      "headlineHighlight",
      "subtext",
      "primaryCtaLabel",
      "primaryCtaHref",
      "secondaryCtaLabel",
      "secondaryCtaHref",
    ],
    "hero",
  );
}

function parseCategoryTilesContent(
  value: unknown,
): Parsed<CategoryTilesContent> {
  const record = asRecord(value);
  if (!record) {
    return { error: "category_tiles content must be an object." };
  }

  return readStrings(record, ["eyebrow", "heading", "intro"], "category_tiles");
}

function parseVehicleTypesContent(value: unknown): Parsed<VehicleTypesContent> {
  const record = asRecord(value);
  if (!record) {
    return { error: "vehicle_types content must be an object." };
  }

  return readStrings(record, ["eyebrow", "heading"], "vehicle_types");
}

function parseHowItWorksContent(value: unknown): Parsed<HowItWorksContent> {
  const record = asRecord(value);
  if (!record) {
    return { error: "how_it_works content must be an object." };
  }

  const text = readStrings(
    record,
    ["eyebrow", "heading", "aside"],
    "how_it_works",
  );
  if ("error" in text) {
    return { error: text.error };
  }

  const steps = readEntryArray(
    record,
    "steps",
    ["title", "body"],
    "how_it_works",
  );
  if ("error" in steps) {
    return { error: steps.error };
  }

  return { data: { ...text.data, steps: steps.data } };
}

function parseFaqContent(value: unknown): Parsed<FaqContent> {
  const record = asRecord(value);
  if (!record) {
    return { error: "faq content must be an object." };
  }

  const text = readStrings(record, ["eyebrow", "heading", "intro"], "faq");
  if ("error" in text) {
    return { error: text.error };
  }

  const items = readEntryArray(record, "items", ["question", "answer"], "faq");
  if ("error" in items) {
    return { error: items.error };
  }

  return { data: { ...text.data, items: items.data } };
}

function parseDriverCtaContent(value: unknown): Parsed<DriverCtaContent> {
  const record = asRecord(value);
  if (!record) {
    return { error: "driver_cta content must be an object." };
  }

  const text = readStrings(
    record,
    ["eyebrow", "headline", "subtext", "ctaLabel"],
    "driver_cta",
  );
  if ("error" in text) {
    return { error: text.error };
  }

  const points = readStringArray(record, "points", "driver_cta");
  if ("error" in points) {
    return { error: points.error };
  }

  return { data: { ...text.data, points: points.data } };
}

/**
 * Validates a `(type, content)` pair, whether it came from a request body or
 * from the `Json` column of an existing row.
 *
 * Both sides need this: the API routes because a `Json` column will store
 * literally anything otherwise, and the public renderer because a row written
 * before a shape changed (or edited straight in the database) must not be able
 * to crash the landing page. Callers on the read side treat a rejection as
 * "skip this section", not as an error to surface to a visitor.
 */
export function parseHomePageSection(
  type: string,
  content: unknown,
): Parsed<HomePageSectionData> {
  if (!isHomePageSectionType(type)) {
    return {
      error: `type must be one of: ${HOME_PAGE_SECTION_TYPES.join(", ")}.`,
    };
  }

  // Each branch narrows `type` to a single literal, so the object built from it
  // lands on exactly one member of the `HomePageSectionData` union.
  switch (type) {
    case "hero": {
      const parsed = parseHeroContent(content);
      return "error" in parsed
        ? parsed
        : { data: { type, content: parsed.data } };
    }
    case "category_tiles": {
      const parsed = parseCategoryTilesContent(content);
      return "error" in parsed
        ? parsed
        : { data: { type, content: parsed.data } };
    }
    case "vehicle_types": {
      const parsed = parseVehicleTypesContent(content);
      return "error" in parsed
        ? parsed
        : { data: { type, content: parsed.data } };
    }
    case "how_it_works": {
      const parsed = parseHowItWorksContent(content);
      return "error" in parsed
        ? parsed
        : { data: { type, content: parsed.data } };
    }
    case "faq": {
      const parsed = parseFaqContent(content);
      return "error" in parsed
        ? parsed
        : { data: { type, content: parsed.data } };
    }
    case "driver_cta": {
      const parsed = parseDriverCtaContent(content);
      return "error" in parsed
        ? parsed
        : { data: { type, content: parsed.data } };
    }
  }
}
