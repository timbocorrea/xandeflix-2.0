import { useRef, type InputHTMLAttributes } from 'react';
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';

import { cn } from '../../utils/cn';

interface FocusableInputProps extends InputHTMLAttributes<HTMLInputElement> {
  focusKey: string;
  label: string;
}

export function FocusableInput({
  focusKey,
  label,
  className,
  ...props
}: FocusableInputProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const { ref, focused } = useFocusable({
    focusKey,
    onEnterPress: () => {
      inputRef.current?.focus();
    },
  });

  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-xf-muted">
        {label}
      </span>

      <div
        ref={ref}
        className={cn(
          'tv-focusable rounded-lg',
          focused && 'outline outline-4 outline-offset-2 outline-xf-red',
        )}
        data-focused={focused ? 'true' : undefined}
        data-nav-id={focusKey}
      >
        <input
          ref={inputRef}
          className={cn(
            'w-full rounded-lg bg-black px-4 py-4 text-white outline-none',
            className,
          )}
          {...props}
        />
      </div>
    </label>
  );
}