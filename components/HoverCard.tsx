"use client";

export interface HoverCardData {
  title: string;
  subtitle?: string;
  lines: string[];
  accent: string;
  /** Cursor position, in viewport coordinates. */
  x: number;
  y: number;
}

/**
 * Follows the cursor, fixed rather than in flow: the day columns clip their
 * overflow, so an in-flow tooltip would be cut off at the column edge. Shared
 * by both week views so a block and a heatmap cell read identically.
 */
export function HoverCard({ card }: { card: HoverCardData }) {
  return (
    <div
      // Offset from the cursor, and pulled left near the right edge so it
      // stays on screen.
      className="pointer-events-none fixed z-50 w-max max-w-[240px] rounded-lg border border-neutral-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur dark:border-neutral-700 dark:bg-neutral-900/95"
      style={{
        left: Math.min(card.x + 14, (typeof window !== "undefined" ? window.innerWidth : 1200) - 260),
        top: card.y + 14,
      }}
    >
      <div className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: card.accent }} />
        <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          {card.title}
        </span>
        {card.subtitle && <span className="text-xs text-neutral-500">{card.subtitle}</span>}
      </div>
      {card.lines.map((line, i) => (
        <div key={i} className="mt-0.5 text-xs text-neutral-600 dark:text-neutral-300">
          {line}
        </div>
      ))}
    </div>
  );
}
