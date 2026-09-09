"use client";

import { MEMBER_COLORS } from "@/lib/groups";

interface Props {
  value: string;
  /** Colour -> who already has it in this group. Yours is not in here. */
  taken?: Record<string, string>;
  disabled?: boolean;
  onPick: (color: string) => void;
}

/**
 * Palette only, no free-form hex. The week grid prints white text on these, so
 * a colour picked freely could come back unreadable — and eight distinguishable
 * ones is already more than a group usually needs.
 *
 * A colour someone else in the group holds stays visible but unpickable: hiding
 * it would make the row jump around as people change theirs, and the tooltip
 * saying who has it is more useful than a gap.
 */
export function ColorPicker({ value, taken = {}, disabled, onPick }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {MEMBER_COLORS.map((color) => {
        const owner = taken[color];
        const mine = color === value;
        return (
          <button
            key={color}
            type="button"
            disabled={disabled || (!!owner && !mine)}
            aria-label={owner && !mine ? `${color}, taken by ${owner}` : color}
            aria-pressed={mine}
            title={owner && !mine ? `${owner} has this one` : undefined}
            onClick={() => onPick(color)}
            className={`h-6 w-6 rounded-full transition-transform ${
              mine
                ? "ring-2 ring-neutral-900 ring-offset-2 ring-offset-white dark:ring-white dark:ring-offset-neutral-950"
                : owner
                  ? "cursor-not-allowed opacity-30"
                  : "hover:scale-110"
            }`}
            style={{ backgroundColor: color }}
          />
        );
      })}
    </div>
  );
}
