import { FocusableMediaCard } from '../tv/FocusableMediaCard';

interface MediaCardProps {
  title: string;
  subtitle?: string;
  index: number;
  onEnterPress?: () => void;
}

export function MediaCard({
  title,
  subtitle,
  index,
  onEnterPress,
}: MediaCardProps) {
  return (
    <FocusableMediaCard
      title={title}
      subtitle={subtitle}
      focusKey={`media-card-${index + 1}`}
      onEnterPress={onEnterPress}
    />
  );
}