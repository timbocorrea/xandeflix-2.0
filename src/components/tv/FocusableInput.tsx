import { useCallback, useRef, type InputHTMLAttributes } from 'react';
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';

import { cn } from '../../utils/cn';

interface FocusableInputProps extends InputHTMLAttributes<HTMLInputElement> {
  focusKey: string;
  label: string;
  onEnterPress?: () => void;
  onArrowPress?: (direction: string) => boolean;
  selectTextOnEnter?: boolean;
}

export function FocusableInput({
  focusKey,
  label,
  className,
  onEnterPress,
  onArrowPress,
  selectTextOnEnter = false,
  ...props
}: FocusableInputProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const focusNativeInput = useCallback(() => {
    const input = inputRef.current;

    if (!input) {
      return;
    }

    input.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });

    input.focus({ preventScroll: true });

    if (selectTextOnEnter) {
      input.select();
    }
  }, [selectTextOnEnter]);

  const { ref, focused } = useFocusable({
    focusKey,
    onArrowPress,
    onEnterPress: () => {
      focusNativeInput();
      onEnterPress?.();
    },
    onFocus: () => {
      inputRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    },
  });

  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-xf-muted">
        {label}
      </span>

      <div
        ref={ref}
        className={cn('tv-focusable xf-focusable-input rounded-lg')}
        data-focused={focused ? 'true' : undefined}
        data-nav-id={focusKey}
      >
        <input
          ref={inputRef}
          className={cn(
            'w-full rounded-lg border border-white/10 bg-black px-4 py-4 text-white outline-none focus:border-xf-red',
            className,
          )}
          readOnly={props.readOnly}
          {...props}
        />
      </div>
    </label>
  );
}
