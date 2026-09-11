"use client";

import { useEffect, useState } from "react";

/**
 * A row on the card. A plain string is a sentence and reads as one; the
 * `{ label, value }` form is the "In class: Ann, Bo" shape, where the label is
 * a category you skim past and the value is the thing you came to read. Split
 * so the two can be weighted differently — flat grey rows of equal emphasis
 * meant finding one name in a six-line card was a linear scan.
 */
export type HoverLine = string | { label: string; value: string };

export interface HoverCardData {
  title: string;
  subtitle?: string;
  lines: HoverLine[];
  accent: string;
  /** Cursor position, in viewport coordinates. */
  x: number;
  y: number;
}

/**
 * The open card, and the two ways it closes that a mouse doesn't need.
 *
 * A tap fires the emulated mouseenter that opens the card, but a finger never
 * leaves, so `onMouseLeave` never comes and the card would sit there over a
 * band it has stopped describing. The next touch anywhere dismisses it — which
 * on a desktop means a click also dismisses, and that's fine, since the mouse
 * still has `onMouseLeave` for the ordinary case.
 *
 * Scrolling dismisses it too, and that one matters more than it looks: the card
 * is `fixed`, so swiping the day track sideways would leave it hanging over a
 * different day entirely. Captured, because the scroll that moves under it is
 * the track's, not the page's.
 */
export function useHoverCard() {
  const [card, setCard] = useState<HoverCardData | null>(null);

  useEffect(() => {
    if (!card) return;
    const dismiss = () => setCard(null);
    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("scroll", dismiss, true);
    return () => {
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("scroll", dismiss, true);
    };
  }, [card]);

  return [card, setCard] as const;
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
      className="pointer-events-none fixed z-50 w-max max-w-[280px] rounded-lg border border-neutral-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur dark:border-neutral-700 dark:bg-neutral-900/95"
      style={{
        left: Math.min(card.x + 14, (typeof window !== "undefined" ? window.innerWidth : 1200) - 300),
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
      {card.lines.map((line, i) =>
        typeof line === "string" ? (
          <div key={i} className="mt-0.5 text-xs leading-snug text-neutral-700 dark:text-neutral-300">
            {line}
          </div>
        ) : (
          <div key={i} className="mt-0.5 text-xs leading-snug">
            <span className="text-neutral-500 dark:text-neutral-400">{line.label}: </span>
            <span className="font-medium text-neutral-900 dark:text-neutral-100">{line.value}</span>
          </div>
        )
      )}
    </div>
  );
}
