import { getMessages, getTranslations } from "next-intl/server";

import { withLocalePrefix, type AppLocale } from "@/i18n/routing";
import {
  createMessageLookup,
  localizeDefaultHomePageContent,
  type ClosingCtaContent,
  type CoverageContent,
  type DriverCtaContent,
  type FaqContent,
  type FooterColumn,
  type FooterContent,
  type HeroContent,
  type HowItWorksContent,
  type NavContent,
  type VehicleTypesContent,
} from "@/lib/admin/home-page-content";
import { merchantOrigin } from "@/lib/host";
import {
  CITY_LANDING_SLUGS,
  cityLandingPath,
  type CityLandingSlug,
} from "@/lib/seo/cities";

/**
 * Everything one city landing page renders, resolved on the server.
 *
 * The page reuses the main landing page's section components, which take their
 * copy as props. Composing those props here — rather than letting a client
 * section read the `cityLanding` catalog itself — is what lets the root layout
 * keep that namespace out of the client bundle (see `src/app/[locale]/layout.tsx`).
 */

/** One "why us" card under the city intro. */
export type CityWhyCard = { title: string; body: string };

export type CityIntroContent = {
  eyebrow: string;
  heading: string;
  paragraphs: string[];
  whyCards: CityWhyCard[];
};

/** A link to another city's page; `label` is that city's keyword. */
export type CityLink = { slug: CityLandingSlug; label: string; href: string };

export type CityLinksContent = {
  eyebrow: string;
  heading: string;
  links: CityLink[];
};

export type CityLandingContent = {
  keyword: string;
  nav: NavContent;
  hero: HeroContent;
  intro: CityIntroContent;
  coverage: CoverageContent;
  howItWorks: HowItWorksContent;
  vehicles: VehicleTypesContent;
  drivers: DriverCtaContent;
  faq: FaqContent;
  otherCities: CityLinksContent;
  closing: ClosingCtaContent;
  footer: FooterContent;
};

/**
 * The catalog shapes are keyed objects (`s1…s4`, `q1…q5`) rather than arrays,
 * which keeps every message addressable by a plain `t("…")` key and the
 * catalog-parity spec simple. These are the keys, in display order.
 */
const WHY_KEYS = ["w1", "w2", "w3"] as const;
const AREA_KEYS = ["a1", "a2", "a3", "a4", "a5", "a6"] as const;
const STEP_KEYS = ["s1", "s2", "s3", "s4"] as const;
const FAQ_KEYS = ["q1", "q2", "q3", "q4", "q5"] as const;

/** In-page anchors, matching the `id`s the reused sections carry. */
const ANCHOR = {
  coverage: "#coverage",
  how: "#how",
  vehicles: "#vehicles",
  faq: "#faq",
  cities: "#cities",
} as const;

/** The client host's own registration page (CLIENT sign-up). */
const CLIENT_SIGN_UP_HREF = "/sign-up";

/**
 * Driver registration lives on the merchant host when the host split is on.
 * The locale is put in the URL so a Georgian reader lands on the Georgian form
 * without a cookie-negotiated redirect on the other host. With the split off,
 * the relative `/sign-up` is localized by `Link` like every in-app route.
 */
export function cityDriverSignUpHref(locale: AppLocale): string {
  const origin = merchantOrigin();
  return origin
    ? `${origin}${withLocalePrefix(locale, CLIENT_SIGN_UP_HREF)}`
    : CLIENT_SIGN_UP_HREF;
}

/**
 * The column of the default footer at `index`, or an empty column if the
 * default composition ever loses it. Read by position because the default
 * footer is a fixed literal in `DEFAULT_HOME_PAGE_CONTENT` (Product, Business,
 * Drivers, Company) and its titles are only addressable through it.
 */
function defaultFooterColumn(
  footer: FooterContent,
  index: number,
): FooterColumn {
  return footer.columns[index] ?? { title: "", links: [] };
}

