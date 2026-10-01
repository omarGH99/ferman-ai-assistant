import React from "react";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { useTheme } from "../theme/ThemeProvider";

/** The app's icon set: one 24×24 grid, 2px strokes, round caps throughout.
 *
 * Single-colour by design — the app has light, dark and silver themes, so an
 * icon that carried its own colours would clash in at least one of them. Colour
 * comes from the caller (or the theme's text colour) instead.
 *
 * No left/right arrows anywhere: the UI flips to RTL for Arabic and Kurdish,
 * where a right-pointing arrow reads as "back". Share is three connected nodes
 * and import points downward for that reason.
 */
export type IconName =
  | "weather" | "forecast" | "air" | "tasks" | "upcoming" | "shopping" | "water"
  | "prayer" | "holidays" | "currency" | "crypto" | "news" | "trending" | "history"
  | "home" | "chat" | "calendar" | "qibla" | "share" | "import" | "bell"
  // The only directional glyph in the set. Everything else was kept
  // non-directional on purpose, because Arabic and Kurdish mirror the layout
  // and a hardcoded right-arrow points the wrong way in two of three
  // languages. This one is drawn pointing right and callers mirror it via
  // `flip` — see FeedCard, which passes the i18n `chromeRtl` flag.
  | "chevron";

export function Icon({
  name,
  size = 18,
  color,
  flip,
}: {
  name: IconName;
  size?: number;
  color?: string;
  /** Mirror horizontally, for the directional `chevron` under RTL layout. */
  flip?: boolean;
}) {
  const { theme } = useTheme();
  const stroke = color || theme.text;
  // Keep the visual weight constant as the icon scales, rather than letting a
  // fixed 2px look heavy at 18px and hairline at 40px.
  const sw = (2 * 24) / 24;

  const common = {
    fill: "none" as const,
    stroke,
    strokeWidth: sw,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={flip ? { transform: [{ scaleX: -1 }] } : undefined}
    >
      {paths(name, common, stroke)}
    </Svg>
  );
}

