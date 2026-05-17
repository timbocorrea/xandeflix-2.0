import { useMemo, useState } from 'react';
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';

import { rememberLastCatalogFocusKey } from '@/lib/spatial/focusNavigation';

import type { CatalogMediaType } from '@/features/catalog/types';

interface FocusableMediaCardProps {
  title: string;
  subtitle?: string;
  posterUrl?: string;
  year?: string | number;
  rating?: string | number;
  genres?: string[];
  mediaType?: CatalogMediaType;
  focusKey: string;
  onEnterPress?: () => void;
  onArrowPress?: (direction: string) => boolean;
}

type CardPalette = {
  background: string;
  accent: string;
};

const CARD_PALETTES: CardPalette[] = [
  { background: '#0f172a', accent: '#dc2626' },
  { background: '#111827', accent: '#f97316' },
  { background: '#172554', accent: '#ef4444' },
  { background: '#1f2937', accent: '#fb7185' },
  { background: '#18181b', accent: '#f59e0b' },
  { background: '#0b1324', accent: '#e11d48' },
];

function getFallbackPalette(title: string) {
  const seed = Array.from(title).reduce((accumulator, character) => {
    return accumulator + character.charCodeAt(0);
  }, 0);

  return CARD_PALETTES[seed % CARD_PALETTES.length];
}

export function FocusableMediaCard({
  title,
  posterUrl,
  focusKey,
  onEnterPress,
  onArrowPress,
}: FocusableMediaCardProps) {
  const [hasPosterError, setHasPosterError] = useState(false);
  const shouldShowPoster = Boolean(posterUrl) && !hasPosterError;

  const fallbackPalette = useMemo(() => getFallbackPalette(title), [title]);
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
        block: 'nearest',
        inline: 'nearest',
      });
    },
  });

  return (
    <button
      ref={ref}
      className="media-card tv-focusable group relative aspect-[2/3] overflow-hidden rounded-[1.4rem] border border-white/10 bg-black text-left transition-[border-color,box-shadow,opacity] duration-100"
      style={
        shouldShowPoster
          ? undefined
          : {
              backgroundImage: `linear-gradient(165deg, ${fallbackPalette.accent}22 0%, ${fallbackPalette.background} 46%, #050505 100%)`,
            }
      }
      type="button"
      data-focused={focused ? 'true' : undefined}
      data-nav-id={focusKey}
      onClick={onEnterPress}
    >
      {shouldShowPoster && (
        <img
          src={posterUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-data-[focused=true]:scale-[1.04]"
          loading="lazy"
          decoding="async"
          onError={() => setHasPosterError(true)}
        />
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" />

      {!shouldShowPoster ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center px-4 text-center">
          <div className="h-16 w-10 rounded-md border border-white/15 bg-white/10" />
        </div>
      ) : null}
    </button>
  );
}
