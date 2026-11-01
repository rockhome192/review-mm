/** AniList cover on its own dominant color, so the slot never flashes white. */
export function Cover({
  src,
  color,
  title,
  className = "",
  eager = false,
  priority = false,
}: {
  src: string | null;
  color: string;
  title: string;
  className?: string;
  eager?: boolean;
  /** The page's LCP image: load eagerly and ask the browser to fetch it first. One per page. */
  priority?: boolean;
}) {
  return (
    <div
      className={`relative aspect-[3/4] overflow-hidden rounded-md border-[1.5px] border-ink ${className}`}
      style={{ background: color }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- static export, no image optimizer
        <img
          src={src}
          alt={`ปก ${title}`}
          loading={eager || priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : undefined}
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <span className="absolute inset-x-3 bottom-3 font-serif text-lg leading-tight font-extrabold">{title}</span>
      )}
    </div>
  );
}
