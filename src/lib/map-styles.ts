/**
 * Google Maps styled-map arrays, shared by the two map canvases in this app:
 * the booking flow's `RoutePreviewMap` (`src/components/home/route-preview-map.tsx`)
 * and the order tracking map (`src/components/order-tracking-map.tsx`).
 *
 * ## Why these live in a module and not in a `dark:` class
 *
 * A Maps SDK basemap is painted into its own canvas from a `MapTypeStyle[]`
 * handed to `map.setOptions()`. No CSS reaches inside it, so a map is one of the
 * very few things in this app that has to branch on the theme in JavaScript —
 * see `src/hooks/use-theme.ts`, which is how both components get the live value.
 *
 * ## Why the light halves differ and the dark half does not
 *
 * The preview map is a *brand* surface: it carries a hand-authored mint-and-teal
 * restyle whose whole job is to leave the orange route line as the only
 * saturated thing on the canvas. The tracking map is a *utility* surface and
 * ships Google's default basemap, which is what a customer watching a driver
 * move expects to see. That difference is deliberate and is preserved here:
 * `ROUTE_PREVIEW_MAP_STYLES_LIGHT` is the existing restyle, moved verbatim, and
 * the tracking map passes `DEFAULT_MAP_STYLES` (an empty array — see its note).
 *
 * They converge in dark mode on `MAP_STYLES_DARK`, because there is no default
 * dark basemap to fall back to. Google's own dark map is a Cloud-styled map,
 * which needs a Map ID, and both components deliberately avoid that dependency
 * (it is the same reason they use the legacy `Marker` over `AdvancedMarker` —
 * an API key alone has to be enough to render this app). So the dark basemap is
 * hand-authored, and one shared array is better than two that drift.
 */

/**
 * One entry of a Google Maps styled-map array. Mirrors `google.maps.MapTypeStyle`,
 * duplicated rather than imported because the `google` namespace is not reachable
 * from project source at all: `@types/google.maps` is only a transitive
 * dependency of `@vis.gl/react-google-maps`, and this project's `tsconfig.json`
 * pins `compilerOptions.types` to `["node"]`, so the global namespace those
 * typings declare is never loaded into our compilation.
 *
 * `stylers` is deliberately loose (the real type is `object[]`) because each
 * styler is a one-key record whose key depends on what it adjusts — `color`,
 * `saturation`, `lightness`, `weight`, `visibility`.
 */
export type MapTypeStyleEntry = {
  featureType?: string;
  elementType?: string;
  stylers: Record<string, string | number>[];
};

/**
 * Google's stock basemap, expressed as an empty style array rather than as
 * `undefined`.
 *
 * This matters: `@vis.gl/react-google-maps` forwards whatever is on the `styles`
 * prop straight into `map.setOptions()`, and `setOptions({ styles: undefined })`
 * is a no-op on the Maps SDK — it leaves whatever was applied last in place. On
 * a dark-to-light toggle that would strand the map in `MAP_STYLES_DARK`. An
 * empty array is an actual instruction to clear the styling.
 */
export const DEFAULT_MAP_STYLES: MapTypeStyleEntry[] = [];

/**
 * A cool green/teal restyle of the base map, for light mode.
 *
 * The point is contrast: landcover, parks and water carry the whole surface in
 * low-saturation mint and teal, roads and labels are pushed back, and points of
 * interest are hidden entirely. That leaves the orange route line and its two
 * markers as the only saturated things on the canvas, which is the one job this
 * map has.
 */
