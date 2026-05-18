import { Info, Play } from 'lucide-react';

import { spatialDebug } from '@/lib/spatial/spatialDebug';
import { cn } from '@/utils/cn';

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
  eyebrow?: string;
  stats?: CatalogHeroStat[];
  onSectionArrowPress?: (direction: string) => boolean;
  onPlayArrowPress?: (direction: string) => boolean;
  onInfoArrowPress?: (direction: string) => boolean;
  isCompactTvHero?: boolean;
}

export function CatalogHero({
  title = 'Sua noite comecou',
  description = 'Explore recomendacoes, retome o que voce ja assiste e navegue rapido com controle remoto em uma experiencia pensada para TV.',
  posterUrl,
  eyebrow = 'Inicio',
  stats = [
    { label: 'Navegacao', value: 'D-pad otimizada' },
    { label: 'Atualizacao', value: 'Grade pronta' },
    { label: 'Performance', value: 'Fire Stick first' },
  ],
  onSectionArrowPress,
  onPlayArrowPress,
  onInfoArrowPress,
  isCompactTvHero = false,
}: CatalogHeroProps) {
  function handlePlay() {
    spatialDebug('hero', 'Assistir agora:', title);
  }

  function handleMoreInfo() {
    spatialDebug('hero', 'Mais detalhes:', title);
  }

  return (
    <FocusableSection
      focusKey={FOCUS_KEYS.CATALOG_HERO_SECTION}
      focusScrollOptions={HERO_SCROLL_OPTIONS}
      onArrowPress={onSectionArrowPress}
      data-xf-hero="catalog"
      data-compact-tv-hero={isCompactTvHero ? 'true' : undefined}
      style={
        isCompactTvHero
          ? { height: 'clamp(22rem, 46vh, 24rem)' }
          : undefined
      }
      className={cn(
        'relative mb-7 box-border flex min-h-[21rem] w-full max-w-full min-w-0 overflow-hidden rounded-xl border border-white/10 bg-black px-5 py-6 ring-0 ring-inset ring-transparent transition-[box-shadow,border-color] duration-200 data-[has-focused-child=true]:border-white/25 data-[has-focused-child=true]:ring-1 data-[has-focused-child=true]:ring-inset data-[has-focused-child=true]:ring-white/60 md:min-h-[24rem] md:px-7 md:py-7 lg:min-h-[28rem] xl:min-h-[31rem]',
        isCompactTvHero &&
          'min-h-[17rem] md:min-h-[18rem] md:py-5 lg:min-h-[19rem] xl:min-h-[20rem]',
      )}
    >
      {posterUrl && (
        <img
          src={posterUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-70"
          loading="eager"
          decoding="async"
        />
      )}

      <div className="absolute inset-0 bg-gradient-to-r from-black via-black/70 to-black/10" />
      <div className="absolute inset-0 bg-gradient-to-br from-xf-red/25 via-transparent to-transparent" />

      <div className="relative z-10 grid w-full gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(13rem,17rem)]">
        <div className="flex max-w-3xl flex-1 flex-col justify-end self-stretch pb-[clamp(0.5rem,1.2vh,1rem)]">
          <p
            data-xf-hero-eyebrow="true"
            className="mb-3 text-[clamp(0.625rem,0.84vw,0.8rem)] font-black uppercase tracking-[0.35em] text-xf-red"
          >
            {eyebrow}
          </p>

          <h1
            data-xf-hero-title="true"
            className="font-display text-[clamp(2.2rem,4.2vw,4.4rem)] font-black leading-[0.95] text-white"
          >
            {title}
          </h1>

          <p
            data-xf-hero-description="true"
            className="mt-4 max-w-2xl text-[clamp(0.8rem,1.15vw,1rem)] leading-[1.5] text-zinc-200"
          >
            {description}
          </p>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <FocusableButton
              focusKey={FOCUS_KEYS.HERO_PLAY_BUTTON}
              focusScrollTarget="closest-section"
              focusScrollOptions={HERO_SCROLL_OPTIONS}
              className="inline-flex min-h-[calc(var(--xf-action-height)*0.5)] items-center justify-center gap-1.5 rounded-lg bg-xf-red px-[calc(var(--xf-action-inline-padding)*0.5)] text-[clamp(0.68rem,0.9vw,0.82rem)] font-black text-white"
              onEnterPress={handlePlay}
              onArrowPress={onPlayArrowPress}
            >
              <Play size={16} fill="white" />
              Assistir agora
            </FocusableButton>

            <FocusableButton
              focusKey={FOCUS_KEYS.HERO_INFO_BUTTON}
              focusScrollTarget="closest-section"
              focusScrollOptions={HERO_SCROLL_OPTIONS}
              className="inline-flex min-h-[calc(var(--xf-action-height)*0.5)] items-center justify-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-[calc(var(--xf-action-inline-padding)*0.5)] text-[clamp(0.68rem,0.9vw,0.82rem)] font-black text-white"
              onEnterPress={handleMoreInfo}
              onArrowPress={onInfoArrowPress}
            >
              <Info size={16} />
              Mais detalhes
            </FocusableButton>
          </div>
        </div>

        <div className="hidden">
          <p className="text-[0.65rem] font-black uppercase tracking-[0.24em] text-xf-red">
            Panorama rapido
          </p>

          <div className="mt-3 space-y-3">
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
