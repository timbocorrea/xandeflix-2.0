import { Info, Play } from 'lucide-react';
import { spatialDebug } from '@/lib/spatial/spatialDebug';
import { FocusableButton } from '../tv/FocusableButton';
import { FocusableSection } from '../tv/FocusableSection';
import { FOCUS_KEYS } from '../../lib/spatial/focusKeys';
import { HERO_SCROLL_OPTIONS } from '../../lib/spatial/focusNavigation';

interface CatalogHeroProps {
  title?: string;
  description?: string;
  posterUrl?: string;
  eyebrow?: string;
  onSectionArrowPress?: (direction: string) => boolean;
  onPlayArrowPress?: (direction: string) => boolean;
  onInfoArrowPress?: (direction: string) => boolean;
}

export function CatalogHero({
  title = 'Xandeflix 2.0',
  description = 'Base premium preparada para streaming em Android Mobile, Android TV, Tizen, webOS e navegador. Interface otimizada para toque e controle remoto.',
  posterUrl,
  eyebrow = 'Destaque',
  onSectionArrowPress,
  onPlayArrowPress,
  onInfoArrowPress,
}: CatalogHeroProps) {
  function handlePlay() {
    spatialDebug('hero', 'Assistir agora:', title);
  }

  function handleMoreInfo() {
    spatialDebug('hero', 'Mais informações:', title);
  }

  return (
    <FocusableSection
      focusKey={FOCUS_KEYS.CATALOG_HERO_SECTION}
      focusScrollOptions={HERO_SCROLL_OPTIONS}
      onArrowPress={onSectionArrowPress}
      data-xf-hero="catalog"
      className="relative mb-8 box-border flex w-full max-w-full min-w-0 overflow-hidden rounded-2xl bg-xf-surface p-[var(--xf-shell-inline-padding)] ring-0 ring-inset ring-transparent transition-[box-shadow] duration-150 data-[has-focused-child=true]:ring-2 data-[has-focused-child=true]:ring-inset data-[has-focused-child=true]:ring-xf-red"
    >
      {posterUrl && (
        <img
          src={posterUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-35"
          loading="eager"
          decoding="async"
        />
      )}

      <div className="absolute inset-0 bg-gradient-to-r from-black via-black/75 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-br from-xf-red/20 via-transparent to-transparent" />

      <div className="relative z-10 flex max-w-2xl flex-1 flex-col justify-end self-stretch pb-[clamp(0.5rem,1.2vh,1rem)]">
        <p className="mb-3 text-[clamp(0.625rem,0.84vw,0.8rem)] font-black uppercase tracking-[0.35em] text-xf-red">
          {eyebrow}
        </p>

        <h1 className="font-display text-[clamp(2.1rem,3.78vw,4rem)] font-black leading-none text-white">
          {title}
        </h1>

        <p className="mt-4 max-w-xl text-[clamp(0.75rem,1.1vw,0.96rem)] leading-[1.45] text-xf-muted">
          {description}
        </p>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <FocusableButton
            focusKey={FOCUS_KEYS.HERO_PLAY_BUTTON}
            focusScrollTarget="closest-section"
            focusScrollOptions={HERO_SCROLL_OPTIONS}
            className="inline-flex min-h-[calc(var(--xf-action-height)*0.7)] items-center justify-center gap-2 rounded-xl bg-xf-red px-[calc(var(--xf-action-inline-padding)*0.7)] text-[clamp(0.75rem,1.12vw,0.96rem)] font-black text-white"
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
            className="inline-flex min-h-[calc(var(--xf-action-height)*0.7)] items-center justify-center gap-2 rounded-xl bg-white/10 px-[calc(var(--xf-action-inline-padding)*0.7)] text-[clamp(0.75rem,1.12vw,0.96rem)] font-black text-white"
            onEnterPress={handleMoreInfo}
            onArrowPress={onInfoArrowPress}
          >
            <Info size={20} />
            Mais informações
          </FocusableButton>
        </div>
      </div>
    </FocusableSection>
  );
}
