import React from "react";

/**
 * Brand SVGs that ship as solid black/dark glyphs (no built-in light variant).
 * Invert them in dark mode so the icon stays visible on a dark background.
 */
const INVERT_IN_DARK = new Set([
  // DeepSeek Harness ships as the same monochrome mark ProviderIcon draws in
  // currentColor; the file variant is solid black, so dark mode has to invert it.
  "/brand-logos/deepseek-harness.svg",
  "/brand-logos/cursor.svg",
  "/brand-logos/kimi.svg",
  "/brand-logos/kiro.svg",
  "/brand-logos/copilot.svg",
  "/brand-logos/hermes.svg",
  // OpenBitFun's mark is a currentColor outline trace, i.e. solid black once an
  // image element resolves currentColor — same dark-mode inversion as the
  // harness mark.
  "/brand-logos/openbitfun.svg",
]);

/**
 * Single provider column header: brand icon + label from copy registry.
 */
export function LeaderboardProviderColumnHeader({ iconSrc, label }) {
  return (
    <span className="inline-flex items-center gap-3">
      {iconSrc ? (
        <img
          src={iconSrc}
          alt=""
          width={16}
          height={16}
          className={`h-4 w-4 shrink-0 object-contain opacity-90 ${
            INVERT_IN_DARK.has(iconSrc) ? "dark:invert" : ""
          }`}
        />
      ) : null}
      <span className="whitespace-nowrap">{label}</span>
    </span>
  );
}
