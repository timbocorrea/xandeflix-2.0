import { FocusableMediaCard } from '../tv/FocusableMediaCard';

interface MediaCardProps {
  title: string;
  subtitle?: string;
  posterUrl?: string;
  index: number;
  focusKey?: string;
  onEnterPress?: () => void;
  onArrowPress?: (direction: string) => boolean;
}

export function MediaCard({
  title,
  subtitle,
  posterUrl,
  index,
  focusKey,
  onEnterPress,
  onArrowPress,
}: MediaCardProps) {
  return (
    <FocusableMediaCard
      title={title}
      subtitle={subtitle}
      posterUrl={posterUrl}
      focusKey={focusKey ?? `media-card-${index + 1}`}
      onEnterPress={onEnterPress}
      onArrowPress={onArrowPress}
    />
  );
}
