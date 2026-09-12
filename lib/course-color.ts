// A colour per course, for the one view where the member colour says nothing.
//
// On the group grid every block is its owner's colour, which is the whole
// point — you scan a column for a person. On your own schedule there is only
// one person, so every block came out the same shade and a week of five
// courses read as one flat wall of it. Here the colour carries the course
// instead.

import { MEMBER_COLORS } from "./groups";

/**
 * Course code -> colour, assigned by position in the sorted list of distinct
 * codes.
 *
 * By position rather than by hashing the code: a hash is stable when you add a
 * course, but with eight colours and five courses it collides about half the
 * time, and two courses the same colour is exactly the thing this is meant to
 * fix. Sorting instead means the assignment is deterministic and collision-free
 * up to the size of the palette — at the cost of colours shifting when you add
 * a course, which the chips beside the search box make visible.
 *
 * Sections of one course share a colour: "CHIN 100 B100" and "CHIN 100 B102"
 * are the same course, and telling them apart is the section label's job.
 *
 * Used on `view=mine` only, and everything that shows these colours is gated
 * on the same thing. A course has no colour of its own in a group — there the
 * colour is whose block it is — so a swatch that survived into the group view
 * would be contradicting the grid two inches below it.
 */
export function courseColors(codes: string[]): Record<string, string> {
  const distinct = [...new Set(codes)].sort();
  const out: Record<string, string> = {};
  distinct.forEach((code, i) => {
    out[code] = MEMBER_COLORS[i % MEMBER_COLORS.length];
  });
  return out;
}
