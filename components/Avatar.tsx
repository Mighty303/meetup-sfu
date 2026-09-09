import Image from "next/image";

interface Props {
  src: string | null;
  /** Falls back to a coloured tile with this person's initial. */
  name: string;
  color?: string;
  size?: number;
  className?: string;
}

/**
 * A picture is either a Google URL or the data URL a member uploaded; next/image
 * already skips its optimiser for the latter, so both just work. What this adds
 * is the no-picture case: a tile in their group colour with their initial, which
 * still says who it is instead of leaving a hole in the row.
 */
export function Avatar({ src, name, color, size = 24, className = "" }: Props) {
  const rounded = `rounded-full ${className}`;

  if (!src) {
    return (
      <span
        aria-hidden
        className={`inline-flex shrink-0 items-center justify-center font-semibold text-white ${rounded}`}
        style={{
          width: size,
          height: size,
          backgroundColor: color ?? "#737373",
          fontSize: Math.max(9, Math.round(size * 0.45)),
        }}
      >
        {name.trim().charAt(0).toUpperCase() || "?"}
      </span>
    );
  }

  return (
    <Image
      src={src}
      alt=""
      width={size}
      height={size}
      className={`shrink-0 object-cover ${rounded}`}
      style={{ width: size, height: size }}
    />
  );
}
