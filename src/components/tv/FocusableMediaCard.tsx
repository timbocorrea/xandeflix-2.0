import { useState } from 'react';
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';

import { rememberLastCatalogFocusKey } from '@/lib/spatial/focusNavigation';

interface FocusableMediaCardProps {
  title: string;
  subtitle?: string;
  posterUrl?: string;
  focusKey: string;
  onEnterPress?: () => void;
  onArrowPress?: (direction: string) => boolean;
}

export function FocusableMediaCard({
  title,
  subtitle,
  posterUrl,
  focusKey,
  onEnterPress,
  onArrowPress,
}: FocusableMediaCardProps) {
  const [hasPosterError, setHasPosterError] = useState(false);
  const shouldShowPoster = Boolean(posterUrl) && !hasPosterError;

  const { ref, focused } = useFocusable({
    focusKey,
    onEnterPress,
    onArrowPress,
    onFocus: () => {
      if (focusKey.startsWith('catalog-section-')) {
        rememberLastCatalogFocusKey(focusKey);
      }

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
      {shouldShowPoster && (
        <img
          src={posterUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          onError={() => setHasPosterError(true)}
        />
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/35 to-transparent" />

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
