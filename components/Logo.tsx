/**
 * The site mark: sfucourses' two-tone ring and black disc, reused with the
 * owner's permission, around a week grid with one slot lit — the thing the
 * site is for.
 *
 * Inline rather than an <img> so it inherits no network request and stays
 * crisp at any size. `app/icon.svg` is the same drawing; Next needs the
 * favicon as its own file, so the two have to be kept in step by hand.
 */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      role="img"
      aria-label="meetup-sfu"
      className="shrink-0"
    >
      <circle cx="18" cy="18" r="17" fill="#ffdf00" />
      <path d="M30 6A17 17 0 0 0 6 30Z" fill="#24a98b" />
      <circle cx="18" cy="18" r="12.5" fill="#191a1a" />
      <g fill="#fff">
        <rect x="10.5" y="10.5" width="6.5" height="6.5" rx="1.5" />
        <rect x="19" y="10.5" width="6.5" height="6.5" rx="1.5" />
        <rect x="10.5" y="19" width="6.5" height="6.5" rx="1.5" />
      </g>
      <rect x="19" y="19" width="6.5" height="6.5" rx="1.5" fill="#ffdf00" />
    </svg>
  );
}
