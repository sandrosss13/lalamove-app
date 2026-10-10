"use client";

import { useTranslations } from "next-intl";

import { AdminImageUpload } from "@/components/admin/content/admin-image-upload";
import { Label } from "@/components/ui/label";
import {
  HERO_INTERVAL_DEFAULT,
  HERO_INTERVAL_MAX,
  HERO_INTERVAL_MIN,
  type ClosingCtaContent,
  type CoverageCity,
  type CoverageContent,
  type FaqContent,
  type FooterContent,
  type HeroCarouselContent,
  type HomePageSectionData,
  type HowItWorksContent,
  type NavContent,
  type OffersContent,
  type PartnerMarqueeContent,
  type QuoteCalculatorContent,
  type VehicleTypesContent,
} from "@/lib/admin/home-page-content";

import {
  EditorNote,
  FieldGrid,
  LinkListField,
  RepeatableList,
  TextAreaField,
  TextField,
} from "./fields";

/**
 * Caps on the authored lists, from the artboard's schema. The content parser
 * accepts longer lists; these keep the page inside what the v4 layout was
 * designed to hold.
 */
const MAX_STEPS = 6;
const MAX_CITIES = 12;
const MAX_FAQ_ITEMS = 12;

/**
 * Where city photos are filed in the media bucket. `banners` rather than a
 * prefix of its own: `SiteMediaPurpose` is a closed union, and a city card is
 * page imagery uploaded from the content admin exactly like a banner is.
 */
const CITY_IMAGE_PURPOSE = "banners";

type FieldsProps<Content> = {
  value: Content;
  onChange: (next: Content) => void;
};

function HeroCarouselFields({
  value,
  onChange,
}: FieldsProps<HeroCarouselContent>) {
  const t = useTranslations("admin.homePageCms");

  return (
    <FieldGrid>
      <TextField
        id="hero-interval"
        type="number"
        label={t("autoAdvanceSeconds")}
        hint={t("autoAdvanceHint", {
          min: HERO_INTERVAL_MIN,
          max: HERO_INTERVAL_MAX,
          default: HERO_INTERVAL_DEFAULT,
        })}
        // Held as a number in the draft; an emptied box means "use the
        // default", which is how the parser reads an absent key.
        value={value.intervalSec === undefined ? "" : String(value.intervalSec)}
        onChange={(next) => {
          const parsed = Number.parseInt(next, 10);
          onChange({
            ...value,
            intervalSec: Number.isFinite(parsed) ? parsed : undefined,
          });
        }}
      />
      <TextField
        id="hero-fallback-caption"
        label={t("fallbackCaption")}
        hint={t("fallbackCaptionHint")}
        value={value.fallbackCaption ?? ""}
        onChange={(fallbackCaption) => onChange({ ...value, fallbackCaption })}
      />
    </FieldGrid>
  );
}

function QuoteCalculatorFields({
  value,
  onChange,
}: FieldsProps<QuoteCalculatorContent>) {
  const t = useTranslations("admin.homePageCms");

  return (
    <div className="flex flex-col gap-4">
      <FieldGrid>
        <TextField
          id="booking-heading"
          label={t("heading")}
          value={value.heading}
          onChange={(heading) => onChange({ ...value, heading })}
        />
        <TextField
          id="booking-cta-label"
          label={t("buttonLabel")}
          value={value.ctaLabel ?? ""}
          onChange={(ctaLabel) => onChange({ ...value, ctaLabel })}
        />
        <TextField
          id="booking-cta-href"
          label={t("buttonLink")}
          hint={t("pairedLinkHint")}
          value={value.ctaHref ?? ""}
          onChange={(ctaHref) => onChange({ ...value, ctaHref })}
        />
      </FieldGrid>
      <EditorNote>{t("bookingNote")}</EditorNote>
    </div>
  );
}

function OffersFields({ value, onChange }: FieldsProps<OffersContent>) {
  const t = useTranslations("admin.homePageCms");

  return (
    <FieldGrid>
      <TextField
        id="offers-heading"
        label={t("heading")}
        value={value.heading}
        onChange={(heading) => onChange({ ...value, heading })}
      />
      <TextField
        id="offers-link-label"
        label={t("linkLabel")}
        value={value.linkLabel ?? ""}
        onChange={(linkLabel) => onChange({ ...value, linkLabel })}
      />
      <TextField
        id="offers-link-href"
        label={t("link")}
        hint={t("pairedLinkHint")}
        value={value.linkHref ?? ""}
        onChange={(linkHref) => onChange({ ...value, linkHref })}
      />
    </FieldGrid>
  );
}

