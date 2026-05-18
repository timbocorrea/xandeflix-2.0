import { useMemo } from 'react';
import { spatialDebug } from '@/lib/spatial/spatialDebug';
import type { CatalogSection } from '../features/catalog/data/catalogSections';
import {
  CARD_SCROLL_OPTIONS,
  focusFirstMediaCard,
  focusHeaderLogoutButton,
  focusHeaderSearchButton,
  focusHeroInfoButton,
  focusHeroPlayButton,
  focusSidebarSearch,
  getElementByFocusKey,
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

    function getCategoryItemHorizontalCenter(
      categoryIndex: number,
      itemIndex: number,
    ) {
      const section = sections[categoryIndex];

      if (!section || !section.items[itemIndex]) {
        return null;
      }

      const focusKey = getCategoryItemFocusKey(section.id, itemIndex);
      const element = getElementByFocusKey(focusKey);

      if (!element) {
        return null;
      }

      const rect = element.getBoundingClientRect();

      return rect.left + rect.width / 2;
    }

    function getClosestCategoryItemIndexByHorizontalCenter(
      categoryIndex: number,
      horizontalCenter: number | null,
    ) {
      const section = sections[categoryIndex];

      if (!section?.items.length) {
        return -1;
      }

      if (horizontalCenter === null) {
        return 0;
      }

      let closestItemIndex = 0;
      let closestDistance = Number.POSITIVE_INFINITY;

      section.items.forEach((_, candidateItemIndex) => {
        const focusKey = getCategoryItemFocusKey(
          section.id,
          candidateItemIndex,
        );
        const element = getElementByFocusKey(focusKey);

        if (!element) {
          return;
        }

        const rect = element.getBoundingClientRect();

        if (rect.width <= 0 || rect.height <= 0) {
          return;
        }

        const candidateCenter = rect.left + rect.width / 2;
        const distance = Math.abs(candidateCenter - horizontalCenter);

        if (distance < closestDistance) {
          closestDistance = distance;
          closestItemIndex = candidateItemIndex;
        }
      });

      return closestItemIndex;
    }

    function focusPreviousCategoryNearestColumn(
      categoryIndex: number,
      itemIndex: number,
    ) {
      const previousCategoryIndex =
        getPreviousNonEmptyCategoryIndex(categoryIndex);

      if (previousCategoryIndex < 0) {
        return focusHeroPlayButton();
      }

      const targetItemIndex = getClosestCategoryItemIndexByHorizontalCenter(
        previousCategoryIndex,
        getCategoryItemHorizontalCenter(categoryIndex, itemIndex),
      );

      return focusCategoryItemByIndexes(
        previousCategoryIndex,
        targetItemIndex,
      );
    }

    function focusNextCategoryNearestColumn(
      categoryIndex: number,
      itemIndex: number,
    ) {
      const nextCategoryIndex = getNextNonEmptyCategoryIndex(categoryIndex);

      if (nextCategoryIndex < 0) {
        return false;
      }

      const targetItemIndex = getClosestCategoryItemIndexByHorizontalCenter(
        nextCategoryIndex,
        getCategoryItemHorizontalCenter(categoryIndex, itemIndex),
      );

      return focusCategoryItemByIndexes(nextCategoryIndex, targetItemIndex);
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
        return focusPreviousCategoryNearestColumn(categoryIndex, itemIndex);
      }

      if (direction === 'down') {
        return focusNextCategoryNearestColumn(categoryIndex, itemIndex);
      }

      return true;
    }

    function handleCategorySectionArrowPress(
      direction: string,
      categoryIndex: number,
    ) {
      if (direction === 'up') {
        return focusPreviousCategoryNearestColumn(categoryIndex, 0);
      }

      if (direction === 'down') {
        const currentSection = sections[categoryIndex];

        if (currentSection?.items.length) {
          return focusCategoryItemByIndexes(categoryIndex, 0);
        }

        return focusNextCategoryNearestColumn(categoryIndex, 0);
      }

      return true;
    }

    function handleCategorySeeAllArrowPress(
      direction: string,
      categoryIndex: number,
    ) {
      if (direction === 'up') {
        return focusPreviousCategoryNearestColumn(categoryIndex, 0);
      }

      if (direction === 'down') {
        return focusCategoryItemByIndexes(categoryIndex, 0);
      }

      return true;
    }

    return {
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
          return focusHeaderLogoutButton();
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

      handleCategorySectionArrowPress,
      handleCategorySeeAllArrowPress,
      handleCategoryCardArrowPress,
    };
  }, [sections]);
}
