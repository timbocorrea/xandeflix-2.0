import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';

import { cn } from '../../utils/cn';

interface FocusableButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  focusKey: string;
  children: ReactNode;
  onEnterPress?: () => void;
}

export function FocusableButton({
  focusKey,
  children,
  className,
  onClick,
  onEnterPress,
  ...props
}: FocusableButtonProps) {
  const { ref, focused } = useFocusable({
    focusKey,
    onEnterPress: () => {
      if (onEnterPress) {
        onEnterPress();
        return;
      }

      if (onClick) {
        const virtualEvent = {
          preventDefault: () => undefined,
          stopPropagation: () => undefined,
        } as React.MouseEvent<HTMLButtonElement>;

        onClick(virtualEvent);
      }
    },
  });

  return (
    <button
      ref={ref}
      className={cn('tv-focusable', className)}
      type="button"
      data-focused={focused ? 'true' : undefined}
      data-nav-id={focusKey}
      onClick={onClick}
      {...props}
    >
      {children}
    </button>
  );
}