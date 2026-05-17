import { useMemo } from 'react';
import { spatialDebug } from '@/lib/spatial/spatialDebug';
import type { CatalogSection } from '../features/catalog/types';
import {
  CARD_SCROLL_OPTIONS,
  focusFirstMediaCard,
  focusHeaderLogoutButton,
  focusHeaderSearchButton,
  focusHeroInfoButton,
  focusHeroPlayButton,
  focusSidebarSearch,
  setFocusAndScroll,
} from '../lib/spatial/focusNavigation';
import { getCategoryItemFocusKey } from '../lib/spatial/categoryFocusKeys';

interface UseCatalogGridNavigationParams {
  sections: CatalogSection[];
}

export function useCatalogGridNavigation({
  sections,
}: UseCatalogGridNavigationParams) {
  return useMemo(() => {
    function getPreviousNonEmptyCategoryIndex(categoryIndex: number) {
      for (let index = categoryIndex - 1; index >= 0; index -= 1) {
        if (sections[index]?.items.length) {
          return index;
        }
      }

      return -1;
    }

    function getNextNonEmptyCategoryIndex(categoryIndex: number) {
      for (let index = categoryIndex + 1; index < sections.length; index += 1) {
        if (sections[index]?.items.length) {
          return index;
        }
      }

      return -1;
    }

    function focusCategoryItemByIndexes(
      categoryIndex: number,
      itemIndex: number,
    ) {
      const section = sections[categoryIndex];

      if (!section || !section.items[itemIndex]) {
        return false;
      }

      const focusKey = getCategoryItemFocusKey(section.id, itemIndex);

      spatialDebug('catalog-grid', 'Focus carousel item', {
        categoryIndex,
        categoryId: section.id,
        itemIndex,
        focusKey,
      });

      return setFocusAndScroll({
        focusKey,
        scrollOptions: CARD_SCROLL_OPTIONS,
      });
    }

    function focusPreviousCategorySameIndex(
      categoryIndex: number,
      itemIndex: number,
    ) {
      const previousCategoryIndex =
        getPreviousNonEmptyCategoryIndex(categoryIndex);

      if (previousCategoryIndex < 0) {
        return focusHeroPlayButton();
      }

      const previousSection = sections[previousCategoryIndex];
      const targetItemIndex = Math.min(
        itemIndex,
        previousSection.items.length - 1,
      );

      return focusCategoryItemByIndexes(
        previousCategoryIndex,
        targetItemIndex,
      );
    }

    function focusNextCategorySameIndex(
      categoryIndex: number,
      itemIndex: number,
    ) {
      const nextCategoryIndex = getNextNonEmptyCategoryIndex(categoryIndex);

      if (nextCategoryIndex < 0) {
        return false;
      }

      const nextSection = sections[nextCategoryIndex];
      const targetItemIndex = Math.min(
        itemIndex,
        nextSection.items.length - 1,
      );

      return focusCategoryItemByIndexes(nextCategoryIndex, targetItemIndex);
    }
    function focusFirstAvailableMediaCard() {
      const firstCategoryIndex = getNextNonEmptyCategoryIndex(-1);

      if (firstCategoryIndex < 0) {
        return focusFirstMediaCard();
      }

      return focusCategoryItemByIndexes(firstCategoryIndex, 0);
    }

    function handleCategoryCardArrowPress(
      direction: string,
      categoryIndex: number,
      itemIndex: number,
    ) {
      const section = sections[categoryIndex];

      if (!section) {
        return true;
      }

      if (direction === 'up') {
        return focusPreviousCategorySameIndex(categoryIndex, itemIndex);
      }

      if (direction === 'down') {
        return focusNextCategorySameIndex(categoryIndex, itemIndex);
      }

      return true;
    }

    function handleCategorySectionArrowPress(
      direction: string,
      categoryIndex: number,
    ) {
      if (direction === 'up') {
        return focusPreviousCategorySameIndex(categoryIndex, 0);
      }

      if (direction === 'down') {
        const currentSection = sections[categoryIndex];

        if (currentSection?.items.length) {
          return focusCategoryItemByIndexes(categoryIndex, 0);
        }

        return focusNextCategorySameIndex(categoryIndex, 0);
      }

      return true;
    }

    function handleCategorySeeAllArrowPress(
      direction: string,
      categoryIndex: number,
    ) {
      if (direction === 'up') {
        return focusPreviousCategorySameIndex(categoryIndex, 0);
      }

      if (direction === 'down') {
        return focusCategoryItemByIndexes(categoryIndex, 0);
      }

      return true;
    }

    return {
      handleHeroSectionArrowPress(direction: string) {
        if (direction === 'down') {
          return focusFirstAvailableMediaCard();
        }

        return true;
      },

      handleHeroPlayArrowPress(direction: string) {
        if (direction === 'up') {
          return focusHeaderSearchButton();
        }

        if (direction === 'down') {
          return focusFirstAvailableMediaCard();
        }

        return true;
      },

      handleHeroInfoArrowPress(direction: string) {
        if (direction === 'up') {
          return focusHeaderLogoutButton();
        }

        if (direction === 'down') {
          return focusFirstAvailableMediaCard();
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

      handleCategorySectionArrowPress,
      handleCategorySeeAllArrowPress,
      handleCategoryCardArrowPress,
    };
  }, [sections]);
}