function VehicleTypesFields({
  value,
  onChange,
}: FieldsProps<VehicleTypesContent>) {
  const t = useTranslations("admin.homePageCms");

  return (
    <div className="flex flex-col gap-4">
      <FieldGrid>
        <TextField
          id="vehicles-heading"
          label={t("heading")}
          value={value.heading}
          onChange={(heading) => onChange({ ...value, heading })}
        />
        <TextAreaField
          id="vehicles-intro"
          label={t("intro")}
          value={value.intro ?? ""}
          onChange={(intro) => onChange({ ...value, intro })}
        />
      </FieldGrid>
      <EditorNote>{t("vehiclesNote")}</EditorNote>
    </div>
  );
}

function HowItWorksFields({ value, onChange }: FieldsProps<HowItWorksContent>) {
  const t = useTranslations("admin.homePageCms");

  return (
    <div className="flex flex-col gap-5">
      <FieldGrid>
        <TextField
          id="how-heading"
          label={t("heading")}
          value={value.heading}
          onChange={(heading) => onChange({ ...value, heading })}
        />
      </FieldGrid>
      <RepeatableList
        label={t("steps")}
        addLabel={t("addStep")}
        items={value.steps}
        max={MAX_STEPS}
        blank={() => ({ title: "", body: "" })}
        titleOf={(step) => step.title}
        onChange={(steps) => onChange({ ...value, steps })}
        renderFields={(step, index, update) => (
          <>
            <TextField
              id={`how-step-${index}-title`}
              label={t("fieldTitle")}
              value={step.title}
              onChange={(title) => update({ ...step, title })}
            />
            <TextAreaField
              id={`how-step-${index}-body`}
              label={t("text")}
              rows={2}
              value={step.body}
              onChange={(body) => update({ ...step, body })}
            />
          </>
        )}
      />
    </div>
  );
}

function CoverageFields({ value, onChange }: FieldsProps<CoverageContent>) {
  const t = useTranslations("admin.homePageCms");

  return (
    <div className="flex flex-col gap-5">
      <FieldGrid>
        <TextField
          id="coverage-heading"
          label={t("heading")}
          value={value.heading}
          onChange={(heading) => onChange({ ...value, heading })}
        />
        <TextField
          id="coverage-cta-label"
          label={t("linkLabel")}
          value={value.ctaLabel}
          onChange={(ctaLabel) => onChange({ ...value, ctaLabel })}
        />
        <TextField
          id="coverage-cta-href"
          label={t("link")}
          value={value.ctaHref}
          onChange={(ctaHref) => onChange({ ...value, ctaHref })}
        />
        <TextAreaField
          id="coverage-intro"
          label={t("intro")}
          value={value.body}
          onChange={(body) => onChange({ ...value, body })}
        />
      </FieldGrid>
      <RepeatableList
        label={t("cities")}
        addLabel={t("addCity")}
        items={value.cities}
        max={MAX_CITIES}
        blank={(): CoverageCity => ({ name: "", tier: "" })}
        titleOf={(city) => city.name}
        onChange={(cities) => onChange({ ...value, cities })}
        renderFields={(city, index, update) => (
          <>
            <div className="col-span-full flex flex-col gap-1.5 sm:max-w-xs">
              <Label htmlFor={`coverage-city-${index}-image`}>
                {t("photo")}
              </Label>
              <AdminImageUpload
                id={`coverage-city-${index}-image`}
                purpose={CITY_IMAGE_PURPOSE}
                // Optional: the parser drops an empty value, so removing the
                // photo saves the city without one.
                value={city.imageUrl ?? ""}
                onChange={(imageUrl) => update({ ...city, imageUrl })}
              />
            </div>
            <TextField
              id={`coverage-city-${index}-name`}
              label={t("city")}
              value={city.name}
              onChange={(name) => update({ ...city, name })}
            />
            <TextField
              id={`coverage-city-${index}-tier`}
              label={t("cityLabel")}
              value={city.tier}
              onChange={(tier) => update({ ...city, tier })}
            />
            <TextField
              id={`coverage-city-${index}-href`}
              label={t("link")}
              hint={t("optional")}
              value={city.href ?? ""}
              onChange={(href) => update({ ...city, href })}
            />
          </>
        )}
      />
    </div>
  );
}

function PartnerMarqueeFields({
  value,
  onChange,
}: FieldsProps<PartnerMarqueeContent>) {
  const t = useTranslations("admin.homePageCms");

  return (
    <FieldGrid>
      <TextField
        id="partners-eyebrow"
        label={t("labelAboveTheStrip")}
        value={value.eyebrow}
        onChange={(eyebrow) => onChange({ ...value, eyebrow })}
      />
    </FieldGrid>
  );
}

