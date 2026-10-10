"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import type { ContentLocale } from "@prisma/client";

import { AdminImageUpload } from "@/components/admin/content/admin-image-upload";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  HOME_HERO_BANNER_PLACEMENT,
  HOME_PARTNER_LOGO_BANNER_PLACEMENT,
  HOME_SECONDARY_BANNER_PLACEMENT,
  MAX_HERO_BANNERS,
  MAX_OFFER_BANNERS,
  MAX_PARTNER_LOGOS,
} from "@/lib/admin/home-page-content";
import type { SiteMediaPurpose } from "@/lib/site-media-storage";
import { cn } from "@/lib/utils";

import type { ConfirmRequest } from "./confirm-dialog";
import { FieldGrid, ListHeader, TextAreaField, TextField } from "./fields";
import {
  BANNERS_ENDPOINT,
  moveAt,
  readErrorMessage,
  type CmsBanner,
} from "./shared";

/** The three inline banner lists the v4 sections own. */
export type BannerListKind = "hero" | "offers" | "logos";

/** The banner columns an inline card can edit. */
type BannerTextField = "eyebrow" | "title" | "body" | "ctaLabel" | "linkUrl";

type BannerFieldSpec = {
  key: BannerTextField;
  /** `admin.homePageCms` message key for the label. */
  labelKey: string;
  wide?: boolean;
  area?: boolean;
};

type BannerListConfig = {
  placement: string;
  max: number;
  /**
   * `live` caps how many may be live at once (extras are kept as drafts);
   * `total` caps how many may exist at all.
   */
  capMode: "live" | "total";
  /** `admin.homePageCms` key of the visibility toggle's label, or null. */
  toggleLabelKey: string | null;
  purpose: SiteMediaPurpose;
  /** Preview box size, per the artboard: hero 220×92, card 160×100, logo 140×56. */
  imageClassName: string;
  fields: BannerFieldSpec[];
  /** `admin.homePageCms` keys for the list heading and the add button. */
  labelKey: string;
  addKey: string;
};

const CONFIG: Record<BannerListKind, BannerListConfig> = {
  hero: {
    placement: HOME_HERO_BANNER_PLACEMENT,
    max: MAX_HERO_BANNERS,
    capMode: "live",
    toggleLabelKey: "live",
    purpose: "banners",
    imageClassName: "sm:w-56",
    fields: [
      { key: "eyebrow", labelKey: "tag" },
      { key: "linkUrl", labelKey: "link" },
      { key: "title", labelKey: "headline", wide: true },
      { key: "body", labelKey: "text", area: true },
    ],
    labelKey: "banners",
    addKey: "addBanner",
  },
  offers: {
    placement: HOME_SECONDARY_BANNER_PLACEMENT,
    max: MAX_OFFER_BANNERS,
    capMode: "total",
    toggleLabelKey: null,
    purpose: "banners",
    imageClassName: "sm:w-44",
    fields: [
      { key: "eyebrow", labelKey: "tag" },
      { key: "ctaLabel", labelKey: "buttonLabel" },
      { key: "title", labelKey: "fieldTitle", wide: true },
      { key: "body", labelKey: "text", area: true },
      { key: "linkUrl", labelKey: "link", wide: true },
    ],
    labelKey: "offers",
    addKey: "addOffer",
  },
  logos: {
    placement: HOME_PARTNER_LOGO_BANNER_PLACEMENT,
    max: MAX_PARTNER_LOGOS,
    capMode: "total",
    toggleLabelKey: "shown",
    purpose: "partner-logos",
    imageClassName: "sm:w-40",
    fields: [{ key: "title", labelKey: "companyName", wide: true }],
    labelKey: "logos",
    addKey: "addLogo",
  },
};

/** What a card edits: the image plus the text columns its kind uses. */
type BannerDraft = { imageUrl: string } & Record<BannerTextField, string>;

function toDraft(banner: CmsBanner | null): BannerDraft {
  return {
    imageUrl: banner?.imageUrl ?? "",
    title: banner?.title ?? "",
    eyebrow: banner?.eyebrow ?? "",
    body: banner?.body ?? "",
    ctaLabel: banner?.ctaLabel ?? "",
    linkUrl: banner?.linkUrl ?? "",
  };
}

