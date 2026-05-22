import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { App } from "@capacitor/app";
import { setFocus } from "@noriginmedia/norigin-spatial-navigation";
import { useNavigate } from "react-router-dom";

import { useAuth } from "@/app/providers/AuthProvider";
import { AppShell } from "@/components/layout/AppShell";
import { FocusableButton } from "@/components/tv/FocusableButton";
import { createHlsAdapter } from "@/features/player/lib/hlsAdapter";
import { createMpegTsAdapter } from "@/features/player/lib/mpegTsAdapter";
import {
  createNativeAndroidPlayerAdapter,
  isNativeAndroidPlayerAvailable,
} from "@/features/player/lib/nativeAndroidPlayerAdapter";
import {
  addNativeAndroidPlayerResumeListener,
  startNativeAndroidInlinePreview,
  stopNativeAndroidInlinePreview,
} from "@/features/player/lib/nativeAndroidPlayerBridge";
import { createNativeVideoAdapter } from "@/features/player/lib/nativeVideoAdapter";
import { detectStreamKind } from "@/features/player/lib/detectStreamKind";
import { useRouteInitialFocus } from "@/hooks/useRouteInitialFocus";
import { getStoredLicenseActivation } from "@/features/licensing/lib/licenseActivationStorage";
import {
  getChannelDisplayGroup,
  isLiveChannel,
} from "@/features/playlists/lib/channelClassification";
import { getOrCreateDeviceIdentifier } from "@/features/playlists/lib/deviceIdentifier";
import {
  getAuthorizedIptvSource,
  mapAuthorizedIptvSourceToPlaylistSource,
} from "@/features/playlists/services/authorizedIptvSource.service";
import { listAuthorizedLicenseChannels } from "@/features/playlists/services/authorizedLicenseChannels.service";
import { usePlaylistRuntime } from "@/features/playlists/providers/PlaylistRuntimeProvider";
import type { IptvChannel } from "@/features/playlists/types/playlist";
import type {
  PlayerTelemetryEvent,
  UniversalPlayerAdapter,
} from "@/features/player/types/player";

const MAX_VISIBLE_CHANNELS_PER_GROUP = 160;

type ChannelSourceMode = "cache" | "playlist" | null;
type PreviewStatus = "idle" | "loading" | "playing" | "error";

type ChannelGroup = {
  name: string;
  count: number;
};

function getChannelGroupName(channel: IptvChannel) {
  return getChannelDisplayGroup(channel);
}

function getChannelKey(channel: IptvChannel) {
  return `${channel.id}:${channel.url}`;
}

function getProgressLabel(phase?: string) {
  if (phase === "downloading") return "Baixando lista";
  if (phase === "parsing") return "Processando canais";
  if (phase === "finalizing") return "Finalizando";
  return "Carregando";
}

function maskStreamUrl(rawUrl: string) {
  const trimmedUrl = rawUrl.trim();

  if (!trimmedUrl) {
    return "[empty-stream-url]";
  }

  const urlWithoutHeaders = trimmedUrl.split("|")[0] ?? trimmedUrl;

  try {
    const parsedUrl = new URL(urlWithoutHeaders);
    return `${parsedUrl.protocol}//${parsedUrl.host}/...`;
  } catch {
    return "[masked-stream-url]";
  }
}

function summarizeUnknownError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return "Erro desconhecido no preview inline.";
  }
}

function createLiveTvPreviewAdapter(
  videoElement: HTMLVideoElement,
  streamUrl: string,
  onTelemetryEvent: (event: PlayerTelemetryEvent) => void,
): UniversalPlayerAdapter {
  const stream = detectStreamKind(streamUrl);

  if (stream.kind === "hls") {
    return createHlsAdapter(videoElement, { onTelemetryEvent });
  }

  if (stream.kind === "mpegts") {
    return createMpegTsAdapter(videoElement, { onTelemetryEvent });
  }

  if (stream.kind === "mp4") {
    return createNativeVideoAdapter(videoElement, { onTelemetryEvent });
  }

  throw new Error(
    `Preview inline ainda não suporta stream ${stream.kind}. Tente abrir em tela cheia.`,
  );
}

