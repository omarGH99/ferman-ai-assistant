/** Type scale and corner radii.
 *
 * These grew organically to 22 distinct font sizes and 15 radii — 12, 12.5, 13
 * and 13.5 all appeared, sometimes in the same screen. Nobody chose four sizes
 * a half-point apart; they accumulated. The effect isn't that any one value is
 * wrong, it's that nothing reads as deliberate.
 *
 * Deliberately not part of `theme`: these don't change between light, dark and
 * silver, and folding them in would imply they might.
 *
 * The steps below were chosen to sit near the values already in use, so
 * adopting them moved most text by at most a point. Reach for the nearest step
 * rather than adding a new one.
 */
import type { Theme } from "./themes";

export const type = {
  xs: 11, // captions, unit labels, chip text
  sm: 12, // secondary detail
  base: 13, // dense body — list rows, card bodies
  md: 15, // primary body, form input
  lg: 17, // section titles
  xl: 22, // card headline figures
  xxl: 26, // screen titles
  display: 30, // the one big number on a card
} as const;

export const radius = {
  sm: 8, // chips, small buttons
  md: 12, // cards, inputs, sheets rows
  lg: 16, // large surfaces
  xl: 22, // the app-icon tile and anything imitating it
  round: 999, // pills and circles
} as const;

/** Spacing scale, in 4pt steps.
 *
 * The same problem the type scale had: 5, 8, 10, 11, 12 and 14 were all in use,
 * several of them inside one card. Spacing is more visible than type size —
 * inconsistent gaps are what make a layout feel assembled rather than designed,
 * because the eye reads rhythm even when it can't name it.
 *
 * 4pt steps because both platforms' own grids are 4/8, so these land on device
 * pixels at every common scale factor instead of blurring on 1.5x/2.5x screens.
 */
export const space = {
  xs: 4, // icon-to-label, tight inline gaps
  sm: 8, // inside a chip, between stacked lines
  md: 12, // card padding, gap between cards
  lg: 16, // section padding, card padding when generous
  xl: 24, // between major sections
  xxl: 32, // screen top/bottom breathing room
} as const;

/** Font weights, named rather than numbered.
 *
 * Everything was either normal or "700". Two weights can't express hierarchy,
 * so emphasis got expressed with size instead and the type scale did double
 * duty. 600 for titles reads as confident; 700 at 13px reads as shouting.
 */
export const weight = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
} as const;

/** Letter spacing.
 *
 * Small text needs air and large text needs less of it — this is the single
 * cheapest thing that separates considered typography from default typography.
 * `wide` is for the uppercase micro-labels that head a card; uppercase without
 * added tracking always looks cramped.
 */
export const tracking = {
  tight: -0.4, // display figures, 26pt and up
  normal: 0,
  wide: 0.6, // uppercase labels and chips
} as const;

/** Elevation.
 *
 * Cards were a flat 1px border on a near-white background, which puts every
 * surface on one plane. Depth is most of what "premium" means visually: it
 * tells the eye what is a surface and what is the page behind it.
 *
 * Shadows are deliberately soft, low-opacity and tinted toward the theme's ink
 * rather than pure black — a pure-black shadow over a warm or green-tinted
 * background reads as grey dirt. On dark themes shadows barely register, so the
 * dark palette carries the separation in surface lightness instead and passes
 * `none` here.
 *
 * `shadowColor` is supplied by the theme; these are the geometry only.
 */
export const elevation = {
  none: {},
  /** Resting cards. Barely visible, which is the point — you should feel it
   * rather than see it. */
  sm: {
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  /** Raised surfaces: sheets, menus, the active card. */
  md: {
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  /** Modals and anything that must clearly float above the page. */
  lg: {
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 28,
    elevation: 12,
  },
} as const;

/** Combine elevation geometry with the current theme's shadow tint.
 *
 * Kept here so no component has to remember that dark themes zero their
 * shadows — forgetting that is how you end up with a grey halo around every
 * card on dark, which looks like a rendering bug rather than a design.
 */
export function shade(theme: Pick<Theme, "shadow" | "shadowStrength">, level: keyof typeof elevation) {
  const geom = elevation[level];
  if (!theme.shadowStrength || !("shadowOpacity" in geom)) return {};
  return {
    ...geom,
    shadowColor: theme.shadow,
    shadowOpacity: geom.shadowOpacity * theme.shadowStrength,
  };
}

/** Minimum touchable size the platforms ask for (iOS 44pt, Android 48dp).
 * Controls smaller than this should carry hitSlop to make up the difference. */
export const MIN_TOUCH = 44;
