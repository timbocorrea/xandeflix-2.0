import { runArtworkHeroSmokeTest } from './artworkHeroSmokeTest.service';
import { runMovieHeroMetadataSmokeTest } from './movieHeroMetadataSmokeTest.service';
import { runMultiProviderCoverageClosureSmokeTest } from './multiProviderCoverageClosureSmokeTest.service';
import { runPreparingHomeReentrySmokeTest } from './preparingHomeReentrySmokeTest.service';
import { runSeriesMetadataResolverSmokeTest } from './seriesMetadataResolverSmokeTest.service';
import { runLocalCatalogSearchUxSmokeTest } from '@/features/localCatalog/services/localCatalogSearchUxSmokeTest.service';

export async function runU2f3SmokeTest() {
  const [resolver, artwork, movieHero, preparingHome, multiProviderCoverage, searchUx] =
    await Promise.all([
      runSeriesMetadataResolverSmokeTest(),
      runArtworkHeroSmokeTest(),
      runMovieHeroMetadataSmokeTest(),
      runPreparingHomeReentrySmokeTest(),
      runMultiProviderCoverageClosureSmokeTest(),
      Promise.resolve(runLocalCatalogSearchUxSmokeTest()),
    ]);

  return {
    pass:
      resolver.pass &&
      artwork.pass &&
      movieHero.pass &&
      preparingHome.pass &&
      multiProviderCoverage.pass &&
      searchUx.ok,
    resolver,
    artwork,
    movieHero,
    preparingHome,
    multiProviderCoverage,
    searchUx,
  };
}