function ClosingCtaFields({ value, onChange }: FieldsProps<ClosingCtaContent>) {
  const t = useTranslations("admin.homePageCms");

  return (
    <FieldGrid>
      <TextField
        id="app-heading"
        label={t("heading")}
        value={value.heading}
        onChange={(heading) => onChange({ ...value, heading })}
      />
      <TextAreaField
        id="app-body"
        label={t("text")}
        value={value.body}
        onChange={(body) => onChange({ ...value, body })}
      />
      <TextField
        id="app-store-url"
        label={t("appStoreUrl")}
        hint={t("storeUrlHint")}
        value={value.appStoreUrl ?? ""}
        onChange={(appStoreUrl) => onChange({ ...value, appStoreUrl })}
      />
      <TextField
        id="app-play-store-url"
        label={t("playStoreUrl")}
        hint={t("storeUrlHint")}
        value={value.playStoreUrl ?? ""}
        onChange={(playStoreUrl) => onChange({ ...value, playStoreUrl })}
      />
    </FieldGrid>
  );
}

function FaqFields({ value, onChange }: FieldsProps<FaqContent>) {
  const t = useTranslations("admin.homePageCms");

  return (
    <div className="flex flex-col gap-5">
      <FieldGrid>
        <TextField
          id="faq-heading"
          label={t("heading")}
          value={value.heading}
          onChange={(heading) => onChange({ ...value, heading })}
        />
        <TextAreaField
          id="faq-intro"
          label={t("intro")}
          value={value.intro}
          onChange={(intro) => onChange({ ...value, intro })}
        />
      </FieldGrid>
      <RepeatableList
        label={t("questions")}
        addLabel={t("addQuestion")}
        items={value.items}
        max={MAX_FAQ_ITEMS}
        blank={() => ({ question: "", answer: "" })}
        titleOf={(item) => item.question}
        onChange={(items) => onChange({ ...value, items })}
        renderFields={(item, index, update) => (
          <>
            <TextField
              id={`faq-${index}-question`}
              label={t("question")}
              wide
              value={item.question}
              onChange={(question) => update({ ...item, question })}
            />
            <TextAreaField
              id={`faq-${index}-answer`}
              label={t("answer")}
              value={item.answer}
              onChange={(answer) => update({ ...item, answer })}
            />
          </>
        )}
      />
    </div>
  );
}

function NavFields({ value, onChange }: FieldsProps<NavContent>) {
  const t = useTranslations("admin.homePageCms");

  return (
    <div className="flex flex-col gap-5">
      <FieldGrid>
        <TextField
          id="nav-wordmark"
          label={t("logoName")}
          hint={t("logoNameHint")}
          value={value.wordmark}
          onChange={(wordmark) => onChange({ ...value, wordmark })}
        />
        <TextField
          id="nav-sign-in-label"
          label={t("signInLabel")}
          value={value.signInLabel}
          onChange={(signInLabel) => onChange({ ...value, signInLabel })}
        />
        <TextField
          id="nav-sign-in-href"
          label={t("signInLink")}
          value={value.signInHref}
          onChange={(signInHref) => onChange({ ...value, signInHref })}
        />
        <TextField
          id="nav-sign-up-label"
          label={t("signUpLabel")}
          value={value.signUpLabel}
          onChange={(signUpLabel) => onChange({ ...value, signUpLabel })}
        />
        <TextField
          id="nav-sign-up-href"
          label={t("signUpLink")}
          value={value.signUpHref}
          onChange={(signUpHref) => onChange({ ...value, signUpHref })}
        />
      </FieldGrid>
      <LinkListField
        idPrefix="nav-link"
        label={t("menuLinks")}
        addLabel={t("addLink")}
        links={value.links}
        onChange={(links) => onChange({ ...value, links })}
      />
      <FieldGrid>
        <TextField
          id="nav-utility-text"
          label={t("utilityText")}
          hint={t("utilityTextHint")}
          wide
          value={value.utilityText ?? ""}
          onChange={(utilityText) => onChange({ ...value, utilityText })}
        />
      </FieldGrid>
      <LinkListField
        idPrefix="nav-utility-link"
        label={t("utilityLinks")}
        addLabel={t("addLink")}
        links={value.utilityLinks ?? []}
        onChange={(utilityLinks) => onChange({ ...value, utilityLinks })}
      />
    </div>
  );
}

