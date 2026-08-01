import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export const HERO_ROTATION_INTERVAL_MS = 10_000;
const HERO_INTERACTION_PAUSE_MS = 5_000;

export function getNextHeroIndex(currentIndex: number, poolSize: number) {
  return poolSize > 0 ? (currentIndex + 1) % poolSize : 0;
}

export function useAutoRotatingHero(input: {
  poolIds: readonly string[];
  heroSelector: string;
  intervalMs?: number;
}) {
  const intervalMs = input.intervalMs ?? HERO_ROTATION_INTERVAL_MS;
  const poolKey = useMemo(() => input.poolIds.join('|'), [input.poolIds]);
  const [rawIndex, setRawIndex] = useState(0);
  const [schedulingVersion, setSchedulingVersion] = useState(0);
  const pausedUntilRef = useRef(0);
  const poolSize = input.poolIds.length;
  const activeIndex = poolSize > 0 ? rawIndex % poolSize : 0;

  useEffect(() => {
    setRawIndex(0);
  }, [poolKey]);

  const pauseForInteraction = useCallback(() => {
    pausedUntilRef.current = Date.now() + HERO_INTERACTION_PAUSE_MS;
    setSchedulingVersion((version) => version + 1);
  }, []);

  useEffect(() => {
    const hero = document.querySelector(input.heroSelector);

    if (!hero) {
      return;
    }

    hero.addEventListener('pointerdown', pauseForInteraction);
    hero.addEventListener('keydown', pauseForInteraction);
    hero.addEventListener('focusin', pauseForInteraction);

    return () => {
      hero.removeEventListener('pointerdown', pauseForInteraction);
      hero.removeEventListener('keydown', pauseForInteraction);
      hero.removeEventListener('focusin', pauseForInteraction);
    };
  }, [input.heroSelector, pauseForInteraction, poolKey]);

  useEffect(() => {
    if (poolSize <= 1) {
      return;
    }

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let canceled = false;
    let timerId: number | null = null;

    const schedule = (delayMs: number) => {
      timerId = window.setTimeout(() => {
        if (canceled) {
          return;
        }

        const remainingPause = pausedUntilRef.current - Date.now();

        if (
          document.visibilityState !== 'visible' ||
          reducedMotion.matches ||
          remainingPause > 0
        ) {
          schedule(Math.max(250, Math.min(intervalMs, remainingPause || 500)));
          return;
        }

        setRawIndex((currentIndex) => getNextHeroIndex(currentIndex, poolSize));
      }, delayMs);
    };

    const handleVisibilityOrMotionChange = () => {
      if (timerId !== null) {
        window.clearTimeout(timerId);
      }
      schedule(intervalMs);
    };

    reducedMotion.addEventListener?.('change', handleVisibilityOrMotionChange);
    document.addEventListener('visibilitychange', handleVisibilityOrMotionChange);
    schedule(intervalMs);

    return () => {
      canceled = true;
      if (timerId !== null) {
        window.clearTimeout(timerId);
      }
      reducedMotion.removeEventListener?.('change', handleVisibilityOrMotionChange);
      document.removeEventListener(
        'visibilitychange',
        handleVisibilityOrMotionChange,
      );
    };
  }, [
    activeIndex,
    input.heroSelector,
    intervalMs,
    poolKey,
    poolSize,
    schedulingVersion,
  ]);

  const previous = useCallback(() => {
    pauseForInteraction();
    setRawIndex((currentIndex) =>
      poolSize > 0 ? (currentIndex - 1 + poolSize) % poolSize : 0,
    );
  }, [pauseForInteraction, poolSize]);

  const next = useCallback(() => {
    pauseForInteraction();
    setRawIndex((currentIndex) =>
      getNextHeroIndex(currentIndex, poolSize),
    );
  }, [pauseForInteraction, poolSize]);

  return {
    activeIndex,
    previous,
    next,
    pauseForInteraction,
  };
}
