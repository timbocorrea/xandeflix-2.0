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


            /* XF_MOBILE_NETFLIX_HERO_SAFE_PATCH */
            .xf-app[data-device-form-factor="mobile"] [data-xf-hero="catalog"] {
              width: calc(100vw - 28px);
              height: min(72vh, 620px) !important;
              min-height: min(72vh, 620px) !important;
              aspect-ratio: 9 / 14 !important;
              margin-left: auto;
              margin-right: auto;
              padding: 1rem;
              border-radius: 16px;
            }

            .xf-app[data-device-form-factor="mobile"] [data-xf-hero-content="true"] {
              display: flex;
              height: 100%;
              align-items: flex-end;
            }

            .xf-app[data-device-form-factor="mobile"] [data-xf-hero-radial-backdrop="true"] {
              background:
                radial-gradient(circle at 50% 88%, rgba(0, 0, 0, 0.82) 0%, rgba(0, 0, 0, 0.48) 34%, rgba(0, 0, 0, 0) 68%),
                linear-gradient(to top, rgba(0, 0, 0, 0.88) 0%, rgba(0, 0, 0, 0.62) 22%, rgba(0, 0, 0, 0.28) 48%, rgba(0, 0, 0, 0) 72%);
            }

            .xf-app[data-device-form-factor="mobile"] [data-xf-hero-copy="true"] {
              width: 100%;
              max-width: 100%;
              align-items: center;
              text-align: center;
              transform: none !important;
              transform-origin: center bottom !important;
              padding-bottom: 0.25rem;
            }

            .xf-app[data-device-form-factor="mobile"] [data-xf-hero-eyebrow="true"] {
              margin-bottom: 0.35rem;
              font-size: 0.72rem;
              letter-spacing: 0.26em;
            }

            .xf-app[data-device-form-factor="mobile"] [data-xf-hero-title="true"] {
              max-width: 100%;
              font-size: clamp(1.75rem, 8.5vw, 3.1rem);
              line-height: 0.9;
              text-align: center;
            }

            .xf-app[data-device-form-factor="mobile"] [data-xf-hero-metadata="true"] {
              margin-top: 0.5rem;
              max-width: 100%;
              font-size: 0.72rem;
              line-height: 1.25;
              text-align: center;
              letter-spacing: 0.06em;
              max-height: 1.1rem;
              overflow: hidden;
              white-space: nowrap;
              text-overflow: ellipsis;
            }

            .xf-app[data-device-form-factor="mobile"] [data-xf-hero-description="true"] {
              display: none !important;
            }

            .xf-app[data-device-form-factor="mobile"] [data-xf-hero-actions="true"] {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 0.6rem;
              width: 100%;
              margin-top: 0.9rem;
            }

            .xf-app[data-device-form-factor="mobile"] [data-xf-hero-actions="true"] button {
              min-height: 48px;
              border-radius: 0.28rem;
              font-size: 0.95rem;
            }

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


      <div data-xf-hero-content="true" className="relative z-10 grid w-full gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(12rem,15rem)]">
        <div
          data-xf-hero-copy="true" className="flex max-w-[54rem] flex-1 flex-col justify-end self-stretch pb-[clamp(0.35rem,0.9vh,0.85rem)]"
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

          <div data-xf-hero-actions="true" className="mt-3 flex flex-col gap-3 sm:flex-row sm:gap-4">
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
