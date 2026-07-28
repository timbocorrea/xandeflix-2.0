import { runArtworkHeroSmokeTest } from './artworkHeroSmokeTest.service';
import { runMovieHeroMetadataSmokeTest } from './movieHeroMetadataSmokeTest.service';
import { runMultiProviderCoverageClosureSmokeTest } from './multiProviderCoverageClosureSmokeTest.service';
import { runPreparingHomeReentrySmokeTest } from './preparingHomeReentrySmokeTest.service';
import { runSeriesMetadataResolverSmokeTest } from './seriesMetadataResolverSmokeTest.service';

export async function runU2f3SmokeTest() {
  const [resolver, artwork, movieHero, preparingHome, multiProviderCoverage] =
    await Promise.all([
      runSeriesMetadataResolverSmokeTest(),
      runArtworkHeroSmokeTest(),
      runMovieHeroMetadataSmokeTest(),
      runPreparingHomeReentrySmokeTest(),
      runMultiProviderCoverageClosureSmokeTest(),
    ]);

  return {
    pass:
      resolver.pass &&
      artwork.pass &&
      movieHero.pass &&
      preparingHome.pass &&
      multiProviderCoverage.pass,
    resolver,
    artwork,
    movieHero,
    preparingHome,
    multiProviderCoverage,
  };
}
