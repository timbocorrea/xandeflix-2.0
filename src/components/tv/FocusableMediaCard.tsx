import { useMemo, useState } from 'react';
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';

import { rememberLastCatalogFocusKey } from '@/lib/spatial/focusNavigation';

interface FocusableMediaCardProps {
  title: string;
  subtitle?: string;
  posterUrl?: string;
  eagerLoad?: boolean;
  focusKey: string;
  onEnterPress?: () => void;
  onArrowPress?: (direction: string) => boolean;
  focusScrollOptions?: ScrollIntoViewOptions;
}

type CardPalette = {
  background: string;
  accent: string;
};

const CARD_RADIUS = '0.12rem';

const CARD_PALETTES: CardPalette[] = [
  { background: '#141414', accent: '#e50914' },
  { background: '#111827', accent: '#f97316' },
  { background: '#18181b', accent: '#38bdf8' },
  { background: '#0f172a', accent: '#a855f7' },
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
  eagerLoad = false,
  focusKey,
  onEnterPress,
  onArrowPress,
  focusScrollOptions,
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

      ref.current?.scrollIntoView(
        focusScrollOptions ?? {
          behavior: 'auto',
          block: 'nearest',
          inline: 'nearest',
        },
      );
    },
  });

  return (
    <button
      ref={ref}
      className="media-card tv-focusable group relative aspect-[2/3] w-[8.65rem] shrink-0 overflow-hidden rounded-[0.12rem] border border-transparent bg-[#141414] text-left shadow-none outline-none transition-[border-color,box-shadow,filter] duration-100 data-[focused=true]:z-10 data-[focused=true]:border-[#e50914] data-[focused=true]:ring-2 data-[focused=true]:ring-inset data-[focused=true]:ring-[#e50914] data-[focused=true]:shadow-none md:w-[9.85rem] lg:w-[10.85rem] xl:w-[11.65rem]"
      style={
        shouldShowPoster
          ? { borderRadius: CARD_RADIUS }
          : {
              borderRadius: CARD_RADIUS,
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
          style={{ borderRadius: 'inherit' }}
          loading={eagerLoad ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={eagerLoad ? 'high' : 'auto'}
          onError={() => setHasPosterError(true)}
        />
      ) : (
        <div
          className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-black"
          style={{ borderRadius: 'inherit' }}
        />
      )}

      <div
        className="absolute inset-0 bg-gradient-to-t from-black/62 via-black/5 to-transparent opacity-0 transition-opacity duration-150 group-data-[focused=true]:opacity-100"
        style={{ borderRadius: 'inherit' }}
      />
    </button>
  );
}
