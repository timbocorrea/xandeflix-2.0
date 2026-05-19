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
  metadata?: string;
  posterUrl?: string;
  eyebrow?: string;
  stats?: CatalogHeroStat[];
  onSectionArrowPress?: (direction: string) => boolean;
  onPlayArrowPress?: (direction: string) => boolean;
  onInfoArrowPress?: (direction: string) => boolean;
  isCompactTvHero?: boolean;
  heroIndex?: number;
  heroTotal?: number;
  onPreviousHeroItem?: () => void;
  onNextHeroItem?: () => void;
}

export function CatalogHero({
  title = 'Sua noite comecou',
  description = 'Explore recomendacoes, retome o que voce ja assiste e navegue rapido com controle remoto em uma experiencia pensada para TV.',
  metadata,
  posterUrl,
  eyebrow,
  stats = [
    { label: 'Navegacao', value: 'D-pad otimizada' },
    { label: 'Atualizacao', value: 'Grade pronta' },
    { label: 'Performance', value: 'Fire Stick first' },
  ],
  onSectionArrowPress,
  onPlayArrowPress,
  onInfoArrowPress,
  isCompactTvHero = false,
  heroIndex = 0,
  heroTotal = 0,
  onPreviousHeroItem,
  onNextHeroItem,
}: CatalogHeroProps) {
  function handlePlay() {
    spatialDebug('hero', 'Assistir agora:', title);
  }

  function handleMoreInfo() {
    spatialDebug('hero', 'Mais informações:', title);
  }

  function handleHeroButtonArrowPress(
    direction: string,
    buttonPosition: 'play' | 'info',
    fallbackArrowPress?: (direction: string) => boolean,
  ) {
    if (heroTotal > 1 && buttonPosition === 'play' && direction === 'left') {
      onPreviousHeroItem?.();
      return false;
    }

    if (heroTotal > 1 && buttonPosition === 'info' && direction === 'right') {
      onNextHeroItem?.();
      return false;
    }

    return fallbackArrowPress?.(direction) ?? true;
  }

  return (
    <FocusableSection
      focusKey={FOCUS_KEYS.CATALOG_HERO_SECTION}
      onArrowPress={onSectionArrowPress}
      data-xf-hero="catalog"
      data-compact-tv-hero={isCompactTvHero ? 'true' : undefined}
      style={
        posterUrl
          ? {
              aspectRatio: '16 / 7',
              height: 'auto',
              minHeight: isCompactTvHero ? 'auto' : undefined,
            }
          : isCompactTvHero
            ? { height: 'clamp(18.75rem, 41vh, 22rem)' }
            : undefined
      }
      className={cn(
        'relative mb-6 box-border flex min-h-[18.75rem] w-full max-w-full min-w-0 overflow-hidden rounded-lg border border-white/10 bg-black px-5 py-5 ring-0 ring-inset ring-transparent  data-[has-focused-child=true]:border-white/30 data-[has-focused-child=true]:border-white/30 md:min-h-[22rem] md:px-7 md:py-6 lg:min-h-[25.5rem] xl:min-h-[28.5rem]',
        isCompactTvHero &&
          'min-h-[16.5rem] md:min-h-[17.5rem] md:py-4 lg:min-h-[18.5rem] xl:min-h-[19.5rem]',
      )}
    >
        <style>
          {`
            @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap');

            @keyframes xfHeroFadeIn {
              from {
                opacity: 0;
                transform: scale(1.012);
              }

              to {
                opacity: 1;
                transform: scale(1);
              }
            }
          `}
        </style>

      {posterUrl && (
        <img
          key={posterUrl}
          src={posterUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-100"
          style={{ animation: 'xfHeroFadeIn 560ms ease-out both' }}
          loading="eager"
          decoding="async"
        />
      )}
        <div
          data-xf-hero-radial-backdrop="true"
          className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(circle_at_18%_76%,rgba(0,0,0,0.78)_0%,rgba(0,0,0,0.58)_18%,rgba(0,0,0,0.36)_34%,rgba(0,0,0,0.16)_50%,rgba(0,0,0,0.06)_62%,rgba(0,0,0,0)_74%)]"
        />


      <div className="relative z-10 grid w-full gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(12rem,15rem)]">
        <div
          className="flex max-w-[54rem] flex-1 flex-col justify-end self-stretch pb-[clamp(0.35rem,0.9vh,0.85rem)]"
          style={{
            transform: 'scale(0.8)',
            transformOrigin: 'left bottom',
          }}
        >
          {eyebrow ? (
            <p
              data-xf-hero-eyebrow="true"
              className="mb-3 text-[clamp(0.625rem,0.84vw,0.8rem)] font-black uppercase tracking-[0.35em] text-xf-red"
            >
              {eyebrow}
            </p>
          ) : null}

          <h1
            key={`hero-title-${heroIndex}-${title}`}
            data-xf-hero-title="true"
            className="font-display text-[clamp(1.6rem,3vw,3.24rem)] font-black leading-[0.94] text-white"
            style={{
                fontFamily: "'Bebas Neue', 'Arial Narrow', sans-serif",
                letterSpacing: '0.035em',
                animation: 'xfHeroFadeIn 360ms ease-out both',
              }}
          >
            {title}
          </h1>

            {metadata ? (
              <p
                key={`hero-metadata-${heroIndex}-${metadata}`}
                data-xf-hero-metadata="true"
                className="mt-1.5 max-w-xl text-[clamp(0.5rem,0.66vw,0.62rem)] font-bold uppercase tracking-[0.16em] text-white/90"
                style={{
                  animation: 'xfHeroFadeIn 380ms ease-out both',
                }}
              >
                {metadata}
              </p>
            ) : null}

          <p
            key={`hero-description-${heroIndex}-${description}`}
            data-xf-hero-description="true"
            className="mt-2 max-w-xl text-[clamp(0.62rem,0.82vw,0.77rem)] leading-[1.45] text-zinc-200"
            style={{
              animation: 'xfHeroFadeIn 420ms ease-out both',
              display: '-webkit-box',
              WebkitBoxOrient: 'vertical',
              WebkitLineClamp: 3,
              overflow: 'hidden',
            }}
          >
            {description}
          </p>

          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:gap-4">
            <FocusableButton
              focusKey={FOCUS_KEYS.HERO_PLAY_BUTTON}
              focusScrollTarget="closest-section"
              className="inline-flex min-h-[calc(var(--xf-action-height)*0.58)] items-center justify-center gap-1.5 rounded-[0.22rem] border border-white/40 bg-white/10 px-[calc(var(--xf-action-inline-padding)*0.48)] text-[clamp(0.58rem,0.76vw,0.7rem)] font-black text-white backdrop-blur-md transition-[background-color,color,border-color] duration-100 data-[focused=true]:border-white data-[focused=true]:bg-white data-[focused=true]:text-black"
              onEnterPress={handlePlay}
              onArrowPress={(direction) =>
                  handleHeroButtonArrowPress(direction, 'play', onPlayArrowPress)
                }
            >
              <Play size={15} fill="currentColor" />
              Assistir agora
            </FocusableButton>

            <FocusableButton
              focusKey={FOCUS_KEYS.HERO_INFO_BUTTON}
              focusScrollTarget="closest-section"
              className="inline-flex min-h-[calc(var(--xf-action-height)*0.58)] items-center justify-center gap-1.5 rounded-[0.22rem] border border-white/40 bg-white/10 px-[calc(var(--xf-action-inline-padding)*0.48)] text-[clamp(0.58rem,0.76vw,0.7rem)] font-black text-white backdrop-blur-md transition-[background-color,color,border-color] duration-100 data-[focused=true]:border-white data-[focused=true]:bg-white data-[focused=true]:text-black"
              onEnterPress={handleMoreInfo}
              onArrowPress={(direction) =>
                  handleHeroButtonArrowPress(direction, 'info', onInfoArrowPress)
                }
            >
              <Info size={15} />
              Mais informações
            </FocusableButton>
          </div>

            {heroTotal > 1 ? (
              <div className="mt-2 flex items-center gap-1.5">
                {Array.from({ length: heroTotal }).map((_, index) => (
                  <span
                    key={`hero-indicator-${index}`}
                    className={cn(
                      'h-1.5 rounded-full bg-white/35 transition-[width,background-color] duration-150',
                      index === heroIndex ? 'w-7 bg-white' : 'w-2.5',
                    )}
                    aria-hidden="true"
                  />
                ))}

                <span className="ml-2 text-[0.5rem] font-bold uppercase tracking-[0.18em] text-white/80">
                  Use ← → no controle
                </span>
              </div>
            ) : null}
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
                <p className="text-[0.5rem] font-semibold uppercase tracking-[0.18em] text-zinc-400">
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
