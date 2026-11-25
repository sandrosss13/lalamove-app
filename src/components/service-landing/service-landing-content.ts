import { getMessages, getTranslations } from "next-intl/server";

import {
  cityDriverSignUpHref,
  defaultFooterColumn,
  type CityIntroContent,
  type CityLinksContent,
} from "@/components/city-landing/city-landing-content";
import type { AppLocale } from "@/i18n/routing";
import {
  createMessageLookup,
  localizeDefaultHomePageContent,
  type ClosingCtaContent,
  type CoverageContent,
  type DriverCtaContent,
  type FaqContent,
  type FooterContent,
  type HeroContent,
  type HowItWorksContent,
  type NavContent,
  type VehicleTypesContent,
} from "@/lib/admin/home-page-content";
import { CITY_LANDING_SLUGS, cityLandingPath } from "@/lib/seo/cities";
import {
  SERVICE_LANDING_SLUGS,
  serviceLandingPath,
  type ServiceLandingSlug,
} from "@/lib/seo/services";

/**
 * Everything one service landing page renders, resolved on the server.
 *
 * The service-page twin of `loadCityLandingContent`, and composed the same
 * way: the main landing page's section components take their copy as props,
 * and building those props here keeps the `serviceLanding` catalog out of the
 * client bundle (see `src/app/[locale]/layout.tsx`).
 *
 * Copy that is the same on every landing page — calls to action, the nav's
 * generic labels, how it works, the gated/live closing line — is read from the
 * `cityLanding` catalog's `shared` block rather than duplicated; only what is
 * specific to the service cluster lives in `serviceLanding`.
 */

export type ServiceLandingContent = {
  keyword: string;
  nav: NavContent;
  hero: HeroContent;
  intro: CityIntroContent;
  covers: CoverageContent;
  howItWorks: HowItWorksContent;
  vehicles: VehicleTypesContent;
  drivers: DriverCtaContent;
  faq: FaqContent;
  otherServices: CityLinksContent;
  cities: CityLinksContent;
  closing: ClosingCtaContent;
  footer: FooterContent;
};

/**
 * The catalog's keyed-object shapes (`w1…w3`, `i1…i6`, `q1…q5`), in display
 * order — see the note on the city loader's key lists.
 */
const WHY_KEYS = ["w1", "w2", "w3"] as const;
const COVERS_KEYS = ["i1", "i2", "i3", "i4", "i5", "i6"] as const;
const STEP_KEYS = ["s1", "s2", "s3", "s4"] as const;
const FAQ_KEYS = ["q1", "q2", "q3", "q4", "q5"] as const;

/**
 * In-page anchors, matching the `id`s the sections carry. The "what it
 * covers" section is the reused coverage section, hence `#coverage`.
 */
const ANCHOR = {
  covers: "#coverage",
  how: "#how",
  vehicles: "#vehicles",
  faq: "#faq",
  services: "#services",
  cities: "#cities",
} as const;

/** The section `id`s the two link lists render under. */
export const SERVICE_LINKS_SECTION_ID = "services";
export const SERVICE_CITY_LINKS_SECTION_ID = "cities";

/** The client host's own registration page (CLIENT sign-up). */
const CLIENT_SIGN_UP_HREF = "/sign-up";

