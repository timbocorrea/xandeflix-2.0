import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { FocusableButton } from '@/components/tv/FocusableButton';
import { prepareUniversalPlayerSource } from '../lib/playerFactory';

export default function UniversalPlayerPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const streamUrl = searchParams.get('src') ?? '';
  const title = searchParams.get('title') ?? 'Conteúdo Xandeflix';

  const preparation = useMemo(() => {
    return prepareUniversalPlayerSource({
      url: streamUrl,
      title,
    });
  }, [streamUrl, title]);

  const stream = preparation.ok ? preparation.stream : preparation.stream;
  const error = preparation.ok ? null : preparation.error;

  return (
    <main className="xf-app min-h-screen bg-black px-8 py-8 text-white">
      <div className="mx-auto flex min-h-[80vh] max-w-5xl flex-col justify-between rounded-3xl border border-white/10 bg-zinc-950 p-8">
        <section>
          <p className="text-sm font-bold uppercase tracking-[0.4em] text-xf-red">
            Xandeflix Player
          </p>

          <h1 className="mt-4 text-4xl font-black">
            Player Universal
          </h1>

          <p className="mt-4 max-w-3xl text-lg text-xf-muted">
            Rota isolada e carregada sob demanda. O contrato do player já
            prepara a fonte sem carregar bibliotecas pesadas no boot.
          </p>

          <div className="mt-8 rounded-2xl border border-white/10 bg-black/60 p-6">
            <p className="text-sm font-bold uppercase text-xf-muted">
              Estado da preparação
            </p>

            {preparation.ok ? (
              <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                <p className="text-lg font-black text-emerald-200">
                  Fonte preparada para reprodução.
                </p>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4">
                <p className="text-lg font-black text-yellow-200">
                  {error?.message}
                </p>

                <p className="mt-2 text-sm text-yellow-100/80">
                  Código: {error?.code}
                </p>
              </div>
            )}

            <dl className="mt-6 grid gap-3 text-base">
              <div>
                <dt className="text-xf-muted">Título</dt>
                <dd className="font-bold text-white">{title}</dd>
              </div>

              <div>
                <dt className="text-xf-muted">Tipo detectado</dt>
                <dd className="font-bold text-white">
                  {stream?.kind ?? 'não identificado'}
                </dd>
              </div>

              <div>
                <dt className="text-xf-muted">Extensão</dt>
                <dd className="font-bold text-white">
                  {stream?.extension ?? 'não identificada'}
                </dd>
              </div>

              <div>
                <dt className="text-xf-muted">URL</dt>
                <dd className="break-all font-mono text-sm text-white/80">
                  {streamUrl || 'nenhuma URL informada'}
                </dd>
              </div>
            </dl>
          </div>
        </section>

        <nav className="mt-8 flex gap-4">
          <FocusableButton
            focusKey="player-back-button"
            className="rounded-xl bg-white px-6 py-4 text-lg font-black text-black"
            onEnterPress={() => navigate('/')}
          >
            Voltar ao catálogo
          </FocusableButton>

          <FocusableButton
            focusKey="player-play-button"
            className="rounded-xl bg-xf-red px-6 py-4 text-lg font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!preparation.ok}
            onEnterPress={() => undefined}
          >
            Preparar reprodução
          </FocusableButton>
        </nav>
      </div>
    </main>
  );
}