export const ROUTE_PREVIEW_MAP_STYLES_LIGHT: MapTypeStyleEntry[] = [
  // Landcover reads as a pale mint wash rather than Google's default beige.
  {
    featureType: "landscape",
    elementType: "geometry",
    stylers: [{ color: "#e6f2ee" }],
  },
  // Green space sits a shade deeper so it stays legible against that wash.
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#c7e3d6" }],
  },
  // Every other POI is flattened into the landcover and loses its label: this
  // is a route preview, not a map to explore.
  {
    featureType: "poi",
    elementType: "geometry",
    stylers: [{ color: "#dcebe5" }],
  },
  {
    featureType: "poi",
    elementType: "labels",
    stylers: [{ visibility: "off" }],
  },
  // Water carries the teal end of the palette.
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#a5d2cc" }],
  },
  // Roads stay visible for orientation, but desaturated and pale.
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#ffffff" }, { saturation: -70 }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#f1f6f4" }],
  },
  {
    featureType: "road",
    elementType: "labels",
    stylers: [{ saturation: -60 }, { lightness: 20 }],
  },
  // Transit lines would read as competing routes next to the polyline.
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  {
    featureType: "administrative",
    elementType: "geometry.stroke",
    stylers: [{ color: "#b6cec7" }],
  },
  // Remaining labels: muted slate-green text on a soft halo, so they read over
  // both the mint landcover and the teal water.
  { elementType: "labels.text.fill", stylers: [{ color: "#5b6f69" }] },
  {
    elementType: "labels.text.stroke",
    stylers: [{ color: "#f3f8f6" }, { weight: 2 }],
  },
];

/**
 * The dark basemap, used by BOTH maps.
 *
 * Built by inverting the light restyle's logic rather than by darkening its
 * values: on a dark ground the landcover has to be the quietest thing on the
 * canvas and the roads the brightest, which is the reverse of the light theme,
 * where pale roads sit on a mint wash.
 *
 * The anchor value is `#0f1416`, chosen to sit just above `--landing-ink`
 * (`#08090a`) and just below `--landing-frame` (`#111315`) — the map reads as an
 * inset panel on the page rather than a hole cut in it, matching how the light
 * map's mint sits just off white. Everything else is a step off that anchor.
 *
 * The two rules carried over unchanged from the light theme are the two that are
 * about *information*, not colour: POI labels and transit lines stay off,
 * because a competing route drawn next to the polyline is just as confusing in
 * the dark.
 *
 * Label contrast is the thing to preserve if these values are ever retuned.
 * Place names are drawn in `#9aaeaa` over a `#080b0c` halo — a dark halo rather
 * than the light theme's pale one, since here the text is the light element.
 * Without that halo, labels crossing a road or a park boundary lose their edge
 * entirely.
 */
export const MAP_STYLES_DARK: MapTypeStyleEntry[] = [
  // The whole canvas starts near-black; `geometry` catches every feature that
  // the rules below do not name, so no default beige or blue survives.
  { elementType: "geometry", stylers: [{ color: "#0f1416" }] },
  {
    featureType: "landscape",
    elementType: "geometry",
    stylers: [{ color: "#0f1416" }],
  },
  // Green space lifts very slightly and keeps a trace of hue, the same "one
  // shade deeper than the landcover" relationship the light theme uses.
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#15201c" }],
  },
  {
    featureType: "poi",
    elementType: "geometry",
    stylers: [{ color: "#131a1b" }],
  },
  {
    featureType: "poi",
    elementType: "labels",
    stylers: [{ visibility: "off" }],
  },
  // Water goes *down* from the landcover here, where in light mode the teal goes
  // down from the mint — same direction, so a river reads as a river either way.
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#070b0d" }],
  },
  // Roads are the brightest surface on a dark map: they are the structure the
  // eye navigates by once the landcover has gone quiet.
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#222b2d" }, { saturation: -70 }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#2d383a" }],
  },
  // Road numbers and street names, one step under the place labels below so the
  // two tiers stay distinguishable.
  {
    featureType: "road",
    elementType: "labels.text.fill",
    stylers: [{ color: "#7f918d" }],
  },
  {
    featureType: "road",
    elementType: "labels.text.stroke",
    stylers: [{ color: "#080b0c" }, { weight: 2 }],
  },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  {
    featureType: "administrative",
    elementType: "geometry.stroke",
    stylers: [{ color: "#2a3a37" }],
  },
  { elementType: "labels.text.fill", stylers: [{ color: "#9aaeaa" }] },
  {
    elementType: "labels.text.stroke",
    stylers: [{ color: "#080b0c" }, { weight: 2 }],
  },
];
