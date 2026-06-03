import { FocusableMediaCard } from '../tv/FocusableMediaCard';

interface MediaCardProps {
  title: string;
  subtitle?: string;
  posterUrl?: string;
  eagerLoad?: boolean;
  index: number;
  focusKey?: string;
  onEnterPress?: () => void;
  onArrowPress?: (direction: string) => boolean;
  focusScrollOptions?: ScrollIntoViewOptions;
  hideTextOverlay?: boolean;
  sizeScale?: 'default' | 'large';
}

export function MediaCard({
  title,
  subtitle,
  posterUrl,
  eagerLoad = false,
  index,
  focusKey,
  onEnterPress,
  onArrowPress,
  focusScrollOptions,
  hideTextOverlay = false,
  sizeScale = 'default',
}: MediaCardProps) {
  return (
    <FocusableMediaCard
      title={title}
      subtitle={subtitle}
      posterUrl={posterUrl}
      eagerLoad={eagerLoad}
      focusKey={focusKey ?? `media-card-${index + 1}`}
      onEnterPress={onEnterPress}
      onArrowPress={onArrowPress}
      focusScrollOptions={focusScrollOptions}
      hideTextOverlay={hideTextOverlay}
      sizeScale={sizeScale}
    />
  );
}
