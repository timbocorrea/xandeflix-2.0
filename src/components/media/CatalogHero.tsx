import { Info, Play } from 'lucide-react';

import { spatialDebug } from '@/lib/spatial/spatialDebug';
import {
  getCatalogMediaTypeLabel,
  getCatalogRatingLabel,
  getCatalogYearLabel,
} from '@/features/catalog/lib/catalogVisuals';
import type { CatalogMediaType } from '@/features/catalog/types';

import { FOCUS_KEYS } from '../../lib/spatial/focusKeys';
import { HERO_SCROLL_OPTIONS } from '../../lib/spatial/focusNavigation';
import { FocusableButton } from '../tv/FocusableButton';
import { FocusableSection } from '../tv/FocusableSection';

type CatalogHeroStat = {
  label: string;
  value: string;
};

interface CatalogHeroProps {
  title?: string;
  description?: string;
  posterUrl?: string;
  backdropUrl?: string;
  year?: string | number;
  rating?: string | number;
  genres?: string[];
  mediaType?: CatalogMediaType;
  overview?: string;
  eyebrow?: string;
  stats?: CatalogHeroStat[];
  onSectionArrowPress?: (direction: string) => boolean;
  onPlayArrowPress?: (direction: string) => boolean;
  onInfoArrowPress?: (direction: string) => boolean;
}

export function CatalogHero({
  title = 'Sua noite comecou',
  description = 'Explore recomendacoes, retome o que voce ja assiste e navegue rapido com controle remoto em uma experiencia pensada para TV.',
  posterUrl,
  backdropUrl,
  year,
  rating,
  genres = [],
  mediaType,
  overview,
  eyebrow = 'Inicio',
  stats = [
    { label: 'Navegacao', value: 'D-pad otimizada' },
    { label: 'Atualizacao', value: 'Grade pronta' },
    { label: 'Performance', value: 'Fire Stick first' },
  ],
  onSectionArrowPress,
  onPlayArrowPress,
  onInfoArrowPress,
}: CatalogHeroProps) {
  function handlePlay() {
    spatialDebug('hero', 'Assistir agora:', title);
  }

  function handleMoreInfo() {
    spatialDebug('hero', 'Mais detalhes:', title);
  }

  const mediaTypeLabel = getCatalogMediaTypeLabel(mediaType);
  const yearLabel = getCatalogYearLabel(year);
  const ratingLabel = getCatalogRatingLabel(rating);
  const trimmedGenres = genres.filter(Boolean).slice(0, 2);
  const highlightTags = [
    mediaTypeLabel,
    yearLabel,
    ratingLabel,
    ...trimmedGenres,
  ].filter(Boolean) as string[];
  const heroBackgroundUrl = backdropUrl || posterUrl;
  const resolvedDescription = overview || description;

  return (
    <FocusableSection
      focusKey={FOCUS_KEYS.CATALOG_HERO_SECTION}
      focusScrollOptions={HERO_SCROLL_OPTIONS}
      onArrowPress={onSectionArrowPress}
      data-xf-hero="catalog"
      className="relative mb-10 box-border flex min-h-[34rem] w-full max-w-full min-w-0 overflow-hidden rounded-[2rem] border border-white/10 bg-black p-[var(--xf-shell-inline-padding)] shadow-[0_0_80px_rgba(0,0,0,0.55)] ring-0 ring-inset ring-transparent transition-[box-shadow,border-color] duration-200 data-[has-focused-child=true]:border-xf-red/50 data-[has-focused-child=true]:ring-2 data-[has-focused-child=true]:ring-inset data-[has-focused-child=true]:ring-xf-red"
    >
      {heroBackgroundUrl && (
        <img
          src={heroBackgroundUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-70 scale-[1.02]"
          loading="eager"
          decoding="async"
        />
      )}

      <div className="absolute inset-0 bg-gradient-to-r from-black via-black/55 to-black/10" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

      <div className="relative z-10 grid w-full gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(13rem,17rem)]">
        <div className="flex max-w-3xl flex-1 flex-col justify-end self-stretch pb-[clamp(0.5rem,1.2vh,1rem)]">
          <p className="mb-3 text-[clamp(0.625rem,0.84vw,0.8rem)] font-black uppercase tracking-[0.35em] text-xf-red">
            {eyebrow}
          </p>

          <h1 className="font-display text-[clamp(2.2rem,4.2vw,4.4rem)] font-black leading-[0.95] text-white">
            {title}
          </h1>

          {highlightTags.length > 0 ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {highlightTags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-white/20 bg-black/40 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-100"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}

          <p className="mt-4 max-w-2xl text-[clamp(0.8rem,1.15vw,1rem)] leading-[1.5] text-zinc-200">
            {resolvedDescription}
          </p>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <FocusableButton
              focusKey={FOCUS_KEYS.HERO_PLAY_BUTTON}
              focusScrollTarget="closest-section"
              focusScrollOptions={HERO_SCROLL_OPTIONS}
              className="inline-flex min-h-[calc(var(--xf-action-height)*0.72)] items-center justify-center gap-2 rounded-xl bg-xf-red px-[calc(var(--xf-action-inline-padding)*0.72)] text-[clamp(0.78rem,1.15vw,1rem)] font-black text-white"
              onEnterPress={handlePlay}
              onArrowPress={onPlayArrowPress}
            >
              <Play size={20} fill="white" />
              Assistir agora
            </FocusableButton>

            <FocusableButton
              focusKey={FOCUS_KEYS.HERO_INFO_BUTTON}
              focusScrollTarget="closest-section"
              focusScrollOptions={HERO_SCROLL_OPTIONS}
              className="inline-flex min-h-[calc(var(--xf-action-height)*0.72)] items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-[calc(var(--xf-action-inline-padding)*0.72)] text-[clamp(0.78rem,1.15vw,1rem)] font-black text-white"
              onEnterPress={handleMoreInfo}
              onArrowPress={onInfoArrowPress}
            >
              <Info size={20} />
              Mais detalhes
            </FocusableButton>
          </div>

          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.24em] text-zinc-400">
            Use a seta para baixo para navegar pelas secoes
          </p>
        </div>

        <div className="hidden rounded-2xl border border-white/10 bg-black/45 p-4 lg:block">
          <p className="text-[0.65rem] font-black uppercase tracking-[0.24em] text-xf-red">
            Panorama rapido
          </p>

          <p className="mt-3 line-clamp-4 text-sm leading-relaxed text-zinc-200">
            {resolvedDescription}
          </p>

          <div className="mt-4 space-y-3">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2"
              >
                <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                  {stat.label}
                </p>
                <p className="mt-1 text-sm font-black text-white">{stat.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </FocusableSection>
  );
}
