import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * THE `accent` / `muted` TRAP — the reason this file (and every other
 * `src/components/ui/*` primitive) says `bg-secondary` where upstream shadcn
 * says `bg-accent` or `bg-muted`. This is the canonical note; the other
 * primitives point here rather than restating it.
 *
 * `globals.css` resolves those two shadcn colour names through a fallback
 * chain, because the landing palette claimed the names first:
 *
 *     --color-muted:  var(--admin-muted,  var(--landing-muted));
 *     --color-accent: var(--admin-accent, var(--landing-accent));
 *
 * `--admin-muted` / `--admin-accent` exist ONLY inside
 * `[data-admin-surface]` / `[data-onboarding-surface]`. Everywhere else the
 * chain falls through to the landing palette, where `accent` is the brand
 * ORANGE (`#ff5a1f` / `#f58220`) and `muted` is secondary *text* colour — a
 * dark brown-grey in light mode, a 55%-alpha near-white in dark. Neither is a
 * neutral surface, so `hover:bg-muted` on a client page paints a ghost button
 * dark brown, and `focus:bg-accent` paints a menu item bright orange.
 *
 * These primitives render on BOTH kinds of surface. The admin back office, the
 * driver hub, the auth shell and both onboarding wizards mark themselves and
 * get the shadcn values; the signed-in client pages (`/home`'s booking form,
 * `/account`, `/wallet`, checkout) do not and get the landing ones. So a
 * primitive cannot rely on the chain resolving the way upstream assumes.
 *
 * `secondary` is the escape hatch, and it is an exact one rather than an
 * approximation: `--color-secondary` maps straight to `--secondary` with no
 * fallback chain, and this project's `--secondary` / `--secondary-foreground`
 * are declared to the SAME values as `--muted` and `--accent` in both halves
 * of the token set (`oklch(0.97 0 0)` / `oklch(0.205 0 0)` light,
 * `oklch(0.269 0 0)` / `oklch(0.985 0 0)` dark). On a marked surface the swap
 * is therefore pixel-identical to what shipped before; off one, it is the
 * difference between a neutral hover and a brand-orange flash.
 *
 * If a future `shadcn add` overwrites one of these files, this is the edit to
 * re-apply. Do not "fix" it by writing `--color-accent`/`--color-muted` in
 * `globals.css` — that would bypass the `--admin-*` chain the back office
 * depends on, which is exactly what the chain exists to avoid.
 *
 * `dark:hover:bg-secondary/50` on `ghost` is upstream's shape kept intact: the
 * dark hover is deliberately softer than the light one, because a full-strength
 * `oklch(0.269 0 0)` plate under a cursor reads heavier on a dark ground than
 * its light-mode counterpart does on a white one.
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/80",
        outline:
          "border-border bg-background hover:bg-secondary hover:text-foreground aria-expanded:bg-secondary aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-secondary hover:text-foreground aria-expanded:bg-secondary aria-expanded:text-foreground dark:hover:bg-secondary/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
