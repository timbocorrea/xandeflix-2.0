import {
  useEffect,
  useCallback,
  useMemo,
  useState,
} from 'react';
import { setFocus } from '@noriginmedia/norigin-spatial-navigation';
import { useNavigate } from 'react-router-dom';

import { FocusableButton } from '@/components/tv/FocusableButton';
import { FocusableInput } from '@/components/tv/FocusableInput';
import { maskStreamUrl } from '@/lib/security/maskStreamUrl';
import { getOrCreateDeviceIdentifier } from '../lib/deviceIdentifier';
import {
  getAuthorizedIptvSource,
  mapAuthorizedIptvSourceToPlaylistSource,
} from '../services/authorizedIptvSource.service';
import { usePlaylistRuntime } from '../providers/PlaylistRuntimeProvider';
import type { IptvChannel } from '../types/playlist';

const MAX_VISIBLE_CHANNELS = 50;

const DIRECT_SOURCE_URL_INPUT_FOCUS_KEY = 'direct-source-url-input';
const DIRECT_SOURCE_LOAD_BUTTON_FOCUS_KEY = 'direct-source-load-button';
const DIRECT_SOURCE_AUTHORIZED_LOAD_BUTTON_FOCUS_KEY = 'direct-source-authorized-load-button';
const DIRECT_SOURCE_CLEAR_BUTTON_FOCUS_KEY = 'direct-source-clear-button';
const DIRECT_SOURCE_PLAYER_BUTTON_FOCUS_KEY = 'direct-source-player-button';
const DIRECT_SOURCE_FIRST_CHANNEL_FOCUS_KEY = 'direct-source-channel-0';

const DIRECT_SOURCE_INITIAL_FOCUS_KEY = DIRECT_SOURCE_URL_INPUT_FOCUS_KEY;

const DIRECT_SOURCE_FOCUS_RETRY_DELAYS_MS = [80, 180, 350, 700] as const;

const DIRECT_SOURCE_DPAD_DEBUG_ENABLED =
  (import.meta.env as Record<string, string | undefined>).VITE_SPATIAL_DEBUG ===
  'true';

function logDirectSourceDpadDebug(
  eventName: string,
  payload?: Record<string, unknown>,
) {
  if (!DIRECT_SOURCE_DPAD_DEBUG_ENABLED) {
    return;
  }

  if (import.meta.env.VITE_SPATIAL_DEBUG === 'true') console.error('XANDEFLIX_DPAD_TRACE [DirectSource]', eventName, {
    pathname: window.location.pathname,
    ...payload,
  });
}