export default function LiveTvPage() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const {
    channels,
    selectedChannel,
    status,
    progress,
    error,
    loadFromSource,
    loadFromChannels,
    selectChannel,
  } = usePlaylistRuntime();

  const [selectedGroupName, setSelectedGroupName] = useState<string | null>(
    null,
  );
  const [sourceLoadError, setSourceLoadError] = useState<string | null>(null);
  const [channelSourceMode, setChannelSourceMode] =
    useState<ChannelSourceMode>(null);
  const [cacheFallbackMessage, setCacheFallbackMessage] = useState<
    string | null
  >(null);
  const hasRequestedSourceRef = useRef(false);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const previewAdapterRef = useRef<UniversalPlayerAdapter | null>(null);
  const previewRequestIdRef = useRef(0);
  const nativeFullscreenReturnRef = useRef(false);
  const lastChannelActivationRef = useRef<{
    channelKey: string;
    timestamp: number;
  } | null>(null);
  const [previewChannel, setPreviewChannel] = useState<IptvChannel | null>(
    null,
  );
  const [previewStatus, setPreviewStatus] =
    useState<PreviewStatus>("idle");
  const [previewError, setPreviewError] = useState<string | null>(null);

  useRouteInitialFocus();

  useEffect(() => {
    let isActive = true;
    let listener: { remove: () => Promise<void> } | null = null;

    void App.addListener("backButton", ({ canGoBack }) => {
      if (!isActive) {
        return;
      }

      if (canGoBack || window.history.length > 1) {
        navigate(-1);
        return;
      }

      navigate("/");
    }).then((handle) => {
      if (!isActive) {
        void handle.remove();
        return;
      }

      listener = handle;
    });

    return () => {
      isActive = false;

      if (listener) {
        void listener.remove();
      }
    };
  }, [navigate]);

  useEffect(() => {
    let isMounted = true;

    if (
      hasRequestedSourceRef.current ||
      status === "loading" ||
      status === "ready" ||
      channels.length > 0
    ) {
      return () => {
        isMounted = false;
      };
    }

    hasRequestedSourceRef.current = true;
    setSourceLoadError(null);
    setChannelSourceMode(null);
    setCacheFallbackMessage(null);

    void (async () => {
      try {
        const deviceIdentifier = getOrCreateDeviceIdentifier();
        const storedActivation = getStoredLicenseActivation();

        const authorizedSource = await getAuthorizedIptvSource({
          deviceIdentifier,
          licenseCode: storedActivation?.licenseCode,
        });

        const playlistSource =
          mapAuthorizedIptvSourceToPlaylistSource(authorizedSource);
        const licenseId = authorizedSource.license?.id;
        const licenseCode =
          authorizedSource.license?.code ?? storedActivation?.licenseCode;

        if (licenseId && licenseCode) {
          try {
            const cachedChannels = await listAuthorizedLicenseChannels({
              licenseCode,
              deviceIdentifier,
            });

            if (!isMounted) {
              return;
            }

            if (cachedChannels.length > 0) {
              loadFromChannels({
                source: {
                  url: "license-cache:" + licenseId,
                  name:
                    "Canais autorizados da licença " +
                    (authorizedSource.license?.code ?? ""),
                },
                channels: cachedChannels,
              });
              setChannelSourceMode("cache");
              return;
            }

            setCacheFallbackMessage(
              "Cache da licença sem canais ativos. Usando playlist direta autorizada.",
            );
          } catch (cacheError) {
            if (!isMounted) {
              return;
            }

            console.info("[XANDEFLIX_LICENSE_CHANNEL_CACHE_FALLBACK]", {
              reason:
                cacheError instanceof Error
                  ? cacheError.message
                  : "Erro desconhecido ao carregar cache de canais.",
            });
            setCacheFallbackMessage(
              "Cache de canais indisponível. Usando playlist direta autorizada.",
            );
          }
        }

        await loadFromSource(playlistSource);

        if (isMounted) {
          setChannelSourceMode("playlist");
        }
      } catch (loadError) {
        if (isMounted) {
          setSourceLoadError(
            loadError instanceof Error
            ? loadError.message
            : "Não foi possível carregar os canais ao vivo.",
          );
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [channels.length, loadFromChannels, loadFromSource, status]);

  const liveTvChannels = useMemo(() => {
    return channels.filter(isLiveChannel);
  }, [channels]);

  const groups = useMemo<ChannelGroup[]>(() => {
    const groupMap = new Map<string, number>();

    for (const channel of liveTvChannels) {
      const groupName = getChannelGroupName(channel);
      groupMap.set(groupName, (groupMap.get(groupName) ?? 0) + 1);
    }

    return Array.from(groupMap.entries()).map(([name, count]) => ({
      name,
      count,
    }));
  }, [liveTvChannels]);

  const activeGroupName =
    selectedGroupName && groups.some((group) => group.name === selectedGroupName)
      ? selectedGroupName
      : groups[0]?.name ?? null;

  const activeGroupIndex = activeGroupName
    ? groups.findIndex((group) => group.name === activeGroupName)
    : -1;


  const activeGroupChannels = useMemo(() => {
    if (!activeGroupName) {
      return [];
    }

    return liveTvChannels
      .filter((channel) => getChannelGroupName(channel) === activeGroupName)
      .slice(0, MAX_VISIBLE_CHANNELS_PER_GROUP);
  }, [activeGroupName, liveTvChannels]);

  const handleSelectGroup = useCallback((groupName: string) => {
    setSelectedGroupName(groupName);
  }, []);

  const handleGroupArrowPress = useCallback(
    (direction: string, groupIndex: number) => {
      if (direction === "up" && groupIndex === 0) {
        return false;
      }

      if (direction === "down" && groupIndex === groups.length - 1) {
        return false;
      }

      return true;
    },
    [groups.length],
  );

  const handleChannelArrowPress = useCallback(
    (direction: string, channelIndex: number) => {
      if (direction === "up" && channelIndex === 0) {
        return false;
      }

      if (
        direction === "down" &&
        channelIndex === activeGroupChannels.length - 1
      ) {
        return false;
      }

      if (direction !== "left" || activeGroupIndex < 0) {
        return true;
      }

      setFocus(`live-group-${activeGroupIndex}`);
      return false;
    },
    [activeGroupChannels.length, activeGroupIndex],
  );

  const destroyPreviewAdapter = useCallback(() => {
    void stopNativeAndroidInlinePreview().catch(() => undefined);
    previewAdapterRef.current?.destroy();
    previewAdapterRef.current = null;

    const videoElement = previewVideoRef.current;

    if (videoElement) {
      videoElement.pause();
      videoElement.removeAttribute("src");
      videoElement.load();
    }
  }, []);

  const handlePreviewTelemetryEvent = useCallback(
    (event: PlayerTelemetryEvent) => {
      if (event.level !== "warn" && event.level !== "error") {
        return;
      }

      console.info("[XANDEFLIX_LIVE_PREVIEW_TELEMETRY]", {
        source: event.source,
        name: event.name,
        level: event.level,
        message: event.message,
      });
    },
    [],
  );

  const openChannelFullscreen = useCallback(
    async (channel: IptvChannel) => {
      selectChannel(channel);

      const stream = detectStreamKind(channel.url);

      console.info("[XANDEFLIX_LIVE_FULLSCREEN_OPEN]", {
        channel: channel.name,
        stream: maskStreamUrl(channel.url),
        kind: stream.kind,
        mode: isNativeAndroidPlayerAvailable(stream.kind)
          ? "native-android-direct"
          : "universal-player-route",
      });

      await stopNativeAndroidInlinePreview().catch(() => undefined);

      if (isNativeAndroidPlayerAvailable(stream.kind)) {
        try {
          const adapter = createNativeAndroidPlayerAdapter(stream.kind);

          await adapter.load({
            url: channel.url,
            title: channel.name,
          });

          nativeFullscreenReturnRef.current = true;
          await adapter.play();
          adapter.destroy();
          return;
        } catch (fullscreenError) {
          nativeFullscreenReturnRef.current = false;
          const message = summarizeUnknownError(fullscreenError);
          console.warn("[XANDEFLIX_LIVE_FULLSCREEN_NATIVE_ERROR]", {
            channel: channel.name,
            stream: maskStreamUrl(channel.url),
            error: message,
          });
        }
      }

      const params = new URLSearchParams({
        src: channel.url,
        title: channel.name,
      });

      navigate(`/player?${params.toString()}`);
    },
    [navigate, selectChannel],
  );

  const startChannelPreview = useCallback(
    async (channel: IptvChannel) => {
      const videoElement = previewVideoRef.current;
      const requestId = previewRequestIdRef.current + 1;
      previewRequestIdRef.current = requestId;

      selectChannel(channel);
      setPreviewChannel(channel);
      setPreviewStatus("loading");
      setPreviewError(null);

      console.info("[XANDEFLIX_LIVE_PREVIEW_START]", {
        channel: channel.name,
        stream: maskStreamUrl(channel.url),
      });

      if (!videoElement) {
        setPreviewStatus("error");
        setPreviewError("Elemento de vídeo do preview ainda não está disponível.");
        return;
      }

      try {
        destroyPreviewAdapter();

        const stream = detectStreamKind(channel.url);

        if (isNativeAndroidPlayerAvailable(stream.kind)) {
          const previewContainer = previewContainerRef.current;

          if (!previewContainer) {
            setPreviewStatus("error");
            setPreviewError(
              "Área de preview inline ainda não está disponível.",
            );
            return;
          }

          const previewRect = previewContainer.getBoundingClientRect();
          const previewScale = window.devicePixelRatio || 1;
          const previewLayout = {
            x: Math.round(previewRect.left * previewScale),
            y: Math.round(previewRect.top * previewScale),
            width: Math.round(previewRect.width * previewScale),
            height: Math.round(previewRect.height * previewScale),
          };

          await startNativeAndroidInlinePreview({
            url: channel.url,
            title: channel.name,
            kind: stream.kind,
            ...previewLayout,
          });

          if (requestId !== previewRequestIdRef.current) {
            await stopNativeAndroidInlinePreview().catch(() => undefined);
            return;
          }

          setPreviewStatus("playing");
          setPreviewError(null);

          console.info("[XANDEFLIX_LIVE_PREVIEW_NATIVE_INLINE_STARTED]", {
            channel: channel.name,
            stream: maskStreamUrl(channel.url),
            kind: stream.kind,
            layout: previewLayout,
          });
          return;
        }

        videoElement.muted = false;
        videoElement.autoplay = true;
        videoElement.controls = false;
        videoElement.playsInline = true;

        const adapter = createLiveTvPreviewAdapter(
          videoElement,
          channel.url,
          handlePreviewTelemetryEvent,
        );

        previewAdapterRef.current = adapter;

        await adapter.load({
          url: channel.url,
          title: channel.name,
        });

        if (requestId !== previewRequestIdRef.current) {
          return;
        }

        await adapter.play();

        if (requestId !== previewRequestIdRef.current) {
          return;
        }

        setPreviewStatus("playing");
      } catch (previewLoadError) {
        if (requestId !== previewRequestIdRef.current) {
          return;
        }

        const message = summarizeUnknownError(previewLoadError);
        setPreviewStatus("error");
        setPreviewError(message);

        console.warn("[XANDEFLIX_LIVE_PREVIEW_ERROR]", {
          channel: channel.name,
          stream: maskStreamUrl(channel.url),
          error: message,
        });
      }
    },
    [destroyPreviewAdapter, handlePreviewTelemetryEvent, selectChannel],
  );

  useEffect(() => {
    const restorePreviewAfterNativeFullscreen = () => {
      if (!nativeFullscreenReturnRef.current || !previewChannel) {
        return;
      }

      const stream = detectStreamKind(previewChannel.url);

      if (!isNativeAndroidPlayerAvailable(stream.kind)) {
        nativeFullscreenReturnRef.current = false;
        return;
      }

      nativeFullscreenReturnRef.current = false;

      window.setTimeout(() => {
        console.info("[XANDEFLIX_LIVE_PREVIEW_RESTORE_AFTER_FULLSCREEN]", {
          channel: previewChannel.name,
          stream: maskStreamUrl(previewChannel.url),
          kind: stream.kind,
        });

        void startChannelPreview(previewChannel);
      }, 250);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        restorePreviewAfterNativeFullscreen();
      }
    };

    window.addEventListener("focus", restorePreviewAfterNativeFullscreen);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const appListenerPromise = App.addListener(
      "resume",
      restorePreviewAfterNativeFullscreen,
    );

    const nativeResumeListenerPromise = addNativeAndroidPlayerResumeListener(
      (event) => {
        console.info("[XANDEFLIX_LIVE_NATIVE_RESUME_EVENT]", event);
        restorePreviewAfterNativeFullscreen();
      },
    );

    return () => {
      window.removeEventListener(
        "focus",
        restorePreviewAfterNativeFullscreen,
      );
      document.removeEventListener("visibilitychange", handleVisibilityChange);

      void appListenerPromise.then((listener) => {
        listener.remove();
      });

      void nativeResumeListenerPromise.then((listener) => {
        listener.remove();
      });
    };
  }, [previewChannel, startChannelPreview]);

  const handleSelectChannel = useCallback(
    (channel: IptvChannel) => {
      const channelKey = getChannelKey(channel);
      const now = Date.now();
      const lastActivation = lastChannelActivationRef.current;

      if (
        lastActivation?.channelKey === channelKey &&
        now - lastActivation.timestamp < 900
      ) {
        console.info("[XANDEFLIX_LIVE_CHANNEL_DUPLICATE_OK_IGNORED]", {
          channel: channel.name,
          elapsedMs: now - lastActivation.timestamp,
        });
        return;
      }

      lastChannelActivationRef.current = {
        channelKey,
        timestamp: now,
      };

      const isSamePreviewChannel =
        previewChannel && getChannelKey(previewChannel) === channelKey;

      if (isSamePreviewChannel && previewStatus !== "idle") {
        void openChannelFullscreen(channel);
        return;
      }

      void startChannelPreview(channel);
    },
    [openChannelFullscreen, previewChannel, previewStatus, startChannelPreview],
  );

  useEffect(() => {
    return () => {
      previewRequestIdRef.current += 1;
      destroyPreviewAdapter();
    };
  }, [destroyPreviewAdapter]);

  const isLoading = status === "loading";
  const shouldShowInitialLiveTvLoading =
    isLoading ||
    (status !== "error" && groups.length === 0 && activeGroupChannels.length === 0);
  const userFacingError = sourceLoadError ?? error;
  const currentPreviewChannel = previewChannel ?? selectedChannel;
  const previewPanelDescription = !currentPreviewChannel
    ? "Selecione um canal para iniciar a prévia inline."
    : previewStatus === "loading"
      ? "Carregando preview inline. Pressione OK novamente no mesmo canal para abrir em tela cheia."
      : previewStatus === "playing"
        ? "Preview inline ativo. Pressione OK novamente no mesmo canal para tela cheia."
        : previewStatus === "error"
          ? "Preview inline falhou. Pressione OK novamente no mesmo canal para tentar em tela cheia."
          : "Pressione OK no canal selecionado para iniciar a prévia.";

  return (
    <AppShell
      onSignOut={() => void signOut()}
      hideHeaderOnTv
      mainClassName="px-0 pt-0 pb-0 pr-0 md:px-0 md:pt-0 md:pb-0 md:pr-0 lg:px-0 lg:pt-0 lg:pb-0 lg:pr-0"
    >
      <section className="xf-live-tv-page xf-live-tv-layout grid min-h-screen gap-x-0 gap-y-4 text-white">
        <aside className="flex h-screen min-h-screen flex-col bg-black/70 p-3">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-xf-red">
            Grupos
          </p>

          <div className="mt-5 min-h-0 flex-1 space-y-2 overflow-y-auto px-2 py-2 scroll-py-2">
            {groups.length > 0 ? (
              groups.map((group, index) => {
                const isActive = group.name === activeGroupName;

                return (
                  <FocusableButton
                    key={group.name}
                    focusKey={`live-group-${index}`}
                    className={[
                      "flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm font-black uppercase tracking-wide",
                      isActive
                        ? "border border-xf-red/70 bg-xf-red/20 text-white"
                        : "border border-white/5 bg-white/5 text-xf-muted hover:text-white",
                    ].join(" ")}
                    onArrowPress={(direction) => handleGroupArrowPress(direction, index)}
                    onEnterPress={() => handleSelectGroup(group.name)}
                    onClick={() => handleSelectGroup(group.name)}
                  >
                    <span className="truncate">{group.name}</span>
                    <span className="ml-3 rounded-lg bg-white/10 px-2 py-1 text-xs">
                      {group.count}
                    </span>
                  </FocusableButton>
                );
              })
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-sm font-semibold text-xf-muted">
                  {shouldShowInitialLiveTvLoading
                    ? "Carregando lista autorizada de canais. Aguarde alguns instantes..."
                    : "Nenhum grupo carregado."}
                </p>

                {shouldShowInitialLiveTvLoading ? (
                  <div className="mt-4 space-y-2">
                    {Array.from({ length: 5 }).map((_, placeholderIndex) => (
                      <div
                        key={`live-group-loading-${placeholderIndex}`}
                        className="h-10 rounded-2xl border border-white/5 bg-white/[0.06]"
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </aside>

        <aside className="flex h-screen min-h-screen flex-col bg-black/70 p-3">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-xf-red">
            Canais
          </p>

          {activeGroupName ? (
            <h1 className="mt-3 truncate text-2xl font-black">
              {activeGroupName}
            </h1>
          ) : null}

          <div className="mt-5 min-h-0 flex-1 space-y-2 overflow-y-auto px-2 py-2 scroll-py-2">
            {activeGroupChannels.length > 0 ? (
              activeGroupChannels.map((channel, index) => {
                const channelKey = getChannelKey(channel);
                const isActive =
                  selectedChannel &&
                  getChannelKey(selectedChannel) === channelKey;
                const isPreviewingThisChannel =
                  previewChannel && getChannelKey(previewChannel) === channelKey;
                const channelActionLabel = isPreviewingThisChannel
                  ? previewStatus === "loading"
                    ? "Carregando preview..."
                    : previewStatus === "playing"
                      ? "Preview ativo · OK para tela cheia"
                      : previewStatus === "error"
                        ? "Preview falhou · OK para tela cheia"
                        : "OK para tela cheia"
                  : channel.tvgName || "OK inicia preview";

                return (
                  <FocusableButton
                    key={channelKey}
                    focusKey={`live-channel-${index}`}
                    className={[
                      "flex w-full items-center gap-2 rounded-2xl border px-4 py-2 text-left text-sm font-black uppercase tracking-wide",
                      isActive
                        ? "border-xf-red bg-xf-red/15 text-white"
                        : "border-white/5 bg-white/5 text-xf-muted hover:text-white",
                    ].join(" ")}
                    onArrowPress={(direction) => handleChannelArrowPress(direction, index)}
                    onEnterPress={() => handleSelectChannel(channel)}
                  >
                    <div className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/10">
                      {channel.logo ? (
                        <img
                          src={channel.logo}
                          alt=""
                          className="max-h-full max-w-full object-contain"
                          loading="lazy"
                        />
                      ) : (
                        <span className="text-xs font-black">TV</span>
                      )}
                    </div>

                    <div className="min-w-0">
                      <span className="block truncate text-sm font-black uppercase tracking-wide leading-none">
                        {channel.name}
                      </span>
                      <span className="mt-0.5 block truncate text-[0.65rem] uppercase tracking-wide leading-none text-xf-muted">
                        {channelActionLabel}
                      </span>
                    </div>
                  </FocusableButton>
                );
              })
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-sm font-semibold text-xf-muted">
                  {shouldShowInitialLiveTvLoading
                    ? "Carregando canais..."
                    : "Nenhum canal neste grupo."}
                </p>

                {shouldShowInitialLiveTvLoading ? (
                  <div className="mt-4 space-y-2">
                    {Array.from({ length: 8 }).map((_, placeholderIndex) => (
                      <div
                        key={`live-channel-loading-${placeholderIndex}`}
                        className="h-12 rounded-2xl border border-white/5 bg-white/[0.06]"
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </aside>

        <section className="xf-live-tv-preview flex min-h-[calc(100vh-2rem)] min-w-0 flex-col gap-4 md:pl-4">
          <div
            ref={previewContainerRef}
            className="relative aspect-video overflow-hidden rounded-3xl border border-white/10 bg-black shadow-2xl"
          >
            <video
              ref={previewVideoRef}
              className="absolute inset-0 h-full w-full bg-black object-contain"
              playsInline
              autoPlay
              controls={false}
              onPlaying={() => setPreviewStatus("playing")}
              onError={() => {
                if (!previewChannel) {
                  return;
                }

                setPreviewStatus("error");
                setPreviewError("Erro durante a reprodução do preview inline.");
              }}
            />

            {previewStatus !== "playing" ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                <div className="max-w-xl p-8 text-center">
                  <p className="text-xs font-black uppercase tracking-[0.4em] text-xf-red">
                    Xandeflix Live
                  </p>

                  <h2 className="mt-4 text-2xl font-black">
                    {currentPreviewChannel?.name ?? "Selecione um canal"}
                  </h2>

                  <p className="mt-3 text-sm text-xf-muted">
                    {previewPanelDescription}
                  </p>

                  {previewStatus === "loading" ? (
                    <p className="mt-5 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-xf-muted">
                      Preparando preview inline...
                    </p>
                  ) : null}

                  {previewStatus === "error" && previewError ? (
                    <p className="mt-5 rounded-xl border border-yellow-500/40 bg-yellow-950/70 px-4 py-3 text-sm text-yellow-100">
                      {previewError}
                    </p>
                  ) : null}

                  {isLoading && progress ? (
                    <p className="mt-5 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-xf-muted">
                      {getProgressLabel(progress.phase)} ·{" "}
                      {progress.channelsParsed} canais processados
                    </p>
                  ) : null}

                  {channelSourceMode === "cache" ? (
                    <p className="mt-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                      Canais autorizados carregados do cache da licença.
                    </p>
                  ) : null}

                  {cacheFallbackMessage && channelSourceMode === "playlist" ? (
                    <p className="mt-5 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-xf-muted">
                      {cacheFallbackMessage}
                    </p>
                  ) : null}

                  {userFacingError ? (
                    <p className="mt-5 rounded-xl border border-yellow-500/40 bg-yellow-950/70 px-4 py-3 text-sm text-yellow-100">
                      {userFacingError}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/70 p-4">
            <p className="text-xs font-black uppercase tracking-[0.35em] text-white">
              Canal ativo
            </p>

            <h3 className="mt-3 truncate text-xl font-black">
              {currentPreviewChannel?.name ?? "Nenhum canal em preview"}
            </h3>

            <p className="mt-2 text-sm text-xf-muted">
              {previewPanelDescription}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/70 p-4">
            <p className="text-xs font-black uppercase tracking-[0.35em] text-white">
              Guia de programação
            </p>
          </div>
        </section>
      </section>
    </AppShell>
  );
}

