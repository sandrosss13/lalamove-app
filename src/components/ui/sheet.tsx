"use client";

import * as React from "react";
import { Dialog as SheetPrimitive } from "radix-ui";
import { XIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * The shadcn sheet: a panel that slides in from one edge of the viewport.
 *
 * Transcribed from this project's own registry style — `shadcn@latest add
 * sheet` against `"style": "radix-nova"` (see `components.json`) resolves to
 * `registry/radix-nova/ui/sheet.tsx`, whose only dependency is `cn` and whose
 * only registry dependency is `button`. It is written out here rather than
 * pulled by the CLI for one reason: the registry copy renders its close glyph
 * through `IconPlaceholder`, a registry-authoring component that lives at
 * `@/app/(create)/components/icon-placeholder` and does not exist outside the
 * shadcn monorepo. `dialog.tsx` resolves the same placeholder to lucide's
 * `XIcon`, so this file does too, and the two primitives stay identical
 * wherever they overlap — same `radix-ui` package, same `data-slot` names, same
 * `data-open:`/`data-closed:` animation variants, same `Button variant="ghost"
 * size="icon-sm"` close affordance.
 *
 * ## The one deliberate deviation: `overlayClassName`
 *
 * The registry's `SheetContent` renders its own overlay and offers no way to
 * style it. This copy adds a single `overlayClassName` pass-through, because
 * the scrim and the content are portalled to `document.body` as *siblings* —
 * neither is inside the other — so a consumer that needs to hide the sheet at a
 * breakpoint has to be able to hide both. The load board is exactly that
 * consumer: its desktop and mobile trees are both mounted at all times and CSS
 * picks between them (`loads-screen.tsx`), so `loads-detail-sheet.tsx` marks
 * both portalled elements `lg:hidden`. Without this prop the scrim would paint
 * over the desktop board while the sheet itself was hidden.
 *
 * ## Why `SheetContent` draws its own scrim instead of using `SheetOverlay`
 *
 * `SheetPrimitive.Overlay` is, verbatim in `@radix-ui/react-dialog@1.1.23`,
 * `return context.modal ? <Presence…/> : null` — it renders **nothing at all**
 * under `modal={false}`. That is not a corner case here: the load board's
 * detail sheet has to be non-modal (a modal Radix dialog puts
 * `pointer-events: none` on `<body>`, which would freeze the desktop board
 * behind a sheet that is `display:none` at `lg`), so the sheet's only consumer
 * in this app is precisely the one Radix draws no overlay for. The symptoms
 * were all silent: no dimming behind the sheet, a dead `overlayClassName`, and
 * a consumer guard keyed on `[data-slot="sheet-overlay"]` matching an element
 * that never existed — so tap-outside-to-close could not work.
 *
 * The scrim below is therefore a plain `<div>`, which renders identically in
 * both modes. It keeps the `data-slot="sheet-overlay"` name (consumers select
 * on it), sits before the content in the portal so the two `z-50` layers stack
 * scrim-then-panel by DOM order exactly as Radix's own pair did, and carries
 * `pointer-events-auto` so it stays clickable under a modal layer's
 * body-level `pointer-events: none` — the same thing `DialogOverlayImpl` does
 * with an inline style.
 *
 * Pressing it closes the sheet through Radix's own dismissal path rather than
 * through a click handler of ours: the scrim is outside `Content`, so a
 * pointer-down on it reaches `DismissableLayer`'s `onPointerDownOutside` and
 * dismisses the layer, and a consumer that filters that event (as
 * `loads-detail-sheet.tsx` does) keeps full control over which outside presses
 * count.
 *
 * `SheetOverlay` stays exported for a future **modal** consumer that wants
 * Radix's own overlay — notably its `RemoveScroll`, which is where modal
 * body-scroll locking comes from and which a plain div cannot provide.
 */

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

/**
 * The scrim's own classes, shared by `SheetOverlay` and by the plain `<div>`
 * `SheetContent` paints in its place, so the two cannot drift apart visually.
 *
 * `pointer-events-auto` is load-bearing only in modal mode, where Radix sets
 * `pointer-events: none` on `<body>`: without it the scrim would not receive
 * the press that dismisses the sheet. In non-modal mode it is a no-op.
 */
const SCRIM_CLASSES =
  "pointer-events-auto fixed inset-0 z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs";

/**
 * Radix's own overlay — **not used by `SheetContent`**; see this file's doc
 * comment. Exported for a modal consumer that needs `RemoveScroll` with it.
 */
function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        SCRIM_CLASSES,
        "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className,
      )}
      {...props}
    />
  );
}

function SheetContent({
  className,
  overlayClassName,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "top" | "right" | "bottom" | "left";
  showCloseButton?: boolean;
  /** Classes for the portalled scrim. See this file's doc comment. */
  overlayClassName?: string;
}) {
  return (
    <SheetPortal>
      {/* The scrim. A plain element rather than `SheetOverlay`, which Radix
          renders as `null` whenever the dialog is non-modal — see this file's
          doc comment. Only `animate-in`: the portal unmounts it the moment the
          sheet closes, so there is no closed state for an exit animation to
          run in, and a `data-closed:` variant would key off a `data-state`
          attribute that nothing sets on a plain div. */}
      <div
        data-slot="sheet-overlay"
        // Decorative. It is a dimming layer with no content, and its dismissal
        // behaviour is reachable from the panel's own close button and Escape.
        aria-hidden="true"
        className={cn(SCRIM_CLASSES, "animate-in fade-in-0", overlayClassName)}
      />
      {/* Geometry is driven by `data-side` rather than by a `cva` variant so
          the whole panel is one class string the CLI can diff against the
          registry copy on a future update. */}
      <SheetPrimitive.Content
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          // `border-border` is explicit rather than inherited: the back
          // office's border token comes from `[data-admin-surface] *` in
          // `globals.css`, a descendant selector, and this element is the one
          // *carrying* that attribute — so its own `border-t` would fall back
          // to Tailwind v4's `currentColor` and draw a near-black hairline
          // across the top of the panel. `dialog.tsx` never hit this because it
          // uses a ring rather than a border.
          "fixed z-50 flex flex-col gap-4 border-border bg-popover bg-clip-padding text-sm text-popover-foreground shadow-lg transition duration-200 ease-in-out data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:border-t data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:border-r data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-3/4 data-[side=right]:border-l data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-[side=bottom]:data-open:slide-in-from-bottom-10 data-[side=left]:data-open:slide-in-from-left-10 data-[side=right]:data-open:slide-in-from-right-10 data-[side=top]:data-open:slide-in-from-top-10 data-closed:animate-out data-closed:fade-out-0 data-[side=bottom]:data-closed:slide-out-to-bottom-10 data-[side=left]:data-closed:slide-out-to-left-10 data-[side=right]:data-closed:slide-out-to-right-10 data-[side=top]:data-closed:slide-out-to-top-10",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close data-slot="sheet-close" asChild>
            <Button
              variant="ghost"
              className="absolute top-3 right-3"
              size="icon-sm"
            >
              <XIcon />
              <span className="sr-only">Close</span>
            </Button>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-0.5 p-4", className)}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  );
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      // `font-display`, matching `DialogTitle` — the registry's own
      // `cn-font-heading` is the create-app's name for the same role.
      className={cn(
        "font-display text-base font-medium text-foreground",
        className,
      )}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
};
