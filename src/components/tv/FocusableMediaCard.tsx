import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';

interface FocusableMediaCardProps {
  title: string;
  subtitle?: string;
  focusKey: string;
  onEnterPress?: () => void;
  onArrowPress?: (direction: string) => boolean;
}

export function FocusableMediaCard({
  title,
  subtitle,
  focusKey,
  onEnterPress,
  onArrowPress,
}: FocusableMediaCardProps) {
  const { ref, focused } = useFocusable({
    focusKey,
    onEnterPress,
    onArrowPress,
    onFocus: () => {
      ref.current?.scrollIntoView({
        behavior: 'auto',
        block: 'center',
        inline: 'nearest',
      });
    },
  });

  return (
    <button
      ref={ref}
      className="media-card tv-focusable relative aspect-[2/3] overflow-hidden rounded-2xl bg-xf-surface-soft p-4 text-left"
      type="button"
      data-focused={focused ? 'true' : undefined}
      data-nav-id={focusKey}
      onClick={onEnterPress}
    >
      <div className="absolute inset-x-0 bottom-0 z-10 bg-black/75 p-4">
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