/**
 * The draft as a request body: trimmed, the optional columns sent as `null`
 * when blank, and only the columns this kind of banner uses.
 */
function toPayload(
  draft: BannerDraft,
  config: BannerListConfig,
): Record<string, string | null> {
  const payload: Record<string, string | null> = {
    imageUrl: draft.imageUrl.trim(),
    title: draft.title.trim(),
  };

  for (const field of config.fields) {
    if (field.key !== "title") {
      const value = draft[field.key].trim();
      payload[field.key] = value === "" ? null : value;
    }
  }

  return payload;
}

/** An unsaved banner added with the add button, keyed until it is created. */
type NewBanner = { key: number; isActive: boolean };

type BannerCardProps = {
  kind: BannerListKind;
  banner: CmsBanner | null;
  number: number;
  /** Whether the toggle may be switched *on* — false once the live cap is hit. */
  canGoLive: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  /** Visibility of an unsaved card, decided when it was added. */
  initialActive: boolean;
  onSave: (draft: BannerDraft, isActive: boolean) => Promise<string | null>;
  onToggle: (next: boolean) => Promise<string | null>;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
};

/**
 * One banner: image, the kind's text fields, a visibility toggle and ↑/↓,
 * with a Save button that appears while the card has unsaved edits.
 *
 * Toggling and moving write straight away (they are one click, and the
 * artboard treats them as instant); text and image changes wait for Save so a
 * half-typed headline never reaches the public page.
 */
