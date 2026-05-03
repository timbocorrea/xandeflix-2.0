import { useMemo } from 'react';

import {
  focusContinueWatchingCardAbove,
  focusFirstMediaCard,
  focusHeaderProfileButton,
  focusHeaderSearchButton,
  focusHeroInfoButton,
  focusHeroPlayButton,
  focusLastContinueWatchingRow,
  focusSidebarSearch,
} from '../lib/spatial/focusNavigation';

interface UseCatalogSpatialNavigationParams {
  columnsPerRow: number;
  continueWatchingItemsLength: number;
}

export function useCatalogSpatialNavigation({
  columnsPerRow,
  continueWatchingItemsLength,
}: UseCatalogSpatialNavigationParams) {
  return useMemo(() => {
    const firstRowLimit = columnsPerRow;

    return {
      firstRowLimit,

      handleHeroSectionArrowPress(direction: string) {
        if (direction === 'down') {
          return focusFirstMediaCard();
        }

        return true;
      },

      handleHeroPlayArrowPress(direction: string) {
        if (direction === 'up') {
          return focusHeaderSearchButton();
        }

        if (direction === 'down') {
          return focusFirstMediaCard();
        }

        return true;
      },

      handleHeroInfoArrowPress(direction: string) {
        if (direction === 'up') {
          return focusHeaderProfileButton();
        }

        if (direction === 'down') {
          return focusFirstMediaCard();
        }

        return true;
      },

      handleHeaderSearchArrowPress(direction: string) {
        if (direction === 'left') {
          return focusSidebarSearch();
        }

        if (direction === 'down') {
          return focusHeroPlayButton();
        }

        return true;
      },

      handleHeaderProfileArrowPress(direction: string) {
        if (direction === 'down') {
          return focusHeroInfoButton();
        }

        return true;
      },

      handleHeaderLogoutArrowPress(direction: string) {
        if (direction === 'down') {
          return focusHeroInfoButton();
        }

        return true;
      },

      handleContinueWatchingSectionArrowPress(direction: string) {
        if (direction === 'up') {
          return focusHeroPlayButton();
        }

        return true;
      },

      handleContinueSeeAllArrowPress(direction: string) {
        if (direction === 'up') {
          return focusHeroPlayButton();
        }

        return true;
      },

      handleContinueWatchingCardArrowPress(direction: string, index: number) {
        if (direction === 'up' && index < firstRowLimit) {
          return focusHeroPlayButton();
        }

        return true;
      },

      handleLiveChannelsSectionArrowPress(direction: string) {
        if (direction === 'up') {
          return focusLastContinueWatchingRow({
            columnsPerRow,
            continueWatchingItemsLength,
          });
        }

        return true;
      },

      handleLiveChannelCardArrowPress(direction: string, index: number) {
        if (direction === 'up') {
          return focusContinueWatchingCardAbove({
            liveChannelIndex: index,
            columnsPerRow,
            continueWatchingItemsLength,
          });
        }

        return true;
      },
    };
  }, [columnsPerRow, continueWatchingItemsLength]);
}