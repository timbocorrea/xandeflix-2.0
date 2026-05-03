import { AppShell } from '../../../components/layout/AppShell';
import { CatalogHero } from '../../../components/media/CatalogHero';
import { MediaCard } from '../../../components/media/MediaCard';
import { useDeviceType } from '../../../hooks/useDeviceType';
import { useAuth } from '../../../app/providers/AuthProvider';

const continueWatchingItems = [
  'Canal Ao Vivo',
  'Filme em Destaque',
  'Série Popular',
  'Documentário',
  'Infantil',
  'Esportes',
  'Notícias',
  'Ação',
  'Comédia',
  'Drama',
];

const liveChannels = [
  'Xande Cine',
  'Xande Séries',
  'Xande Kids',
  'Xande Sports',
  'Xande News',
  'Xande Hits',
  'Xande Premium',
  'Xande Brasil',
];

export function CatalogPage() {
  const { user, signOut } = useAuth();
  const { isTv, isMobile } = useDeviceType();

  const gridClassName = isTv
    ? 'grid-cols-5 xl:grid-cols-6'
    : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5';

  return (
    <AppShell userEmail={user?.email} onSignOut={() => void signOut()}>
      <CatalogHero />

      <section className="mb-12">
        <div className="mb-5 flex items-end justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.3em] text-xf-red">
              {isMobile ? 'Mobile' : isTv ? 'TV Mode' : 'Web'}
            </p>

            <h2 className="mt-1 text-2xl font-black text-white md:text-4xl">
              Continuar assistindo
            </h2>
          </div>

          <button
            className="tv-focusable hidden rounded-full bg-xf-surface px-5 py-3 text-sm font-bold text-white md:inline-flex"
            type="button"
            data-nav-id="continue-see-all"
          >
            Ver tudo
          </button>
        </div>

        <div className={`grid gap-4 md:gap-5 ${gridClassName}`}>
          {continueWatchingItems.map((title, index) => (
            <MediaCard
              key={title}
              title={title}
              subtitle="Retomar reprodução"
              index={index}
            />
          ))}
        </div>
      </section>

      <section>
        <div className="mb-5 flex items-end justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.3em] text-xf-red">
              Ao vivo
            </p>

            <h2 className="mt-1 text-2xl font-black text-white md:text-4xl">
              Canais em destaque
            </h2>
          </div>
        </div>

        <div className={`grid gap-4 md:gap-5 ${gridClassName}`}>
          {liveChannels.map((title, index) => (
            <MediaCard
              key={title}
              title={title}
              subtitle="Canal disponível"
              index={index + continueWatchingItems.length}
            />
          ))}
        </div>
      </section>
    </AppShell>
  );
}