function paths(name: IconName, c: any, stroke: string) {
  switch (name) {
    case "weather":
      return (
        <>
          <Circle cx="8" cy="7.5" r="3" {...c} />
          <Path d="M8 1.8v1.4M2.3 7.5h1.4M4 3.5l1 1M12 3.5l-1 1" {...c} />
          <Path d="M16.5 19a3 3 0 0 0 0-6 4.5 4.5 0 0 0-8.6-1.2A3.2 3.2 0 0 0 8.2 19z" {...c} />
        </>
      );
    case "forecast":
      return (
        <>
          <Path d="M16.5 14.5a3 3 0 0 0 0-6 4.5 4.5 0 0 0-8.6-1.2A3.2 3.2 0 0 0 8.2 14.5z" {...c} />
          <Path d="M8 19.5h.01M12 19.5h.01M16 19.5h.01" {...c} />
        </>
      );
    case "air":
      return (
        <>
          <Path d="M3 8.5h10.5a2.5 2.5 0 1 0-2.5-2.5" {...c} />
          <Path d="M3 13.5h13a2.5 2.5 0 1 1-2.5 2.5" {...c} />
          <Path d="M3 18.5h6.5" {...c} />
        </>
      );
    case "tasks":
      return (
        <>
          <Circle cx="12" cy="12" r="9" {...c} />
          <Path d="M8 12.2l2.6 2.6L16 9.5" {...c} />
        </>
      );
    case "upcoming":
      return (
        <>
          <Circle cx="12" cy="12" r="9" {...c} />
          <Path d="M12 7v5.2l3.2 1.8" {...c} />
        </>
      );
    case "shopping":
      return (
        <>
          <Path d="M3.5 8h17l-1.6 9.4a2 2 0 0 1-2 1.6H7.1a2 2 0 0 1-2-1.6z" {...c} />
          <Path d="M8.5 8V6a3.5 3.5 0 0 1 7 0v2" {...c} />
        </>
      );
    case "water":
      return <Path d="M12 3s5.5 5.8 5.5 9.5a5.5 5.5 0 0 1-11 0C6.5 8.8 12 3 12 3z" {...c} />;
    case "prayer":
      return (
        <>
          <Path d="M7.5 19v-4.5a4.5 4.5 0 0 1 9 0V19" {...c} />
          <Path d="M3.5 19h17M5.5 19v-6M18.5 19v-6" {...c} />
          <Circle cx="12" cy="6.2" r="0.9" fill={stroke} stroke="none" />
        </>
      );
    case "holidays":
      return (
        <>
          <Rect x="3.5" y="5" width="17" height="15.5" rx="2.5" {...c} />
          <Path d="M3.5 10h17M8 3v4M16 3v4" {...c} />
          <Circle cx="12" cy="15" r="1.6" fill={stroke} stroke="none" />
        </>
      );
    case "currency":
      return (
        <>
          <Rect x="2.5" y="6" width="19" height="12" rx="2.5" {...c} />
          <Circle cx="12" cy="12" r="2.8" {...c} />
        </>
      );
    case "crypto":
      return (
        <>
          <Circle cx="12" cy="12" r="9" {...c} />
          <Path d="M12 7v10M9.5 9.8h4.2M9.5 14.2h4.2" {...c} />
        </>
      );
    case "news":
      return (
        <>
          <Path d="M17 5.5H4.5A1.5 1.5 0 0 0 3 7v10.5a2 2 0 0 0 2 2h12" {...c} />
          <Path d="M17 5.5v12a2 2 0 0 0 4 0V9.5h-4" {...c} />
          <Path d="M6 9.5h7M6 13h7M6 16.2h4.5" {...c} />
        </>
      );
    case "trending":
      return (
        <Path
          d="M12 3s4.6 4.3 4.6 8.6a4.6 4.6 0 0 1-9.2 0c0-2 1.2-3.6 2.3-4.7 0 1.7.8 2.5 1.6 2.5 1.1 0 .7-3.5.7-6.4z"
          {...c}
        />
      );
    case "history":
      return (
        <>
          <Path d="M12 3.2L4 8.2h16z" {...c} />
          <Path d="M3.5 20.5h17M7.5 8.2v12.3M12 8.2v12.3M16.5 8.2v12.3" {...c} />
        </>
      );
    case "home":
      return (
        <>
          <Path d="M3.5 10.8L12 4l8.5 6.8" {...c} />
          <Path d="M6 9.6V20h12V9.6" {...c} />
        </>
      );
    case "chat":
      return (
        <Path
          d="M20.5 15.5a2 2 0 0 1-2 2H9.2L5 20.8v-3.3a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h13.5a2 2 0 0 1 2 2z"
          {...c}
        />
      );
    case "calendar":
      return (
        <>
          <Rect x="3.5" y="5" width="17" height="15.5" rx="2.5" {...c} />
          <Path d="M3.5 10h17M8 3v4M16 3v4" {...c} />
        </>
      );
    case "qibla":
      return (
        <>
          <Circle cx="12" cy="12" r="9" {...c} />
          <Path d="M15.2 8.8l-2.1 6.4-6.3 2.1 2.1-6.4z" {...c} />
        </>
      );
    case "share":
      return (
        <>
          <Circle cx="6" cy="12" r="2.6" {...c} />
          <Circle cx="17.5" cy="6.5" r="2.6" {...c} />
          <Circle cx="17.5" cy="17.5" r="2.6" {...c} />
          <Path d="M8.4 10.9l6.8-3.3M8.4 13.1l6.8 3.3" {...c} />
        </>
      );
    case "import":
      return (
        <>
          <Path d="M12 3.5v9.8M8.4 10l3.6 3.6L15.6 10" {...c} />
          <Path d="M4.5 16v2.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V16" {...c} />
        </>
      );
    case "bell":
      return (
        <>
          <Path d="M6 17v-5.5a6 6 0 0 1 12 0V17l1.8 2.2H4.2z" {...c} />
          <Path d="M10 20a2 2 0 0 0 4 0" {...c} />
        </>
      );
    case "chevron":
      // Drawn pointing right; mirrored by the `flip` prop under RTL.
      return <Path d="M9.5 5.5l6.5 6.5-6.5 6.5" {...c} />;
    default:
      return null;
  }
}
