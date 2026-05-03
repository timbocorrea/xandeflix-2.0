interface MediaCardProps {
  title: string;
  subtitle?: string;
  index: number;
}

export function MediaCard({ title, subtitle, index }: MediaCardProps) {
  return (
    <button
      className="media-card tv-focusable group relative aspect-[2/3] overflow-hidden p-4 text-left"
      type="button"
      data-nav-id={`media-card-${index + 1}`}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-xf-surface-soft via-xf-surface to-black" />

      <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black via-black/80 to-transparent p-4">
        <p className="line-clamp-2 text-base font-black text-white md:text-lg">
          {title}
        </p>

        {subtitle && (
          <p className="mt-1 text-xs font-semibold text-xf-muted">
            {subtitle}
          </p>
        )}
      </div>

      <div className="absolute right-3 top-3 z-10 rounded-full bg-black/70 px-3 py-1 text-xs font-bold text-white">
        HD
      </div>
    </button>
  );
}