import { Info, Play } from 'lucide-react';

export function CatalogHero() {
  return (
    <section className="hero-gradient relative mb-10 flex min-h-[520px] overflow-hidden rounded-3xl border border-white/5 bg-xf-surface p-6 md:p-10 lg:min-h-[620px]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgba(229,9,20,0.26),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.08),transparent_38%)]" />

      <div className="relative z-10 flex max-w-3xl flex-col justify-center">
        <p className="mb-4 text-sm font-black uppercase tracking-[0.4em] text-xf-red">
          Destaque
        </p>

        <h1 className="font-display text-5xl font-black leading-none text-white md:text-7xl lg:text-8xl">
          Xandeflix 2.0
        </h1>

        <p className="mt-6 max-w-2xl text-base leading-7 text-xf-muted md:text-xl md:leading-8">
          Base premium preparada para streaming em Android Mobile, Android TV,
          Tizen, webOS e navegador. Interface otimizada para toque e controle
          remoto.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <button
            className="tv-focusable inline-flex items-center justify-center gap-3 rounded-xl bg-xf-red px-7 py-4 text-lg font-black text-white"
            type="button"
            data-nav-id="hero-play-button"
          >
            <Play size={24} fill="white" />
            Assistir agora
          </button>

          <button
            className="tv-focusable inline-flex items-center justify-center gap-3 rounded-xl bg-white/10 px-7 py-4 text-lg font-black text-white"
            type="button"
            data-nav-id="hero-info-button"
          >
            <Info size={24} />
            Mais informações
          </button>
        </div>
      </div>
    </section>
  );
}