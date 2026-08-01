import { FocusableMediaCard } from '../tv/FocusableMediaCard';
import type { LocalCatalogArtworkCandidate } from '@/features/localCatalog/services/localCatalogArtwork.service';

interface MediaCardProps {
  title: string;
  subtitle?: string;
  posterUrl?: string;
  artworkCandidates?: LocalCatalogArtworkCandidate[];
  kind?: 'movie' | 'series' | 'unknown';
  eagerLoad?: boolean;
  index: number;
  focusKey?: string;
  onEnterPress?: () => void;
  onArrowPress?: (direction: string) => boolean;
  focusScrollOptions?: ScrollIntoViewOptions;
  hideTextOverlay?: boolean;
  sizeScale?: 'default' | 'large';
  performanceSurface?: 'home' | 'movies' | 'series';
}

export function MediaCard({
  title,
  subtitle,
  posterUrl,
  artworkCandidates,
  kind,
  eagerLoad = false,
  index,
  focusKey,
  onEnterPress,
  onArrowPress,
  focusScrollOptions,
  hideTextOverlay = false,
  sizeScale = 'default',
  performanceSurface,
}: MediaCardProps) {
  return (
    <FocusableMediaCard
      title={title}
      subtitle={subtitle}
      posterUrl={posterUrl}
      artworkCandidates={artworkCandidates}
      kind={kind}
      eagerLoad={eagerLoad}
      focusKey={focusKey ?? `media-card-${index + 1}`}
      onEnterPress={onEnterPress}
      onArrowPress={onArrowPress}
      focusScrollOptions={focusScrollOptions}
      hideTextOverlay={hideTextOverlay}
      sizeScale={sizeScale}
      performanceSurface={performanceSurface}
    />
  );
}
