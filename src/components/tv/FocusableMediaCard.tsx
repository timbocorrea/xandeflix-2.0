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
        inline: 'center',
      });
    },
  });

  return (
    <button
      ref={ref}
      className="media-card tv-focusable group relative aspect-[2/3] w-[8.9rem] shrink-0 overflow-hidden rounded-md bg-[#141414] text-left shadow-none outline-none transition-[transform,box-shadow,filter] duration-200 data-[focused=true]:z-20 data-[focused=true]:scale-[1.07] data-[focused=true]:shadow-[0_0_0_3px_rgba(255,255,255,0.92),0_18px_42px_rgba(0,0,0,0.72)] md:w-[10.2rem] lg:w-[11.2rem] xl:w-[12rem]"
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
        <div className="absolute inset-0 flex items-end bg-gradient-to-br from-white/10 via-transparent to-black px-3 pb-4">
          <p className="line-clamp-4 text-lg font-black leading-tight text-white">
            {title}
          </p>
        </div>
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent opacity-0 transition-opacity duration-200 group-data-[focused=true]:opacity-100" />

      <div className="absolute inset-x-0 bottom-0 z-10 translate-y-4 px-3 pb-3 opacity-0 transition-all duration-200 group-data-[focused=true]:translate-y-0 group-data-[focused=true]:opacity-100">
        <p className="line-clamp-1 text-sm font-black leading-tight text-white">
          {title}
        </p>

        {subtitle ? (
          <p className="mt-1 line-clamp-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-zinc-300">
            {subtitle}
          </p>
        ) : null}
      </div>
    </button>
  );
}