function BannerCard({
  kind,
  banner,
  number,
  canGoLive,
  canMoveUp,
  canMoveDown,
  initialActive,
  onSave,
  onToggle,
  onMove,
  onRemove,
}: BannerCardProps) {
  const t = useTranslations("admin.homePageCms");
  const tBanner = useTranslations("admin.bannerFormDialog");
  const config = CONFIG[kind];
  const isNew = banner === null;
  const [draft, setDraft] = useState<BannerDraft>(() => toDraft(banner));
  const [newActive, setNewActive] = useState(initialActive);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isActive = banner ? banner.isActive : newActive;
  const dirty =
    isNew || JSON.stringify(draft) !== JSON.stringify(toDraft(banner));

  async function handleSave() {
    if (draft.imageUrl.trim() === "") {
      setError(tBanner("addAnImageBeforeSavingThis"));
      return;
    }
    if (draft.title.trim() === "") {
      setError(t("bannerTitleRequired"));
      return;
    }

    setPending(true);
    setError(null);
    const failure = await onSave(draft, isActive);
    setPending(false);
    setError(failure);
  }

  async function handleToggle(next: boolean) {
    if (isNew) {
      setNewActive(next);
      return;
    }

    setPending(true);
    setError(null);
    const failure = await onToggle(next);
    setPending(false);
    setError(failure);
  }

  const title = draft.title.trim() === "" ? t("untitled") : draft.title.trim();

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-background transition-opacity",
        !isActive && config.toggleLabelKey !== null && "opacity-70",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 border-b border-border px-3.5 py-2.5">
        <span className="font-mono text-[11px] text-muted-foreground">
          #{number}
        </span>
        <span className="min-w-0 flex-[1_1_7.5rem] truncate text-sm font-medium">
          {title}
        </span>
        {isNew ? <Badge variant="outline">{t("unsaved")}</Badge> : null}
        {config.toggleLabelKey === null && !isActive ? (
          <Badge variant="outline">{t("draft")}</Badge>
        ) : null}
        {config.toggleLabelKey !== null ? (
          <Label className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
            <Checkbox
              checked={isActive}
              disabled={pending || (!isActive && !canGoLive)}
              onCheckedChange={(checked) => void handleToggle(checked === true)}
            />
            {t(config.toggleLabelKey)}
          </Label>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={pending || isNew || !canMoveUp}
          aria-label={t("moveItemUp", { number })}
          onClick={() => onMove(-1)}
        >
          ↑
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={pending || isNew || !canMoveDown}
          aria-label={t("moveItemDown", { number })}
          onClick={() => onMove(1)}
        >
          ↓
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={pending}
          onClick={onRemove}
        >
          {t("remove")}
        </Button>
      </div>

      <div className="flex flex-col gap-3.5 p-3.5 sm:flex-row sm:flex-wrap">
        <div className={cn("w-full shrink-0", config.imageClassName)}>
          <AdminImageUpload
            id={`banner-${banner?.id ?? `new-${number}`}-image`}
            purpose={config.purpose}
            value={draft.imageUrl}
            onChange={(imageUrl) => setDraft({ ...draft, imageUrl })}
            disabled={pending}
          />
        </div>
        <div className="min-w-0 flex-[1_1_20rem]">
          <FieldGrid>
            {config.fields.map((field) => {
              const id = `banner-${banner?.id ?? `new-${number}`}-${field.key}`;
              const update = (value: string) =>
                setDraft({ ...draft, [field.key]: value });

              return field.area ? (
                <TextAreaField
                  key={field.key}
                  id={id}
                  label={t(field.labelKey)}
                  rows={2}
                  value={draft[field.key]}
                  disabled={pending}
                  onChange={update}
                />
              ) : (
                <TextField
                  key={field.key}
                  id={id}
                  label={t(field.labelKey)}
                  wide={field.wide}
                  value={draft[field.key]}
                  disabled={pending}
                  onChange={update}
                />
              );
            })}
          </FieldGrid>
        </div>
      </div>

      {dirty || error ? (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-3.5 py-2.5">
          {error ? (
            <p role="alert" className="mr-auto text-sm text-destructive">
              {error}
            </p>
          ) : null}
          {dirty && !isNew ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => {
                setDraft(toDraft(banner));
                setError(null);
              }}
            >
              {t("discard")}
            </Button>
          ) : null}
          {dirty ? (
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={() => void handleSave()}
            >
              {pending ? t("saving") : isNew ? t("create") : t("save")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export type BannerListEditorProps = {
  kind: BannerListKind;
  locale: ContentLocale;
  /** This placement's banners in this locale, in `sortOrder`. */
  banners: CmsBanner[];
  /** Reloads the banner list after a write, so every card shows stored state. */
  onChanged: () => Promise<void>;
  requestConfirm: (request: ConfirmRequest) => void;
};

/**
 * The inline banner list inside the hero, offers and partner-logo editors —
 * `Banner` rows at the section's placement, edited without leaving the page.
 *
 * Caps follow the design: the hero allows any number of banners but only
 * `MAX_HERO_BANNERS` live (a new banner past that is added as a draft, which is
 * also what the API's 409 enforces); offers and logos cap the total.
 */
export function BannerListEditor({
  kind,
  locale,
  banners,
  onChanged,
  requestConfirm,
}: BannerListEditorProps) {
  const t = useTranslations("admin.homePageCms");
  const config = CONFIG[kind];
  const [newBanners, setNewBanners] = useState<NewBanner[]>([]);
  const [nextKey, setNextKey] = useState(0);
  const [listError, setListError] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);

  const liveCount = banners.filter((banner) => banner.isActive).length;
  const total = banners.length + newBanners.length;
  const liveFull = liveCount >= config.max;
  const totalFull = total >= config.max;

  const countLabel =
    config.capMode === "live"
      ? t("liveCount", { live: liveCount, max: config.max })
      : `${total} / ${config.max}`;

  function handleAdd() {
    setNewBanners((current) => [
      ...current,
      // Past the live cap a new hero banner starts as a draft; offers and
      // logos are capped on the total instead, so they start visible.
      { key: nextKey, isActive: config.capMode === "live" ? !liveFull : true },
    ]);
    setNextKey((key) => key + 1);
  }

  async function createBanner(
    item: NewBanner,
    draft: BannerDraft,
    isActive: boolean,
  ): Promise<string | null> {
    const lastSortOrder = banners.reduce(
      (max, banner) => Math.max(max, banner.sortOrder),
      -1,
    );

    try {
      const response = await fetch(BANNERS_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...toPayload(draft, config),
          locale,
          placement: config.placement,
          sortOrder: lastSortOrder + 1,
          isActive,
          startsAt: null,
          endsAt: null,
        }),
      });

      if (!response.ok) {
        return await readErrorMessage(response, t("couldNotSaveBanner"));
      }
    } catch {
      return t("somethingWentWrong");
    }

    setNewBanners((current) =>
      current.filter((entry) => entry.key !== item.key),
    );
    await onChanged();
    return null;
  }

  async function patchBanner(
    id: string,
    body: Record<string, unknown>,
  ): Promise<string | null> {
    try {
      const response = await fetch(`${BANNERS_ENDPOINT}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        return await readErrorMessage(response, t("couldNotSaveBanner"));
      }
    } catch {
      return t("somethingWentWrong");
    }

    await onChanged();
    return null;
  }

  /**
   * Moves one banner and renumbers the placement to its displayed positions.
   * Renumbering rather than swapping two values because `sortOrder` is not
   * unique — equal numbers would swap to no effect. Only rows whose position
   * changed are written.
   */
  async function handleMove(index: number, direction: -1 | 1) {
    const reordered = moveAt(banners, index, direction);

    setMoving(true);
    setListError(null);

    try {
      for (const [position, banner] of reordered.entries()) {
        if (banner.sortOrder !== position) {
          const response = await fetch(`${BANNERS_ENDPOINT}/${banner.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sortOrder: position }),
          });

          if (!response.ok) {
            setListError(
              await readErrorMessage(response, t("couldNotReorderBanners")),
            );
            break;
          }
        }
      }
    } catch {
      setListError(t("somethingWentWrong"));
    } finally {
      // Reloaded even on failure: some rows may already have been renumbered.
      await onChanged();
      setMoving(false);
    }
  }

  function handleRemove(banner: CmsBanner) {
    requestConfirm({
      title: t("removeBannerTitle"),
      description: t("removeBannerDescription", {
        title: banner.title || t("untitled"),
      }),
      confirmLabel: t("remove"),
      destructive: true,
      onConfirm: async () => {
        const response = await fetch(`${BANNERS_ENDPOINT}/${banner.id}`, {
          method: "DELETE",
        });

        if (!response.ok) {
          return readErrorMessage(response, t("couldNotRemoveBanner"));
        }

        await onChanged();
        return null;
      },
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <ListHeader
        label={t(config.labelKey)}
        countLabel={countLabel}
        full={config.capMode === "live" ? liveFull : totalFull}
        addLabel={t(config.addKey)}
        addDisabled={config.capMode === "total" && totalFull}
        onAdd={handleAdd}
      />
      {config.capMode === "live" ? (
        <p className="text-xs text-muted-foreground">
          {liveFull
            ? t("heroLiveFullNote", { max: config.max })
            : t("heroLiveNote", { max: config.max })}
        </p>
      ) : null}
      {listError ? (
        <p role="alert" className="text-sm text-destructive">
          {listError}
        </p>
      ) : null}

      {banners.map((banner, index) => (
        <BannerCard
          // Keyed by `updatedAt` too, so a card's draft resets to what the
          // server stored after every save or reload.
          key={`${banner.id}-${banner.updatedAt}`}
          kind={kind}
          banner={banner}
          number={index + 1}
          canGoLive={config.capMode !== "live" || !liveFull}
          canMoveUp={!moving && index > 0}
          canMoveDown={!moving && index < banners.length - 1}
          initialActive={banner.isActive}
          onSave={(draft) => patchBanner(banner.id, toPayload(draft, config))}
          onToggle={(next) => patchBanner(banner.id, { isActive: next })}
          onMove={(direction) => void handleMove(index, direction)}
          onRemove={() => handleRemove(banner)}
        />
      ))}

      {newBanners.map((item, index) => (
        <BannerCard
          key={`new-${item.key}`}
          kind={kind}
          banner={null}
          number={banners.length + index + 1}
          canGoLive={config.capMode !== "live" || !liveFull}
          canMoveUp={false}
          canMoveDown={false}
          initialActive={item.isActive}
          onSave={(draft, isActive) => createBanner(item, draft, isActive)}
          onToggle={async () => null}
          onMove={() => undefined}
          onRemove={() =>
            setNewBanners((current) =>
              current.filter((entry) => entry.key !== item.key),
            )
          }
        />
      ))}

      {banners.length === 0 && newBanners.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3.5 py-6 text-center text-sm text-muted-foreground">
          {t("noBannersYet")}
        </p>
      ) : null}
    </div>
  );
}
