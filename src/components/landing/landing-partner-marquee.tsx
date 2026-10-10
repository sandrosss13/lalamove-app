import type { LandingBanner } from "@/components/landing/landing-page";
import { HOME_CONTAINER } from "@/components/landing/landing-home-styles";
import { type PartnerMarqueeContent } from "@/lib/admin/home-page-content";
import { cn } from "@/lib/utils";

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
      {logos.map((logo) => {
        // The company name is the logo's only accessible text. Without one the
        // logo is decorative: empty alt, and the item is hidden from assistive
        // tech so it is not announced as a blank list entry.
        const name = logo.title.trim();

        return (
          <li
            key={`${logo.id}-${runKey}`}
            aria-hidden={name ? undefined : "true"}
            className="flex h-24 w-[200px] flex-none items-center justify-center border-r border-home-line px-[26px] py-5"
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
              alt={name}
              loading="lazy"
              className="h-11 w-full object-contain"
            />
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The partner logo band (v4): an eyebrow over a full-bleed, bordered,
 * CSS-only (42s linear) marquee of the active `Banner`
 * rows at `HOME_PARTNER_LOGO_BANNER_PLACEMENT`, behind an edge fade.
 *
 * The logos are never duplicated as content — one source list is drawn twice
 * inside a single `w-max` track (see `PartnerMarqueeRun`).
 */
export function LandingPartnerMarquee({
  logos,
  content,
}: {
  logos: LandingBanner[];
  content: PartnerMarqueeContent;
}) {
  // No logos means no band at all — not an empty strip, and not the eyebrow
  // announcing a list that isn't there. This is the live state until a content
  // manager uploads the first partner logo.
  if (logos.length === 0) {
    return null;
  }

  return (
    <section className="pt-[clamp(56px,7vw,96px)]">
      <p
        className={cn(
          HOME_CONTAINER,
          "mb-5 font-price text-[11px] tracking-[0.16em] text-home-muted uppercase",
        )}
      >
        {content.eyebrow}
      </p>

      {/* Full-bleed on purpose, so the logos run off both edges under the
          mask. The `#000` in the gradient is a mask alpha, not a theme colour. */}
      <div className="overflow-hidden border-y border-home-line bg-home-surface [-webkit-mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)] [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]">
        <div className="flex w-max animate-marquee hover:[animation-play-state:paused] motion-reduce:animate-none">
          <PartnerMarqueeRun logos={logos} runKey="a" />
          <PartnerMarqueeRun logos={logos} runKey="b" hidden />
        </div>
      </div>
    </section>
  );
}
