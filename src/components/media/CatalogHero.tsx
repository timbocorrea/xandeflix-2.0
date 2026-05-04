import { Info, Play } from 'lucide-react';
import { spatialDebug } from '@/lib/spatial/spatialDebug';
import { FocusableButton } from '../tv/FocusableButton';
import { FocusableSection } from '../tv/FocusableSection';
import { FOCUS_KEYS } from '../../lib/spatial/focusKeys';
import { HERO_SCROLL_OPTIONS } from '../../lib/spatial/focusNavigation';

interface CatalogHeroProps {
  onSectionArrowPress?: (direction: string) => boolean;
  onPlayArrowPress?: (direction: string) => boolean;
  onInfoArrowPress?: (direction: string) => boolean;
}

export function CatalogHero({
  onSectionArrowPress,
  onPlayArrowPress,
  onInfoArrowPress,
}: CatalogHeroProps) {
  function handlePlay() {
    spatialDebug('hero', 'Assistir agora');
  }

  function handleMoreInfo() {
    spatialDebug('hero', 'Mais informações');
  }

  return (
    <FocusableSection
      focusKey={FOCUS_KEYS.CATALOG_HERO_SECTION}
      focusScrollOptions={HERO_SCROLL_OPTIONS}
      onArrowPress={onSectionArrowPress}
      className="relative mb-8 flex min-h-[420px] overflow-hidden rounded-2xl bg-xf-surface p-6 ring-0 ring-inset ring-transparent transition-[box-shadow] duration-150 data-[has-focused-child=true]:ring-2 data-[has-focused-child=true]:ring-inset data-[has-focused-child=true]:ring-xf-red md:p-8 lg:min-h-[480px]"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-xf-red/10 via-transparent to-transparent" />

      <div className="relative z-10 flex max-w-3xl flex-col justify-center">
        <p className="mb-4 text-sm font-black uppercase tracking-[0.4em] text-xf-red">
          Destaque
        </p>

        <h1 className="font-display text-5xl font-black leading-none text-white md:text-6xl lg:text-7xl">
          Xandeflix 2.0
        </h1>

        <p className="mt-6 max-w-2xl text-base leading-7 text-xf-muted md:text-xl md:leading-8">
          Base premium preparada para streaming em Android Mobile, Android TV,
          Tizen, webOS e navegador. Interface otimizada para toque e controle
          remoto.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <FocusableButton
            focusKey={FOCUS_KEYS.HERO_PLAY_BUTTON}
            focusScrollTarget="closest-section"
            focusScrollOptions={HERO_SCROLL_OPTIONS}
            className="inline-flex items-center justify-center gap-3 rounded-xl bg-xf-red px-7 py-4 text-lg font-black text-white"
            onEnterPress={handlePlay}
            onArrowPress={onPlayArrowPress}
          >
            <Play size={24} fill="white" />
            Assistir agora
          </FocusableButton>

          <FocusableButton
            focusKey={FOCUS_KEYS.HERO_INFO_BUTTON}
            focusScrollTarget="closest-section"
            focusScrollOptions={HERO_SCROLL_OPTIONS}
            className="inline-flex items-center justify-center gap-3 rounded-xl bg-white/10 px-7 py-4 text-lg font-black text-white"
            onEnterPress={handleMoreInfo}
            onArrowPress={onInfoArrowPress}
          >
            <Info size={24} />
            Mais informações
          </FocusableButton>
        </div>
      </div>
    </FocusableSection>
  );
}