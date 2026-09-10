/**
 * Layout shared by the two week views and their loading placeholder.
 *
 * The detailed grid and the availability heatmap sit behind one toggle, so they
 * have to be exactly the same height — otherwise everything below the grid
 * jumps when you switch. The skeleton matches for the same reason.
 */
export const COLUMN_HEIGHT = "h-[520px] sm:h-[660px] lg:h-[780px] xl:h-[880px]";

/**
 * Both views put a legend above the day names — the heatmap its ramp, the
 * detailed grid its block colours. Pinning the slot to one height is what
 * actually keeps the two views the same size: matching COLUMN_HEIGHT is not
 * enough on its own, because a legend that grows by a line moves everything
 * below the grid when you toggle.
 */
export const LEGEND_HEIGHT = "h-11";
