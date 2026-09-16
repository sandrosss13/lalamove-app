/**
 * Layout constants shared by every surface of the platform.
 *
 * Exactly one width figure lives here on purpose. It started life hand-typed
 * in each screen that needed it and immediately drifted, which is how the
 * client's order list ended up 768px wide while the account screen beside it
 * was 1152px and the back office had no cap at all.
 */

/**
 * The platform's data-screen width: fill the window, stop at 1800px, centre.
 *
 * Data screens — the back office, the client's order list and account
 * settings, the driver hub's board — are tables, rosters and card grids whose
 * whole value is how many columns and rows fit on screen at once. On a 1900px
 * display the old caps left ~700px of dead gutter beside a table that was
 * scrolling horizontally, so these screens now take the width they are given.
 * 1800px is where that stops: past it the eye has too far to travel from a
 * row's first cell to its last.
 *
 * Deliberately NOT applied to the landing page, the auth screens, either
 * onboarding wizard, or a prose paragraph inside a page. Those are reading and
 * form surfaces — a sign-in form or a paragraph stretched across a monitor is
 * worse, not better — so they keep their own, narrower caps.
 *
 * `mx-auto` is part of the string because a cap without it hugs the left edge
 * the moment the window is wider than the cap; `w-full` is part of it because
 * these containers are sometimes flex items (the admin shell's `<main>`),
 * where auto side margins cancel the default stretch and would otherwise
 * shrink the box to its content.
 */
export const DATA_SCREEN_WIDTH_CLASSES = "mx-auto w-full max-w-[1800px]";
