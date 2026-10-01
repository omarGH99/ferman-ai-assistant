export type ThemeName = "emerald" | "dark";

export interface Theme {
  name: ThemeName;
  bg: string;
  surface: string;
  header: string;
  text: string;
  muted: string;
  line: string;
  accent: string;
  accentInk: string;
  soft: string;
  chip: string;
  user: string;
  userInk: string;
  danger: string;
  outer: string;
  /** One step above `surface`, for anything stacked on a card: sheets, menus,
   * the selected state of a row. Light themes go slightly *down* in brightness
   * from white because there is nowhere up to go; dark themes go up. */
  elevated: string;
  /** Tint for shadows, paired with the geometry in tokens' `elevation`.
   * Tinted toward the theme's ink rather than pure black — a black shadow over
   * a green-tinted background reads as grey dirt rather than depth. */
  shadow: string;
  /** How much the shadow geometry should count for on this theme. Dark themes
   * pass 0: shadows are nearly invisible on dark backgrounds, so separation
   * comes from `elevated` and `line` instead of a smudge nobody can see. */
  shadowStrength: number;
}

export const THEMES: Record<ThemeName, Theme> = {
  emerald: {
    name: "emerald",
    bg: "#F4F8F6",
    surface: "#FFFFFF",
    header: "#FFFFFF",
    text: "#17241E",
    muted: "#6B7B73",
    line: "#E4EDE8",
    accent: "#059669",
    accentInk: "#FFFFFF",
    soft: "#E3F5EC",
    chip: "#EDF2F0",
    user: "#059669",
    userInk: "#FFFFFF",
    danger: "#DC2626",
    outer: "#DCE7E2",
    elevated: "#FAFCFB",
    shadow: "#0B231A",
    shadowStrength: 1,
  },
  dark: {
    name: "dark",
    bg: "#0E1613",
    surface: "#18211D",
    header: "#131B18",
    text: "#E6EFEA",
    muted: "#92A69C",
    line: "#26332D",
    accent: "#34D399",
    accentInk: "#05231A",
    soft: "#163329",
    chip: "#212B26",
    user: "#34D399",
    userInk: "#05231A",
    danger: "#F87171",
    outer: "#070C0A",
    elevated: "#212C27",
    shadow: "#000000",
    shadowStrength: 0,
  },
};

export const THEME_ORDER: ThemeName[] = ["emerald", "dark"];