function FooterFields({ value, onChange }: FieldsProps<FooterContent>) {
  const t = useTranslations("admin.homePageCms");

  return (
    <div className="flex flex-col gap-5">
      <FieldGrid>
        <TextField
          id="footer-brand-name"
          label={t("logoName")}
          hint={t("logoNameHint")}
          value={value.brandName}
          onChange={(brandName) => onChange({ ...value, brandName })}
        />
        <TextField
          id="footer-copyright"
          label={t("copyrightLine")}
          hint={t("copyrightHint")}
          value={value.copyright}
          onChange={(copyright) => onChange({ ...value, copyright })}
        />
        <TextAreaField
          id="footer-blurb"
          label={t("brandBlurb")}
          value={value.brandBlurb}
          onChange={(brandBlurb) => onChange({ ...value, brandBlurb })}
        />
        <TextField
          id="footer-cta-label"
          label={t("buttonLabel")}
          value={value.ctaLabel ?? ""}
          onChange={(ctaLabel) => onChange({ ...value, ctaLabel })}
        />
        <TextField
          id="footer-cta-href"
          label={t("buttonLink")}
          hint={t("pairedLinkHint")}
          value={value.ctaHref ?? ""}
          onChange={(ctaHref) => onChange({ ...value, ctaHref })}
        />
      </FieldGrid>
      <RepeatableList
        label={t("columns")}
        addLabel={t("addColumn")}
        items={value.columns}
        blank={() => ({ title: "", links: [] })}
        titleOf={(column) => column.title}
        onChange={(columns) => onChange({ ...value, columns })}
        renderFields={(column, index, update) => (
          <>
            <TextField
              id={`footer-column-${index}-title`}
              label={t("columnTitle")}
              wide
              value={column.title}
              onChange={(title) => update({ ...column, title })}
            />
            <div className="col-span-full">
              <LinkListField
                idPrefix={`footer-column-${index}-link`}
                label={t("links")}
                addLabel={t("addLink")}
                links={column.links}
                onChange={(links) => update({ ...column, links })}
              />
            </div>
          </>
        )}
      />
      <LinkListField
        idPrefix="footer-legal-link"
        label={t("legalLinks")}
        addLabel={t("addLink")}
        links={value.legalLinks}
        onChange={(legalLinks) => onChange({ ...value, legalLinks })}
      />
    </div>
  );
}

/**
 * The content fields for one v4 section, switched on its type.
 *
 * Each editor shows the fields the v4 artboard exposes; required fields the
 * v4 layout no longer renders (an eyebrow, a secondary CTA) are not shown but
 * are carried through the draft untouched, so saving never drops them and the
 * parser never rejects the row for their absence. Retired types render nothing
 * — they are listed, not edited.
 */
export function SectionContentFields({
  data,
  onChange,
}: {
  data: HomePageSectionData;
  onChange: (next: HomePageSectionData) => void;
}) {
  switch (data.type) {
    case "hero_carousel":
      return (
        <HeroCarouselFields
          value={data.content}
          onChange={(content) => onChange({ type: data.type, content })}
        />
      );
    case "quote_calculator":
      return (
        <QuoteCalculatorFields
          value={data.content}
          onChange={(content) => onChange({ type: data.type, content })}
        />
      );
    case "offers":
      return (
        <OffersFields
          value={data.content}
          onChange={(content) => onChange({ type: data.type, content })}
        />
      );
    case "vehicle_types":
      return (
        <VehicleTypesFields
          value={data.content}
          onChange={(content) => onChange({ type: data.type, content })}
        />
      );
    case "how_it_works":
      return (
        <HowItWorksFields
          value={data.content}
          onChange={(content) => onChange({ type: data.type, content })}
        />
      );
    case "coverage":
      return (
        <CoverageFields
          value={data.content}
          onChange={(content) => onChange({ type: data.type, content })}
        />
      );
    case "partner_marquee":
      return (
        <PartnerMarqueeFields
          value={data.content}
          onChange={(content) => onChange({ type: data.type, content })}
        />
      );
    case "closing_cta":
      return (
        <ClosingCtaFields
          value={data.content}
          onChange={(content) => onChange({ type: data.type, content })}
        />
      );
    case "faq":
      return (
        <FaqFields
          value={data.content}
          onChange={(content) => onChange({ type: data.type, content })}
        />
      );
    case "nav":
      return (
        <NavFields
          value={data.content}
          onChange={(content) => onChange({ type: data.type, content })}
        />
      );
    case "footer":
      return (
        <FooterFields
          value={data.content}
          onChange={(content) => onChange({ type: data.type, content })}
        />
      );
    case "hero":
    case "stats":
    case "bento":
    case "driver_cta":
    case "category_tiles":
      return null;
  }
}
