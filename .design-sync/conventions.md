## Wrapping and setup

Every composition using these components **must** be wrapped in an element carrying the `data-admin-surface` attribute — this is the app's admin/back-office surface marker. Without it, `bg-accent` / `bg-muted` (used in button/select/dropdown-menu/popover hover states, card footers, tabs backgrounds) resolve to the marketing landing page's warm palette instead of the neutral tokens these components are actually built against, and the default `border` color falls back to `currentColor` instead of the border token. There is no React context provider to wrap in — `data-admin-surface` is a plain DOM attribute:

```jsx
<div data-admin-surface className="font-body">
  {/* your composition */}
</div>
```

Also apply `font-body` (or `font-display` for headings) on that same root — the IBM Plex fonts are opt-in per-surface utilities, never the page default, so text renders in the system font stack unless you ask for IBM Plex explicitly.

**These components are light-mode only.** There is no dark-mode variant for this token set (no `.dark` class support here) — don't build a dark-themed screen with them.

## Styling idiom

Tailwind utility classes driven by CSS custom properties (oklch color tokens), composed with `cva` (class-variance-authority) for variants and merged with a `cn()` helper — never inline styles or CSS-in-JS. Real token names in play:

| Token pair | Use |
|---|---|
| `bg-primary` / `text-primary-foreground` | Primary actions |
| `bg-secondary` / `text-secondary-foreground` | Secondary surfaces |
| `bg-muted` / `text-muted-foreground` | Muted backgrounds, secondary text |
| `bg-accent` / `text-accent-foreground` | Hover/highlighted state (menus, selects) |
| `bg-destructive` / `text-destructive` | Destructive actions, error state |
| `border-border`, `border-input` | Default borders, form-control borders |
| `bg-card` / `text-card-foreground`, `bg-popover` / `text-popover-foreground` | Card and popover/menu surfaces |
| `ring-ring` | Focus rings |

Radius uses Tailwind's *default* scale (`rounded-lg`, `rounded-xl`), not a custom `--radius` — a few components (`Button`, `Select`, `Calendar`) reach for `var(--radius-md)` directly. Don't invent new token names; every color a component needs already has a token above.

## Where the truth lives

Read `styles.css` (it `@import`s `fonts/fonts.css` and `_ds_bundle.css`, the compiled Tailwind output) before styling anything — it's the real, compiled stylesheet, not a summary. Each component's `.prompt.md` documents its actual prop surface; trust that over guessing.

## Example

```jsx
<div data-admin-surface className="font-body">
  <Card>
    <CardHeader>
      <CardTitle>Order #A4821</CardTitle>
      <CardDescription>Van · 2 stops · 14.2 km</CardDescription>
    </CardHeader>
    <CardContent>
      <Badge>In transit</Badge>
    </CardContent>
    <CardFooter>
      <Button>Track order</Button>
      <Button variant="outline">Cancel</Button>
    </CardFooter>
  </Card>
</div>
```