export async function loadCityLandingContent({
  locale,
  city,
  isGated,
}: {
  locale: AppLocale;
  city: CityLandingSlug;
  /** Pre-launch: no booking CTAs, the driver sign-up is the primary action. */
  isGated: boolean;
}): Promise<CityLandingContent> {
  const [t, tCities, messages] = await Promise.all([
    getTranslations({ locale, namespace: "cityLanding" }),
    getTranslations({ locale, namespace: "cities.georgianCities" }),
    getMessages({ locale }),
  ]);

  // The landing page's own defaults in the reader's language, for the sections
  // whose copy is not city-specific (fleet, drivers, nav and footer labels).
  const defaults = localizeDefaultHomePageContent(
    createMessageLookup(messages),
  );

  const c = (key: string) => t(`cities.${city}.${key}`);
  const keyword = c("keyword");
  const driverSignUpHref = cityDriverSignUpHref(locale);

  // Before launch nothing on the client host can be booked, so the one action
  // the page offers is the driver sign-up (which is live on the merchant host);
  // after launch the primary action becomes booking.
  const primaryCta = isGated
    ? { label: t("shared.cta.becomeDriver"), href: driverSignUpHref }
    : { label: t("shared.cta.book"), href: CLIENT_SIGN_UP_HREF };
  const howCta = { label: t("shared.cta.howItWorks"), href: ANCHOR.how };

  const nav: NavContent = {
    wordmark: defaults.nav.wordmark,
    links: [
      { label: t("shared.nav.areas"), href: ANCHOR.coverage },
      { label: t("shared.nav.how"), href: ANCHOR.how },
      { label: t("shared.nav.vehicles"), href: ANCHOR.vehicles },
      { label: t("shared.nav.faq"), href: ANCHOR.faq },
      { label: t("shared.nav.cities"), href: ANCHOR.cities },
    ],
    // An empty `signInHref` tells the pill to drop its Sign in chip: there is
    // no client account to sign in to before launch.
    signInLabel: defaults.nav.signInLabel,
    signInHref: isGated ? "" : defaults.nav.signInHref,
    signUpLabel: isGated
      ? t("shared.cta.becomeDriver")
      : defaults.nav.signUpLabel,
    signUpHref: isGated ? driverSignUpHref : defaults.nav.signUpHref,
  };

  const hero: HeroContent = {
    eyebrow: "",
    headline: keyword,
    subtext: c("hero.subtext"),
    primaryCtaLabel: primaryCta.label,
    primaryCtaHref: primaryCta.href,
    secondaryCtaLabel: howCta.label,
    secondaryCtaHref: howCta.href,
    ...(isGated
      ? {
          statusChipText: t("shared.hero.chipGated"),
          statusChipTag: t("shared.hero.chipTag"),
        }
      : {}),
  };

  const intro: CityIntroContent = {
    eyebrow: t("shared.intro.eyebrow"),
    heading: c("intro.heading"),
    paragraphs: [c("intro.p1"), c("intro.p2")],
    whyCards: WHY_KEYS.map((key) => ({
      title: c(`why.${key}.title`),
      body: c(`why.${key}.body`),
    })),
  };

  const coverage: CoverageContent = {
    eyebrow: t("shared.areas.eyebrow"),
    heading: c("areas.heading"),
    body: c("areas.body"),
    ctaLabel: primaryCta.label,
    ctaHref: primaryCta.href,
    // No tier: the default landing's "Citywide"/"Regional" tiers are editorial
    // service claims, and these chips are districts within one city.
    cities: AREA_KEYS.map((key) => ({
      name: c(`areas.list.${key}`),
      tier: "",
    })),
  };

  const howItWorks: HowItWorksContent = {
    eyebrow: t("shared.howItWorks.eyebrow"),
    heading: t("shared.howItWorks.heading"),
    steps: STEP_KEYS.map((key) => ({
      title: t(`shared.howItWorks.steps.${key}.title`),
      body: t(`shared.howItWorks.steps.${key}.body`),
    })),
  };

  // The default intro states a vehicle count, and these pages make no numeric
  // claims, so it is dropped (the field is optional). The business panel sells
  // company registration, which is a post-launch action.
  const vehicles: VehicleTypesContent = {
    eyebrow: defaults.vehicle_types.eyebrow,
    heading: defaults.vehicle_types.heading,
    mediumDutyLabel: defaults.vehicle_types.mediumDutyLabel,
    heavyDutyLabel: defaults.vehicle_types.heavyDutyLabel,
    ...(isGated ? {} : { businessPanel: defaults.vehicle_types.businessPanel }),
  };

  // The default secondary CTA ("What you need to sign up" → #faq) points at
  // the main landing page's FAQ; this page's FAQ is about the city instead.
  const drivers: DriverCtaContent = {
    eyebrow: defaults.driver_cta.eyebrow,
    headline: defaults.driver_cta.headline,
    subtext: defaults.driver_cta.subtext,
    ctaLabel: defaults.driver_cta.ctaLabel,
    points: defaults.driver_cta.points,
  };

  const faq: FaqContent = {
    eyebrow: t("shared.faq.eyebrow"),
    heading: c("faq.heading"),
    intro: c("faq.intro"),
    items: FAQ_KEYS.map((key) => ({
      question: c(`faq.items.${key}.question`),
      answer: c(`faq.items.${key}.answer`),
    })),
  };

  // Every other city, linked with its own keyword as the anchor text — the
  // internal link signal each city page is meant to rank for.
  const otherCities: CityLinksContent = {
    eyebrow: t("shared.otherCities.eyebrow"),
    heading: t("shared.otherCities.heading"),
    links: CITY_LANDING_SLUGS.filter((slug) => slug !== city).map((slug) => ({
      slug,
      label: t(`cities.${slug}.keyword`),
      href: cityLandingPath(slug),
    })),
  };

  const closing: ClosingCtaContent = {
    heading: c("closing.heading"),
    body: isGated
      ? t("shared.closing.bodyGated")
      : t("shared.closing.bodyLive"),
    primaryCtaLabel: primaryCta.label,
    primaryCtaHref: primaryCta.href,
    secondaryCtaLabel: howCta.label,
    secondaryCtaHref: howCta.href,
  };

  const productColumn = defaultFooterColumn(defaults.footer, 0);
  const businessColumn = defaultFooterColumn(defaults.footer, 1);
  const driversColumn = defaultFooterColumn(defaults.footer, 2);

  // The default footer's Company column and legal links are `#` placeholders
  // for pages that do not exist yet; a dead link on an SEO page is worse than
  // none, so both are left out. Only anchors this page actually has are kept.
  const footer: FooterContent = {
    brandName: defaults.footer.brandName,
    brandBlurb: defaults.footer.brandBlurb,
    columns: [
      {
        title: productColumn.title,
        links: [
          { label: t("shared.nav.how"), href: ANCHOR.how },
          { label: t("shared.nav.vehicles"), href: ANCHOR.vehicles },
          { label: t("shared.nav.areas"), href: ANCHOR.coverage },
          { label: t("shared.nav.faq"), href: ANCHOR.faq },
        ],
      },
      {
        title: t("shared.footer.citiesTitle"),
        // Short city names here; the keyword-anchored links are in the
        // other-cities section. The current city is included so the column
        // reads as the complete list.
        links: CITY_LANDING_SLUGS.map((slug) => ({
          label: tCities(slug),
          href: cityLandingPath(slug),
        })),
      },
      {
        title: driversColumn.title,
        links: [
          // The resolved, locale-prefixed URL rather than the footer's
          // `@driver-sign-up` sentinel, which resolves without a locale.
          { label: t("shared.cta.becomeDriver"), href: driverSignUpHref },
          ...driversColumn.links.filter((link) => link.href === "/dashboard"),
        ],
      },
      // Company registration and sign-in are client-host actions that only
      // exist after launch.
      ...(isGated ? [] : [businessColumn]),
    ],
    copyright: defaults.footer.copyright,
    legalLinks: [],
  };

  return {
    keyword,
    nav,
    hero,
    intro,
    coverage,
    howItWorks,
    vehicles,
    drivers,
    faq,
    otherCities,
    closing,
    footer,
  };
}
