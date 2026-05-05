import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { FocusableButton } from '@/components/tv/FocusableButton';
import {
  hasConfiguredTestPlaylistUrl,
  loadTestPlaylist,
} from '../lib/loadTestPlaylist';
import type {
  IptvChannel,
  PlaylistDiagnostics,
} from '../types/playlist';

const MAX_VISIBLE_CHANNELS = 40;

export default function TestPlaylistPage() {
  const navigate = useNavigate();

  const [channels, setChannels] = useState<IptvChannel[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadStatus, setLoadStatus] = useState('Aguardando clique.');
  const [diagnostics, setDiagnostics] = useState<PlaylistDiagnostics | null>(
    null,
  );

  const isPlaylistConfigured = hasConfiguredTestPlaylistUrl();

  const filteredChannels = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    if (!normalizedSearch) {
      return channels.slice(0, MAX_VISIBLE_CHANNELS);
    }

    return channels
      .filter((channel) =>
        [channel.name, channel.groupTitle, channel.tvgName]
          .filter(Boolean)
          .some((value) => value?.toLowerCase().includes(normalizedSearch)),
      )
      .slice(0, MAX_VISIBLE_CHANNELS);
  }, [channels, searchTerm]);

  const handleLoadPlaylist = useCallback(async () => {
    setLoadStatus('Clique recebido. Tentando carregar playlist...');
    setIsLoading(true);
    setLoadError(null);
    setChannels([]);
    setDiagnostics(null);

    try {
      const playlist = await loadTestPlaylist();

      setChannels(playlist.channels);
      setDiagnostics(playlist.diagnostics);
      setLoadStatus(`Playlist carregada. Canais encontrados: ${playlist.total}.`);

      if (playlist.total === 0) {
        setLoadError(
          'A playlist foi carregada, mas nenhum canal válido foi encontrado. Verifique o diagnóstico abaixo.',
        );
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Erro desconhecido ao carregar playlist.';

      setLoadError(message);
      setLoadStatus(`Falha ao carregar playlist: ${message}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleOpenChannel = useCallback(
    (channel: IptvChannel) => {
      const params = new URLSearchParams({
        src: channel.url,
        title: channel.name,
      });

      navigate(`/player?${params.toString()}`);
    },
    [navigate],
  );

  return (
    <main className="xf-app min-h-screen bg-black px-8 py-8 text-white">
      <div className="mx-auto max-w-6xl rounded-3xl border border-white/10 bg-zinc-950 p-8">
        <p className="text-sm font-bold uppercase tracking-[0.4em] text-xf-red">
          Xandeflix IPTV Test
        </p>

        <h1 className="mt-4 text-4xl font-black">
          Playlist IPTV de teste
        </h1>

        <p className="mt-4 max-w-3xl text-lg text-xf-muted">
          Esta tela carrega a playlist M3U configurada no .env.local e permite
          escolher um canal real para abrir no Player Universal.
        </p>

        <section className="mt-8 rounded-2xl border border-white/10 bg-black/60 p-6">
          <p className="text-sm font-bold uppercase text-xf-muted">
            Status da playlist
          </p>

          <div className="mt-4 grid gap-3 text-base">
            <p>
              URL configurada:{' '}
              <strong
                className={
                  isPlaylistConfigured ? 'text-emerald-300' : 'text-yellow-300'
                }
              >
                {isPlaylistConfigured ? 'sim' : 'não'}
              </strong>
            </p>

            <p>
              Canais carregados:{' '}
              <strong className="text-white">{channels.length}</strong>
            </p>

            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm font-bold uppercase text-xf-muted">
                Diagnóstico
              </p>
              <p className="mt-2 text-white">{loadStatus}</p>

              {diagnostics ? (
                <dl className="mt-4 grid gap-2 text-sm">
                  <div>
                    <dt className="text-xf-muted">Tamanho do conteúdo</dt>
                    <dd className="font-bold text-white">
                      {diagnostics.contentLength} caracteres
                    </dd>
                  </div>

                  <div>
                    <dt className="text-xf-muted">Linhas não vazias</dt>
                    <dd className="font-bold text-white">
                      {diagnostics.totalLines}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-xf-muted">Começa com #EXTM3U</dt>
                    <dd className="font-bold text-white">
                      {diagnostics.startsWithExtM3u ? 'sim' : 'não'}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-xf-muted">Linhas #EXTINF</dt>
                    <dd className="font-bold text-white">
                      {diagnostics.extinfLines}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-xf-muted">Linhas de URL reproduzível</dt>
                    <dd className="font-bold text-white">
                      {diagnostics.playableUrlLines}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-xf-muted">Primeira linha recebida</dt>
                    <dd className="break-all font-mono text-xs text-white">
                      {diagnostics.firstNonEmptyLine || 'vazia'}
                    </dd>
                  </div>
                </dl>
              ) : null}
            </div>

            {loadError ? (
              <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4 text-yellow-100">
                <p className="font-black">Falha ao carregar playlist.</p>
                <p className="mt-2">{loadError}</p>
              </div>
            ) : null}
          </div>

          <div className="mt-6 flex flex-wrap gap-4">
            <FocusableButton
              focusKey="playlist-load-button"
              className="rounded-xl bg-xf-red px-6 py-4 text-lg font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!isPlaylistConfigured || isLoading}
              onEnterPress={() => {
                void handleLoadPlaylist();
              }}
              onClick={() => {
                void handleLoadPlaylist();
              }}
            >
              {isLoading ? 'Carregando...' : 'Carregar lista'}
            </FocusableButton>

            <FocusableButton
              focusKey="playlist-back-button"
              className="rounded-xl bg-white px-6 py-4 text-lg font-black text-black"
              onEnterPress={() => navigate('/player')}
              onClick={() => navigate('/player')}
            >
              Voltar ao Player
            </FocusableButton>
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-white/10 bg-black/60 p-6">
          <label className="block text-sm font-bold uppercase text-xf-muted">
            Filtrar canais
          </label>

          <input
            className="mt-3 w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-white outline-none focus:border-xf-red"
            placeholder="Digite parte do nome do canal..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />

          <div className="mt-6 grid gap-3">
            {filteredChannels.length > 0 ? (
              filteredChannels.map((channel, index) => (
                <FocusableButton
                  key={`${channel.id}-${channel.url}`}
                  focusKey={`playlist-channel-${index}`}
                  className="rounded-xl border border-white/10 bg-white/5 px-5 py-4 text-left text-white hover:bg-white/10"
                  focusScrollTarget="closest-section"
                  onEnterPress={() => handleOpenChannel(channel)}
                  onClick={() => handleOpenChannel(channel)}
                >
                  <span className="block text-lg font-black">
                    {channel.name}
                  </span>

                  <span className="mt-1 block text-sm text-xf-muted">
                    {channel.groupTitle || 'Sem grupo'} · abrir no player
                  </span>
                </FocusableButton>
              ))
            ) : (
              <p className="text-xf-muted">
                Nenhum canal carregado ou nenhum resultado encontrado.
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
