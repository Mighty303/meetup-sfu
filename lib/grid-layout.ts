/**
 * Layout shared by the two week views and their loading placeholder.
 *
 * The detailed grid and the availability heatmap sit behind one toggle, so they
 * have to be exactly the same height — otherwise everything below the grid
 * jumps when you switch. The skeleton matches for the same reason.
 */

/**
 * Taller on a phone than it used to be. With five columns abreast the mobile
 * step only had to survive being squinted at; now one day fills the screen and
 * the grid is the main thing on the page, so it's worth the scroll. At 520px a
 * fifty-minute class was 31px tall and clipped its second line — the names —
 * which is the line that makes a block worth reading at all.
 */
export const COLUMN_HEIGHT = "h-[600px] sm:h-[660px] lg:h-[780px] xl:h-[880px]";

/**
 * Both views put a legend above the day names — the heatmap its ramp, the
 * detailed grid its block colours. Pinning the slot to one height is what
 * actually keeps the two views the same size: matching COLUMN_HEIGHT is not
 * enough on its own, because a legend that grows by a line moves everything
 * below the grid when you toggle.
 */
export const LEGEND_HEIGHT = "h-11";

/*
 * Below `sm`, five columns side by side is five unreadable slivers, so the days
 * become a snap track: one day to a screen, swiped between.
 *
 * The scrolling moves *inside* the row rather than around it. The hour gutter
 * is a sibling of the track, not a child, so it simply never scrolls — no
 * sticky positioning, no opaque backdrop for columns to slide under, and the
 * hour labels stay beside whichever day you're on because they were never part
 * of what moves.
 *
 * Above `sm` every one of these turns itself off and the grid is the
 * five-abreast layout it has always been — and, now, one that never scrolls
 * sideways at all. It used to: the columns carried a minimum width and the
 * wrapper an `overflow-x-auto`, so a week with several clashing sections grew
 * past the viewport and slid. That reads as a bug, because a grid is a picture
 * of a week and half a picture is not a smaller picture. The columns share
 * whatever width the page has instead, and a badly-clashing day squeezes.
 */

/**
 * Wrapper around legend + gutter + days.
 *
 * Deliberately owns no overflow. On a phone the day track below does its own
 * scrolling, and a second scroll container wrapped around a snap track is
 * exactly what makes one feel loose — the outer box slides a few pixels and the
 * snap never engages. Above `sm` there is nothing to scroll at all.
 *
 * The negative margin is only there to let the track reach the screen edge on a
 * phone, where the page pads itself by 4.
 */
export const GRID_SCROLLER = "-mx-4 px-4 sm:mx-0 sm:px-0";

/**
 * The days themselves. A flex track that snaps on a phone, the original
 * five-column grid from `sm` up.
 *
 * `-mr-4 pr-4` lets the track bleed through the wrapper's mobile padding to the
 * screen edge, so the day that's peeking isn't cut off 16px early.
 *
 * `snap-mandatory` rather than `proximity`: a day is the unit this view is made
 * of, and resting between two of them shows you half of each.
 */
export const DAY_TRACK =
  "flex flex-1 snap-x snap-mandatory gap-2 overflow-x-auto -mr-4 pr-4 " +
  "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden " +
  "sm:mr-0 sm:grid sm:grid-cols-5 sm:snap-none sm:overflow-visible sm:pr-0";

/**
 * One day in that track.
 *
 * The width is the viewport less the page padding, the hour gutter and its gap
 * — and then ~28px more, so the next day is always visibly half-arrived. That
 * sliver is the whole affordance: a snap track that fills the screen exactly
 * looks like a static column and nobody thinks to swipe it.
 */
export const DAY_CELL = "w-[calc(100vw-6.25rem)] shrink-0 snap-start sm:w-auto";