function DirectSourcePlaylistContent() {
  const navigate = useNavigate();
  const {
    channels,
    selectedChannel,
    diagnostics,
    status,
    progress,
    error,
    loadFromSource,
    selectChannel,
    clearRuntime,
  } = usePlaylistRuntime();

  const [sourceUrl, setSourceUrl] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const maskedSourceUrl = useMemo(() => maskStreamUrl(sourceUrl), [sourceUrl]);
  const [lastProgressAt, setLastProgressAt] = useState<string | null>(null);
  const [authorizedLoadError, setAuthorizedLoadError] = useState<string | null>(null);

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

  const downloadPercent = useMemo(() => {
    if (!progress || !progress.bytesTotal || progress.bytesTotal <= 0) {
      return null;
    }

    const rawPercent = (progress.bytesReceived / progress.bytesTotal) * 100;
    const clampedPercent = Math.max(0, Math.min(100, rawPercent));
    return Math.round(clampedPercent);
  }, [progress]);

  const hasVisibleChannels = filteredChannels.length > 0;

  const handleLoad = useCallback(() => {
    void loadFromSource({
      url: sourceUrl,
      name: 'Lista IPTV direta',
    });
  }, [loadFromSource, sourceUrl]);

  const handleLoadAuthorizedSource = useCallback(() => {
    setAuthorizedLoadError(null);

    void (async () => {
      try {
        const deviceIdentifier = getOrCreateDeviceIdentifier();
        const authorizedSource = await getAuthorizedIptvSource(deviceIdentifier);
        const playlistSource = mapAuthorizedIptvSourceToPlaylistSource(authorizedSource);

        setSourceUrl(playlistSource.url);
        await loadFromSource(playlistSource);
      } catch (loadError) {
        setAuthorizedLoadError(
          loadError instanceof Error
            ? loadError.message
            : 'Não foi possível carregar a fonte IPTV autorizada.',
        );
      }
    })();
  }, [loadFromSource]);

  const handleUrlInputArrowPress = useCallback((direction: string) => {
    if (direction === 'down') {
      logDirectSourceDpadDebug('arrow override', {
        from: DIRECT_SOURCE_URL_INPUT_FOCUS_KEY,
        direction,
        to: DIRECT_SOURCE_LOAD_BUTTON_FOCUS_KEY,
      });

      setFocus(DIRECT_SOURCE_LOAD_BUTTON_FOCUS_KEY);
      return false;
    }

    return true;
  }, []);

  const handleTopButtonsArrowPress = useCallback(
    (direction: string) => {
      if (direction === 'up') {
        logDirectSourceDpadDebug('arrow override', {
          direction,
          to: DIRECT_SOURCE_URL_INPUT_FOCUS_KEY,
        });

        setFocus(DIRECT_SOURCE_URL_INPUT_FOCUS_KEY);
        return false;
      }

      if (direction === 'down') {
        if (!hasVisibleChannels) {
          logDirectSourceDpadDebug('arrow blocked', {
            direction,
            reason: 'no visible channels',
          });
          return false;
        }

        logDirectSourceDpadDebug('arrow override', {
          direction,
          to: DIRECT_SOURCE_FIRST_CHANNEL_FOCUS_KEY,
        });

        setFocus(DIRECT_SOURCE_FIRST_CHANNEL_FOCUS_KEY);
        return false;
      }

      return true;
    },
    [hasVisibleChannels],
  );

  const handleOpenChannel = useCallback(
    (channel: IptvChannel) => {
      selectChannel(channel);

      const params = new URLSearchParams({
        src: channel.url,
        title: channel.name,
      });

      navigate(`/player?${params.toString()}`);
    },
    [navigate, selectChannel],
  );

  const handleGoToPlayer = useCallback(() => {
    if (selectedChannel) {
      handleOpenChannel(selectedChannel);
      return;
    }

    if (filteredChannels.length > 0) {
      handleOpenChannel(filteredChannels[0]);
      return;
    }

    if (channels.length > 0) {
      handleOpenChannel(channels[0]);
      return;
    }

    // Sem canal carregado ainda: não há URL válida para abrir no player.
  }, [
    channels,
    filteredChannels,
    handleOpenChannel,
    selectedChannel,
  ]);

  useEffect(() => {
    if (status !== 'loading' || !progress) {
      return;
    }

    setLastProgressAt(new Date().toLocaleTimeString());
  }, [status, progress]);

  useEffect(() => {
    if (status === 'loading') {
      return;
    }

    setLastProgressAt(null);
  }, [status]);

  return (
    <main className="xf-app min-h-screen bg-black px-8 py-8 text-white">
      <div className="mx-auto max-w-6xl rounded-3xl border border-white/10 bg-zinc-950 p-8">
        <p className="text-sm font-bold uppercase tracking-[0.4em] text-xf-red">
          Xandeflix Direct Source IPTV
        </p>

        <h1 className="mt-4 text-4xl font-black">
          Lista IPTV direta da fonte
        </h1>

        <p className="mt-4 max-w-3xl text-lg text-xf-muted">
          O app carrega a lista informada pelo usuário em tempo de execução,
          mantém os canais em memória e envia apenas a URL final do canal para
          o Player Universal.
        </p>

        <section className="mt-8 rounded-2xl border border-white/10 bg-black/60 p-6">
          <FocusableInput
            focusKey={DIRECT_SOURCE_URL_INPUT_FOCUS_KEY}
            label="URL da lista IPTV"
            className="mt-1 rounded-xl px-4 py-3"
            selectTextOnEnter
            placeholder="Cole aqui a URL M3U/M3U Plus..."
            value={sourceUrl}
            onChange={(event) => setSourceUrl(event.target.value)}
            onArrowPress={handleUrlInputArrowPress}
          />

          {maskedSourceUrl ? (
            <p className="mt-3 break-all font-mono text-xs text-xf-muted">
              URL protegida para diagnóstico: {maskedSourceUrl}
            </p>
          ) : null}

          {authorizedLoadError ? (
            <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
              <p className="font-bold">Falha ao carregar fonte autorizada</p>
              <p className="mt-1">{authorizedLoadError}</p>
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-4">
            <FocusableButton
              focusKey={DIRECT_SOURCE_LOAD_BUTTON_FOCUS_KEY}
              className="rounded-xl bg-xf-red px-6 py-4 text-lg font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
              disabled={status === 'loading'}
              onEnterPress={handleLoad}
              onClick={handleLoad}
              onArrowPress={handleTopButtonsArrowPress}
            >
              {status === 'loading' ? 'Carregando...' : 'Carregar direto'}
            </FocusableButton>

            <FocusableButton
              focusKey={DIRECT_SOURCE_AUTHORIZED_LOAD_BUTTON_FOCUS_KEY}
              className="rounded-xl bg-white/10 px-6 py-4 text-lg font-black text-white"
              disabled={status === 'loading'}
              onEnterPress={handleLoadAuthorizedSource}
              onClick={handleLoadAuthorizedSource}
              onArrowPress={handleTopButtonsArrowPress}
            >
              {status === 'loading' ? 'Carregando...' : 'Carregar autorizado'}
            </FocusableButton>

            <FocusableButton
              focusKey={DIRECT_SOURCE_CLEAR_BUTTON_FOCUS_KEY}
              className="rounded-xl bg-white/10 px-6 py-4 text-lg font-black text-white"
              onEnterPress={clearRuntime}
              onClick={clearRuntime}
              onArrowPress={handleTopButtonsArrowPress}
            >
              Limpar memória
            </FocusableButton>

            <FocusableButton
              focusKey={DIRECT_SOURCE_PLAYER_BUTTON_FOCUS_KEY}
              className="rounded-xl bg-white px-6 py-4 text-lg font-black text-black"
              disabled={channels.length === 0}
              onEnterPress={handleGoToPlayer}
              onClick={handleGoToPlayer}
              onArrowPress={handleTopButtonsArrowPress}
            >
              Ir ao Player
            </FocusableButton>
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-white/10 bg-black/60 p-6">
          <p className="text-sm font-bold uppercase text-xf-muted">
            Runtime
          </p>

          <div className="mt-4 grid gap-3 text-base">
            <p>
              Status:{' '}
              <strong className="text-white">{status}</strong>
            </p>

            <p>
              Canais em memória:{' '}
              <strong className="text-white">{channels.length}</strong>
            </p>

            {progress ? (
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm">
                <p>
                  Fase:{' '}
                  <strong className="text-white">
                    {progress.phase}
                  </strong>
                </p>

                <p className="mt-1">
                  Linhas processadas:{' '}
                  <strong className="text-white">
                    {progress.parsedLines}
                  </strong>
                </p>

                <p className="mt-1">
                  Canais processados:{' '}
                  <strong className="text-white">
                    {progress.channelsParsed}
                  </strong>
                </p>

                <p className="mt-1">
                  Download:{' '}
                  <strong className="text-white">
                    {progress.bytesReceived}
                    {progress.bytesTotal !== null
                      ? ` / ${progress.bytesTotal} bytes`
                      : ' bytes'}
                  </strong>
                </p>

                {downloadPercent !== null ? (
                  <p className="mt-1">
                    Progresso do download:{' '}
                    <strong className="text-white">{downloadPercent}%</strong>
                  </p>
                ) : null}

                {lastProgressAt ? (
                  <p className="mt-1 text-xf-muted">
                    Última atualização: {lastProgressAt}
                  </p>
                ) : null}
              </div>
            ) : null}

            {error ? (
              <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4 text-yellow-100">
                <p className="font-black">Aviso</p>
                <p className="mt-2">{error}</p>
              </div>
            ) : null}

            {diagnostics ? (
              <dl className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm">
                <div>
                  <dt className="text-xf-muted">Começa com #EXTM3U</dt>
                  <dd className="font-bold text-white">
                    {diagnostics.startsWithExtM3u ? 'sim' : 'não'}
                  </dd>
                </div>

                <div className="mt-2">
                  <dt className="text-xf-muted">Linhas #EXTINF</dt>
                  <dd className="font-bold text-white">
                    {diagnostics.extinfLines}
                  </dd>
                </div>

                <div className="mt-2">
                  <dt className="text-xf-muted">URLs reproduzíveis</dt>
                  <dd className="font-bold text-white">
                    {diagnostics.playableUrlLines}
                  </dd>
                </div>

                <div className="mt-2">
                  <dt className="text-xf-muted">Primeira linha</dt>
                  <dd className="break-all font-mono text-xs text-white">
                    {diagnostics.firstNonEmptyLine || 'vazia'}
                  </dd>
                </div>
              </dl>
            ) : null}
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
                  focusKey={`direct-source-channel-${index}`}
                  className="rounded-xl border border-white/10 bg-white/5 px-5 py-4 text-left text-white hover:bg-white/10"
                  focusScrollTarget="closest-section"
                  onArrowPress={(direction) => {
                    if (direction === 'up' && index === 0) {
                      setFocus(DIRECT_SOURCE_LOAD_BUTTON_FOCUS_KEY);
                      return false;
                    }

                    return true;
                  }}
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
                Nenhum canal carregado em memória.
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

export default function DirectSourcePlaylistPage() {
  useEffect(() => {
    const timers = DIRECT_SOURCE_FOCUS_RETRY_DELAYS_MS.map((delay) =>
      window.setTimeout(() => {
        logDirectSourceDpadDebug('set initial focus', {
          delay,
          focusKey: DIRECT_SOURCE_INITIAL_FOCUS_KEY,
        });

        setFocus(DIRECT_SOURCE_INITIAL_FOCUS_KEY);
      }, delay),
    );

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);
  return <DirectSourcePlaylistContent />;
}
