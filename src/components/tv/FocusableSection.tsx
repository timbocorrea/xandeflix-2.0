import { useEffect, type HTMLAttributes, type ReactNode } from 'react';
import {
  FocusContext,
  useFocusable,
} from '@noriginmedia/norigin-spatial-navigation';

interface FocusableSectionProps
  extends Omit<HTMLAttributes<HTMLElement>, 'onFocus'> {
  focusKey: string;
  children: ReactNode;
  autoFocus?: boolean;
  onArrowPress?: (direction: string) => boolean;
  focusScrollOptions?: ScrollIntoViewOptions;
}

export function FocusableSection({
  focusKey,
  children,
  autoFocus = false,
  className,
  onArrowPress,
  focusScrollOptions,
  ...sectionProps
}: FocusableSectionProps) {
  const { ref, focusSelf, focused, hasFocusedChild } = useFocusable({
    focusKey,
    trackChildren: true,
    onArrowPress,
    onFocus: () => {
      if (!focusScrollOptions) {
        return;
      }

      ref.current?.scrollIntoView(focusScrollOptions);
    },
  });

  useEffect(() => {
    if (!autoFocus) {
      return;
    }

    const timer = window.setTimeout(() => {
      focusSelf();
    }, 80);

    return () => {
      window.clearTimeout(timer);
    };
  }, [autoFocus, focusSelf]);

  return (
    <FocusContext.Provider value={focusKey}>
      <section
        {...sectionProps}
        ref={ref}
        className={className}
        data-nav-id={focusKey}
        data-focused={focused ? 'true' : undefined}
        data-has-focused-child={hasFocusedChild ? 'true' : undefined}
      >
        {children}
      </section>
    </FocusContext.Provider>
  );
}