export async function loadServiceLandingContent({
  locale,
  service,
  isGated,
}: {
  locale: AppLocale;
  service: ServiceLandingSlug;
  /** Pre-launch: no booking CTAs, the driver sign-up is the primary action. */
  isGated: boolean;
}): Promise<ServiceLandingContent> {
  const [t, tShared, tCityLanding, tCities, messages] = await Promise.all([
    getTranslations({ locale, namespace: "serviceLanding" }),
    getTranslations({ locale, namespace: "cityLanding.shared" }),
    getTranslations({ locale, namespace: "cityLanding" }),
    getTranslations({ locale, namespace: "cities.georgianCities" }),
    getMessages({ locale }),
  ]);

  // The landing page's own defaults in the reader's language, for the sections
  // whose copy is not service-specific (fleet, drivers, nav and footer labels).
  const defaults = localizeDefaultHomePageContent(
    createMessageLookup(messages),
  );

  const s = (key: string) => t(`services.${service}.${key}`);
  const keyword = s("keyword");
  const driverSignUpHref = cityDriverSignUpHref(locale);

  // Same rule as the city pages: before launch the one action offered is the
  // driver sign-up (live on the merchant host); after launch, booking.
  const primaryCta = isGated
    ? { label: tShared("cta.becomeDriver"), href: driverSignUpHref }
    : { label: tShared("cta.book"), href: CLIENT_SIGN_UP_HREF };
  const howCta = { label: tShared("cta.howItWorks"), href: ANCHOR.how };

  const nav: NavContent = {
    wordmark: defaults.nav.wordmark,
    links: [
      { label: t("shared.nav.covers"), href: ANCHOR.covers },
      { label: tShared("nav.how"), href: ANCHOR.how },
      { label: tShared("nav.vehicles"), href: ANCHOR.vehicles },
      { label: tShared("nav.faq"), href: ANCHOR.faq },
      { label: t("shared.nav.services"), href: ANCHOR.services },
    ],
    // An empty `signInHref` drops the pill's Sign in chip before launch.
    signInLabel: defaults.nav.signInLabel,
    signInHref: isGated ? "" : defaults.nav.signInHref,
    signUpLabel: isGated
      ? tShared("cta.becomeDriver")
      : defaults.nav.signUpLabel,
    signUpHref: isGated ? driverSignUpHref : defaults.nav.signUpHref,
  };

  const hero: HeroContent = {
    eyebrow: "",
    headline: keyword,
    subtext: s("hero.subtext"),
    primaryCtaLabel: primaryCta.label,
    primaryCtaHref: primaryCta.href,
    secondaryCtaLabel: howCta.label,
    secondaryCtaHref: howCta.href,
    ...(isGated
      ? {
          statusChipText: tShared("hero.chipGated"),
          statusChipTag: tShared("hero.chipTag"),
        }
      : {}),
  };

  const intro: CityIntroContent = {
    eyebrow: tShared("intro.eyebrow"),
    heading: s("intro.heading"),
    paragraphs: [s("intro.p1"), s("intro.p2")],
    whyCards: WHY_KEYS.map((key) => ({
      title: s(`why.${key}.title`),
      body: s(`why.${key}.body`),
    })),
  };

  // The coverage section, recast as "what this service covers": the chips are
  // the typical items or jobs, untiered, where the city pages list districts.
  const covers: CoverageContent = {
    eyebrow: t("shared.covers.eyebrow"),
    heading: s("covers.heading"),
    body: s("covers.body"),
    ctaLabel: primaryCta.label,
    ctaHref: primaryCta.href,
    cities: COVERS_KEYS.map((key) => ({
      name: s(`covers.list.${key}`),
      tier: "",
    })),
  };

  const howItWorks: HowItWorksContent = {
    eyebrow: tShared("howItWorks.eyebrow"),
    heading: tShared("howItWorks.heading"),
    steps: STEP_KEYS.map((key) => ({
      title: tShared(`howItWorks.steps.${key}.title`),
      body: tShared(`howItWorks.steps.${key}.body`),
    })),
  };

  // As on the city pages: no vehicle count (these pages make no numeric
  // claims), and the business panel only once the client site is live.
  const vehicles: VehicleTypesContent = {
    eyebrow: defaults.vehicle_types.eyebrow,
    heading: defaults.vehicle_types.heading,
    mediumDutyLabel: defaults.vehicle_types.mediumDutyLabel,
    heavyDutyLabel: defaults.vehicle_types.heavyDutyLabel,
    ...(isGated ? {} : { businessPanel: defaults.vehicle_types.businessPanel }),
  };

  // Without the default secondary CTA, which points at the main page's FAQ.
  const drivers: DriverCtaContent = {
    eyebrow: defaults.driver_cta.eyebrow,
    headline: defaults.driver_cta.headline,
    subtext: defaults.driver_cta.subtext,
    ctaLabel: defaults.driver_cta.ctaLabel,
    points: defaults.driver_cta.points,
  };

  const faq: FaqContent = {
    eyebrow: tShared("faq.eyebrow"),
    heading: s("faq.heading"),
    intro: s("faq.intro"),
    items: FAQ_KEYS.map((key) => ({
      question: s(`faq.items.${key}.question`),
      answer: s(`faq.items.${key}.answer`),
    })),
  };

  // Every other service, anchored with its own keyword — the service
  // cluster's internal linking, as the other-cities list is the city one's.
  const otherServices: CityLinksContent = {
    eyebrow: t("shared.otherServices.eyebrow"),
    heading: t("shared.otherServices.heading"),
    links: SERVICE_LANDING_SLUGS.filter((slug) => slug !== service).map(
      (slug) => ({
        slug,
        label: t(`services.${slug}.keyword`),
        href: serviceLandingPath(slug),
      }),
    ),
  };

  // All six city pages, anchored with each city's keyword: the crawl path
  // from the service cluster into the city cluster.
  const cities: CityLinksContent = {
    eyebrow: t("shared.cities.eyebrow"),
    heading: t("shared.cities.heading"),
    links: CITY_LANDING_SLUGS.map((slug) => ({
      slug,
      label: tCityLanding(`cities.${slug}.keyword`),
      href: cityLandingPath(slug),
    })),
  };

  const closing: ClosingCtaContent = {
    heading: s("closing.heading"),
    body: isGated ? tShared("closing.bodyGated") : tShared("closing.bodyLive"),
    primaryCtaLabel: primaryCta.label,
    primaryCtaHref: primaryCta.href,
    secondaryCtaLabel: howCta.label,
    secondaryCtaHref: howCta.href,
  };

  const productColumn = defaultFooterColumn(defaults.footer, 0);
  const businessColumn = defaultFooterColumn(defaults.footer, 1);
  const driversColumn = defaultFooterColumn(defaults.footer, 2);

  // The city footer's composition — no `#` placeholder columns or legal links
  // — with the services column first, since this is a service page.
  const footer: FooterContent = {
    brandName: defaults.footer.brandName,
    brandBlurb: defaults.footer.brandBlurb,
    columns: [
      {
        title: productColumn.title,
        links: [
          { label: tShared("nav.how"), href: ANCHOR.how },
          { label: tShared("nav.vehicles"), href: ANCHOR.vehicles },
          { label: t("shared.nav.covers"), href: ANCHOR.covers },
          { label: tShared("nav.faq"), href: ANCHOR.faq },
        ],
      },
      {
        // The current service is included so the column reads as the
        // complete list.
        title: t("shared.footer.servicesTitle"),
        links: SERVICE_LANDING_SLUGS.map((slug) => ({
          label: t(`services.${slug}.keyword`),
          href: serviceLandingPath(slug),
        })),
      },
      {
        title: tShared("footer.citiesTitle"),
        links: CITY_LANDING_SLUGS.map((slug) => ({
          label: tCities(slug),
          href: cityLandingPath(slug),
        })),
      },
      {
        title: driversColumn.title,
        links: [
          { label: tShared("cta.becomeDriver"), href: driverSignUpHref },
          ...driversColumn.links.filter((link) => link.href === "/dashboard"),
        ],
      },
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
    covers,
    howItWorks,
    vehicles,
    drivers,
    faq,
    otherServices,
    cities,
    closing,
    footer,
  };
}
