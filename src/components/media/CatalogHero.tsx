import { Info, Play } from 'lucide-react';

import { spatialDebug } from '@/lib/spatial/spatialDebug';
import { cn } from '@/utils/cn';

import { FOCUS_KEYS } from '../../lib/spatial/focusKeys';
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
      onArrowPress={onSectionArrowPress}
      data-xf-hero="catalog"
      data-compact-tv-hero={isCompactTvHero ? 'true' : undefined}
      style={
        isCompactTvHero
          ? { height: 'clamp(18.75rem, 41vh, 22rem)' }
          : undefined
      }
      className={cn(
        'relative mb-6 box-border flex min-h-[18.75rem] w-full max-w-full min-w-0 overflow-hidden rounded-lg border border-white/10 bg-black px-5 py-5 ring-0 ring-inset ring-transparent  data-[has-focused-child=true]:border-white/30 data-[has-focused-child=true]:border-white/30 md:min-h-[22rem] md:px-7 md:py-6 lg:min-h-[25.5rem] xl:min-h-[28.5rem]',
        isCompactTvHero &&
          'min-h-[16.5rem] md:min-h-[17.5rem] md:py-4 lg:min-h-[18.5rem] xl:min-h-[19.5rem]',
      )}
    >
      {posterUrl && (
        <img
          src={posterUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-75"
          loading="eager"
          decoding="async"
        />
      )}

      <div className="absolute inset-0 bg-gradient-to-r from-black via-black/50 to-black/10" />
      <div className="absolute inset-0 bg-gradient-to-br from-xf-red/14 via-transparent to-transparent" />

      <div className="relative z-10 grid w-full gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(12rem,15rem)]">
        <div className="flex max-w-[54rem] flex-1 flex-col justify-end self-stretch pb-[clamp(0.35rem,0.9vh,0.85rem)]">
          <p
            data-xf-hero-eyebrow="true"
            className="mb-3 text-[clamp(0.625rem,0.84vw,0.8rem)] font-black uppercase tracking-[0.35em] text-xf-red"
          >
            {eyebrow}
          </p>

          <h1
            data-xf-hero-title="true"
            className="font-display text-[clamp(2rem,3.75vw,4.05rem)] font-black leading-[0.94] text-white drop-shadow-[0_3px_18px_rgba(0,0,0,0.72)]"
          >
            {title}
          </h1>

          <p
            data-xf-hero-description="true"
            className="mt-3 max-w-2xl text-[clamp(0.78rem,1.02vw,0.96rem)] leading-[1.45] text-zinc-200"
          >
            {description}
          </p>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <FocusableButton
              focusKey={FOCUS_KEYS.HERO_PLAY_BUTTON}
              focusScrollTarget="closest-section"
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
