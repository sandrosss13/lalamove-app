import type { LandingBanner } from "@/components/landing/landing-page";
import {
  DEFAULT_HOME_PAGE_CONTENT,
  type PartnerMarqueeContent,
} from "@/lib/admin/home-page-content";

/**
 * One pass of the logo list.
 *
 * The track holds exactly two of these, which is the whole reason the
 * `landing-ticker` keyframe's `-50%` loops seamlessly: half the track width is
 * precisely one run. A third run, or one run padded to a different width, makes
 * the loop visibly jump. The duplicate is hidden from assistive tech so the
 * partner list is not read out twice.
 */
function PartnerMarqueeRun({
  logos,
  runKey,
  hidden,
}: {
  logos: LandingBanner[];
  /** Namespaces the React keys so both runs stay unique inside one track. */
  runKey: string;
  hidden?: boolean;
}) {
  return (
    <ul
      aria-hidden={hidden ? "true" : undefined}
      className="flex shrink-0 items-center"
    >
      {logos.map((logo) => (
        <li
          key={`${logo.id}-${runKey}`}
          className="mx-[10px] flex h-[66px] w-[180px] flex-none items-center justify-center rounded-xl border border-line-hairline bg-surface px-[18px] py-[14px]"
        >
          {/*
            Plain <img> rather than next/image: the URL is uploaded or typed in
            by a content editor and can point at any host, so it can't be pinned
            in `remotePatterns` at build time. Same call the admin banners
            table already makes.
          */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logo.imageUrl}
            alt={logo.title}
            loading="lazy"
            className="h-[38px] w-full object-contain"
          />
        </li>
      ))}
    </ul>
  );
}

/**
 * The partner logo band: a full-bleed, CSS-only marquee of the active `Banner`
 * rows at `HOME_PARTNER_LOGO_BANNER_PLACEMENT`, behind an edge fade.
 *
 * The logos are never duplicated as content — one source list is drawn twice
 * inside a single `w-max` track (see `PartnerMarqueeRun`).
 */
export function LandingPartnerMarquee({
  logos,
  content = DEFAULT_HOME_PAGE_CONTENT.partner_marquee,
}: {
  logos: LandingBanner[];
  content?: PartnerMarqueeContent;
}) {
  // No logos means no band at all — not an empty strip, and not the eyebrow
  // announcing a list that isn't there. This is the live state until a content
  // manager uploads the first partner logo.
  if (logos.length === 0) {
    return null;
  }

  return (
    <section className="pt-[clamp(44px,5vw,72px)] pb-[clamp(8px,1vw,16px)]">
      <p className="mb-[26px] text-center font-price text-[10.5px] tracking-[0.18em] text-faintest uppercase">
        {content.eyebrow}
      </p>

      {/* The band is deliberately full-bleed (no horizontal padding on the
          section) so the logos run off both edges under the mask rather than
          stopping at a content gutter. The `#000` in the gradient is a mask
          alpha channel, not a theme colour, so it is correct in both themes. */}
      <div className="overflow-hidden [-webkit-mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)] [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]">
        <div className="flex w-max animate-marquee hover:[animation-play-state:paused] motion-reduce:animate-none">
          <PartnerMarqueeRun logos={logos} runKey="a" />
          <PartnerMarqueeRun logos={logos} runKey="b" hidden />
        </div>
      </div>
    </section>
  );
}
