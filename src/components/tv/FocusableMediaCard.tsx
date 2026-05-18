import { useMemo, useState } from 'react';
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

type CardPalette = {
  background: string;
  accent: string;
};

const CARD_PALETTES: CardPalette[] = [
  { background: '#111111', accent: '#dc2626' },
  { background: '#141414', accent: '#ef4444' },
  { background: '#181818', accent: '#f97316' },
  { background: '#101010', accent: '#e11d48' },
  { background: '#171717', accent: '#f59e0b' },
  { background: '#0b0b0b', accent: '#b91c1c' },
];

function getFallbackPalette(title: string) {
  const seed = Array.from(title).reduce((accumulator, character) => {
    return accumulator + character.charCodeAt(0);
  }, 0);

  return CARD_PALETTES[seed % CARD_PALETTES.length];
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
      className="media-card tv-focusable group relative aspect-[2/3] w-[8.9rem] shrink-0 overflow-hidden rounded-md bg-[#141414] text-left shadow-none outline-none transition-[box-shadow,filter,border-color] duration-150 data-[focused=true]:z-10 data-[focused=true]:ring-1 data-[focused=true]:ring-white/80 data-[focused=true]:shadow-[0_8px_20px_rgba(0,0,0,0.42)] md:w-[10.2rem] lg:w-[11.2rem] xl:w-[12rem]"
      style={
        shouldShowPoster
          ? undefined
          : {
              backgroundImage: `linear-gradient(165deg, ${fallbackPalette.accent}33 0%, ${fallbackPalette.background} 48%, #050505 100%)`,
            }
      }
      type="button"
      data-focused={focused ? 'true' : undefined}
      data-nav-id={focusKey}
      onClick={onEnterPress}
      aria-label={subtitle ? `${title}. ${subtitle}` : title}
    >
      {shouldShowPoster ? (
        <img
          src={posterUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          onError={() => setHasPosterError(true)}
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-black" />
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent opacity-0 transition-opacity duration-200 group-data-[focused=true]:opacity-100" />
    </button>
  );
}
