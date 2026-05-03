import { Play } from 'lucide-react';

export function App() {
  return (
    <main className="xf-app min-h-screen px-6 py-8">
      <section className="hero-gradient rounded-2xl min-h-[420px] flex items-center p-8">
        <div className="max-w-2xl">
          <p className="text-xf-red font-bold uppercase tracking-[0.3em]">
            Xandeflix
          </p>

          <h1 className="font-display text-5xl md:text-7xl font-black mt-4">
            Streaming premium para Mobile e TV
          </h1>

          <p className="text-xf-muted text-lg mt-4">
            Base limpa com React, Vite, Tailwind 4, Supabase, Capacitor e navegação por controle remoto.
          </p>

          <button
            className="tv-focusable mt-8 inline-flex items-center gap-3 rounded-lg bg-xf-red px-6 py-4 text-lg font-bold text-white"
            data-nav-id="hero-play-button"
          >
            <Play size={24} />
            Assistir agora
          </button>
        </div>
      </section>
    </main>
  );
}