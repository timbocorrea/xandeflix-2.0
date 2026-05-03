import { useEffect, type ReactNode } from 'react';
import {
  FocusContext,
  useFocusable,
} from '@noriginmedia/norigin-spatial-navigation';

interface FocusableSectionProps {
  focusKey: string;
  children: ReactNode;
  autoFocus?: boolean;
  className?: string;
}

export function FocusableSection({
  focusKey,
  children,
  autoFocus = false,
  className,
}: FocusableSectionProps) {
  const { ref, focusSelf } = useFocusable({
    focusKey,
    trackChildren: true,
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
      <section ref={ref} className={className}>
        {children}
      </section>
    </FocusContext.Provider>
  );
}