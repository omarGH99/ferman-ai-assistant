import React from "react";
import { useTheme } from "../../theme/ThemeProvider";
import { timeStrTo24, time24ToStr } from "../../utils/datetime";

// Web implementation: the browser's native date/time inputs (great UX, no deps).
// Metro serves this file on web; native gets DateTimeField.tsx.
export function DateTimeField({
  mode,
  value,
  placeholder,
  onChange,
}: {
  mode: "date" | "time";
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  const { theme } = useTheme();
  const style: React.CSSProperties = {
    border: `1px solid ${theme.line}`,
    background: theme.bg,
    color: theme.text,
    borderRadius: 8,
    padding: "10px 11px",
    fontSize: 13,
    width: "100%",
    boxSizing: "border-box",
    fontFamily: "inherit",
    colorScheme: theme.name === "dark" ? "dark" : "light",
  };

  if (mode === "date") {
    return (
      <input
        type="date"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={style}
      />
    );
  }
  return (
    <input
      type="time"
      value={timeStrTo24(value)}
      onChange={(e) => onChange(time24ToStr(e.target.value))}
      style={style}
    />
  );
}
