import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { App } from "@capacitor/app";
import { setFocus } from "@noriginmedia/norigin-spatial-navigation";
import { useNavigate } from "react-router-dom";

import { useAuth } from "@/app/providers/AuthProvider";
import { AppShell } from "@/components/layout/AppShell";
import { useDeviceProfile } from "@/platform/useDeviceProfile";
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
  updateNativeAndroidInlinePreview,
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
import { getCachedAppBootstrapResult } from "@/features/bootstrap/services/appBootstrap.service";
import {
  getCachedLiveTvCriticalChannels,
  storeCachedLiveTvCriticalChannels,
} from "../services/liveTvCriticalCache.service";
import type { IptvChannel } from "@/features/playlists/types/playlist";
import type {
  PlayerTelemetryEvent,
  UniversalPlayerAdapter,
} from "@/features/player/types/player";

const MAX_VISIBLE_CHANNELS_PER_GROUP = 160;
let lastLiveTvGroupVerticalNavigationAt = 0;

type ChannelSourceMode = "cache" | "playlist" | null;

function normalizeLiveGroupTitle(groupTitle?: string | null) {
  return groupTitle
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase() ?? "";
}

function isVodGroupTitleInLivePage(groupTitle?: string | null) {
  const normalizedGroupTitle = normalizeLiveGroupTitle(groupTitle);

  if (!normalizedGroupTitle) {
    return false;
  }

  if (
    normalizedGroupTitle === "filmes e series" ||
    normalizedGroupTitle === "filmes e series 24h"
  ) {
    return false;
  }

  return (
    /^filmes(\s*\||\s|$)/.test(normalizedGroupTitle) ||
    /^series(\s*\||\s|$)/.test(normalizedGroupTitle)
  );
}

function isLiveTvPageChannel(channel: IptvChannel) {
  if (isVodGroupTitleInLivePage(channel.groupTitle)) {
    return false;
  }

  if (channel.contentKind) {
    return channel.contentKind === "live";
  }

  return isLiveChannel(channel);
}

function readInitialLiveTvCriticalChannels() {
  const storedActivation = getStoredLicenseActivation();

  if (!storedActivation) {
    return [];
  }

  return (
    getCachedLiveTvCriticalChannels({
      licenseCode: storedActivation.licenseCode,
      deviceIdentifier: storedActivation.deviceIdentifier,
    })?.filter(isLiveTvPageChannel) ?? []
  );
}


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
  const deviceProfile = useDeviceProfile();
  const {
    channels,
    selectedChannel,
    status,
    loadFromSource,
    loadFromChannels,
    selectChannel,
  } = usePlaylistRuntime();

  const [selectedGroupName, setSelectedGroupName] = useState<string | null>(
    null,
  );
  const [, setSourceLoadError] = useState<string | null>(null);
  const [, setChannelSourceMode] = useState<ChannelSourceMode>(null);
  const [instantLiveChannels, setInstantLiveChannels] = useState<IptvChannel[]>(
    () => readInitialLiveTvCriticalChannels(),
  );
  const [, setCacheFallbackMessage] = useState<string | null>(null);
  const hasRequestedSourceRef = useRef(false);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const previewAdapterRef = useRef<UniversalPlayerAdapter | null>(null);
  const previewRequestIdRef = useRef(0);
  const nativeInlinePreviewActiveRef = useRef(false);
  const nativeInlinePreviewLayoutKeyRef = useRef<string | null>(null);
  const nativeFullscreenReturnRef = useRef(false);
  const [previewChannel, setPreviewChannel] = useState<IptvChannel | null>(
    null,
  );
  const [previewStatus, setPreviewStatus] =
    useState<PreviewStatus>("idle");
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isPreviewMuted, setIsPreviewMuted] = useState(false);
  const [isPreviewControlBusy, setIsPreviewControlBusy] = useState(false);
  const [isNativeInlinePreviewActive, setIsNativeInlinePreviewActive] =
    useState(false);

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
      !hasRequestedSourceRef.current &&
      status !== "loading" &&
      status !== "ready" &&
      channels.length === 0
    ) {
      const storedActivation = getStoredLicenseActivation();
      const cachedLiveChannels = getCachedLiveTvCriticalChannels({
        licenseCode: storedActivation?.licenseCode,
        deviceIdentifier: storedActivation?.deviceIdentifier,
      })?.filter(isLiveTvPageChannel);

      if (storedActivation && cachedLiveChannels?.length) {
        hasRequestedSourceRef.current = true;
        setSourceLoadError(null);
        setChannelSourceMode("cache");
        setCacheFallbackMessage(null);
        setInstantLiveChannels(cachedLiveChannels);

        loadFromChannels({
          source: {
            url: "live-tv-critical-cache:" + storedActivation.licenseCode,
            name:
              "Canais ao vivo preparados da licença " +
              storedActivation.licenseCode,
          },
          channels: cachedLiveChannels,
        });

        void (async () => {
          try {
            const fullChannels = await listAuthorizedLicenseChannels({
              licenseCode: storedActivation.licenseCode,
              deviceIdentifier: storedActivation.deviceIdentifier,
              pageSize: 500,
              maxPages: 20,
              contentKind: 'live',
            });

            const fullLiveChannels = fullChannels.filter(isLiveTvPageChannel);

            if (
              !isMounted ||
              fullLiveChannels.length <= cachedLiveChannels.length
            ) {
              return;
            }

            storeCachedLiveTvCriticalChannels({
              licenseCode: storedActivation.licenseCode,
              deviceIdentifier: storedActivation.deviceIdentifier,
              channels: fullLiveChannels,
            });
            setInstantLiveChannels(fullLiveChannels);

            loadFromChannels({
              source: {
                url: "license-cache-background:" + storedActivation.licenseCode,
                name:
                  "Canais autorizados completos da licença " +
                  storedActivation.licenseCode,
              },
              channels: fullLiveChannels,
            });
          } catch (backgroundLoadError) {
            console.info("[XANDEFLIX_LIVE_BACKGROUND_EXPAND_FALLBACK]", {
              reason:
                backgroundLoadError instanceof Error
                  ? backgroundLoadError.message
                  : "Erro desconhecido ao expandir canais ao vivo.",
            });
          }
        })();

        return () => {
          isMounted = false;
        };
      }

      const cachedBootstrap = getCachedAppBootstrapResult();
      const isSameActivation =
        cachedBootstrap &&
        storedActivation?.licenseCode?.trim().toUpperCase() ===
          cachedBootstrap.licenseCode.trim().toUpperCase() &&
        storedActivation.deviceIdentifier === cachedBootstrap.deviceIdentifier;

      if (isSameActivation && cachedBootstrap.livePreviewChannels.length > 0) {
        hasRequestedSourceRef.current = true;
        setSourceLoadError(null);
        setChannelSourceMode("cache");
        setCacheFallbackMessage(null);

        storeCachedLiveTvCriticalChannels({
          licenseCode: storedActivation?.licenseCode,
          deviceIdentifier: storedActivation?.deviceIdentifier,
          channels: cachedBootstrap.livePreviewChannels,
        });

        loadFromChannels({
          source: {
            url: "bootstrap-cache:" + cachedBootstrap.licenseCode,
            name:
              "Canais críticos preparados da licença " +
              cachedBootstrap.licenseCode,
          },
          channels: cachedBootstrap.livePreviewChannels,
        });

        return () => {
          isMounted = false;
        };
      }
    }

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
              pageSize: 500,
              maxPages: 20,
              contentKind: 'live',
            });

            if (!isMounted) {
              return;
            }

            const liveCachedChannels = cachedChannels.filter(isLiveTvPageChannel);

            if (liveCachedChannels.length > 0) {
              storeCachedLiveTvCriticalChannels({
                licenseCode,
                deviceIdentifier,
                channels: liveCachedChannels,
              });
              setInstantLiveChannels(liveCachedChannels);

              loadFromChannels({
                source: {
                  url: "license-cache:" + licenseId,
                  name:
                    "Canais autorizados da licença " +
                    (authorizedSource.license?.code ?? ""),
                },
                channels: liveCachedChannels,
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
    const runtimeLiveChannels = channels.filter(isLiveTvPageChannel);

    if (runtimeLiveChannels.length > 0) {
      return runtimeLiveChannels;
    }

    return instantLiveChannels;
  }, [channels, instantLiveChannels]);

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
      if (direction === "right" && activeGroupChannels.length > 0) {
        setFocus("live-channel-0");
        return false;
      }

      if (direction !== "up" && direction !== "down") {
        return true;
      }

      const now = Date.now();

      if (now - lastLiveTvGroupVerticalNavigationAt < 320) {
        return false;
      }

      const nextGroupIndex =
        direction === "down" ? groupIndex + 1 : groupIndex - 1;

      if (nextGroupIndex < 0 || nextGroupIndex >= groups.length) {
        return false;
      }

      lastLiveTvGroupVerticalNavigationAt = now;
      setFocus(`live-group-${nextGroupIndex}`);

      return false;
    },
    [activeGroupChannels.length, groups.length],
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
    nativeInlinePreviewActiveRef.current = false;
    nativeInlinePreviewLayoutKeyRef.current = null;
    setIsNativeInlinePreviewActive(false);
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

          nativeInlinePreviewActiveRef.current = true;
          nativeInlinePreviewLayoutKeyRef.current = [
            previewLayout.x,
            previewLayout.y,
            previewLayout.width,
            previewLayout.height,
          ].join(":");
          setIsNativeInlinePreviewActive(true);

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

        nativeInlinePreviewActiveRef.current = false;
        nativeInlinePreviewLayoutKeyRef.current = null;
        setIsNativeInlinePreviewActive(false);

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

        nativeInlinePreviewActiveRef.current = false;
        nativeInlinePreviewLayoutKeyRef.current = null;
        setIsNativeInlinePreviewActive(false);

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

  const syncNativeInlinePreviewLayout = useCallback(() => {
    if (!nativeInlinePreviewActiveRef.current) {
      return;
    }

    const previewContainer = previewContainerRef.current;

    if (!previewContainer || typeof window === "undefined") {
      return;
    }

    const previewRect = previewContainer.getBoundingClientRect();
    const previewScale = window.devicePixelRatio || 1;

    const nextLayout = {
      x: Math.round(previewRect.left * previewScale),
      y: Math.round(previewRect.top * previewScale),
      width: Math.round(previewRect.width * previewScale),
      height: Math.round(previewRect.height * previewScale),
    };

    if (nextLayout.width <= 0 || nextLayout.height <= 0) {
      return;
    }

    const nextLayoutKey = [
      nextLayout.x,
      nextLayout.y,
      nextLayout.width,
      nextLayout.height,
    ].join(":");

    if (nextLayoutKey === nativeInlinePreviewLayoutKeyRef.current) {
      return;
    }

    nativeInlinePreviewLayoutKeyRef.current = nextLayoutKey;

    void updateNativeAndroidInlinePreview(nextLayout).catch((error) => {
      console.warn("[XANDEFLIX_LIVE_PREVIEW_NATIVE_INLINE_UPDATE_ERROR]", {
        error: summarizeUnknownError(error),
        layout: nextLayout,
      });
    });
  }, []);

  useEffect(() => {
    if (previewStatus !== "playing") {
      return;
    }

    let animationFrameId = 0;

    const scheduleSync = () => {
      window.cancelAnimationFrame(animationFrameId);
      animationFrameId = window.requestAnimationFrame(() => {
        syncNativeInlinePreviewLayout();
      });
    };

    scheduleSync();

    const intervalId = window.setInterval(scheduleSync, 350);

    window.addEventListener("scroll", scheduleSync, true);
    window.addEventListener("resize", scheduleSync);
    window.addEventListener("orientationchange", scheduleSync);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.clearInterval(intervalId);
      window.removeEventListener("scroll", scheduleSync, true);
      window.removeEventListener("resize", scheduleSync);
      window.removeEventListener("orientationchange", scheduleSync);
    };
  }, [previewStatus, previewChannel, syncNativeInlinePreviewLayout]);

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

    const nativeResumeListenerPromise =
      deviceProfile.runtime === "capacitor-android"
        ? addNativeAndroidPlayerResumeListener((event) => {
            console.info("[XANDEFLIX_LIVE_NATIVE_RESUME_EVENT]", event);
            restorePreviewAfterNativeFullscreen();
          })
        : null;

    return () => {
      window.removeEventListener(
        "focus",
        restorePreviewAfterNativeFullscreen,
      );
      document.removeEventListener("visibilitychange", handleVisibilityChange);

      void appListenerPromise.then((listener) => {
        listener.remove();
      });

      if (nativeResumeListenerPromise) {
        void nativeResumeListenerPromise.then((listener) => {
          listener.remove();
        });
      }
    };
  }, [deviceProfile.runtime, previewChannel, startChannelPreview]);

  const handleSelectChannel = useCallback(
    (channel: IptvChannel) => {
      const nextChannelKey = getChannelKey(channel);
      const activePreviewChannelKey = previewChannel
        ? getChannelKey(previewChannel)
        : "";

      const shouldOpenFullscreen =
        activePreviewChannelKey === nextChannelKey &&
        (previewStatus === "playing" || previewStatus === "error");

      if (shouldOpenFullscreen) {
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

  const handleToggleInlinePreviewPlayback = useCallback(() => {
    const activePreviewChannel = previewChannel ?? selectedChannel;

    if (!activePreviewChannel) {
      return;
    }

    if (previewStatus === "playing" || previewStatus === "loading") {
      destroyPreviewAdapter();
      setPreviewStatus("idle");
      return;
    }

    void startChannelPreview(activePreviewChannel);
  }, [
    destroyPreviewAdapter,
    previewChannel,
    previewStatus,
    selectedChannel,
    startChannelPreview,
  ]);

  const handleOpenInlinePreviewFullscreen = useCallback(() => {
    const activePreviewChannel = previewChannel ?? selectedChannel;

    if (!activePreviewChannel || isPreviewControlBusy) {
      return;
    }

    setIsPreviewControlBusy(true);

    void openChannelFullscreen(activePreviewChannel).finally(() => {
      window.setTimeout(() => {
        setIsPreviewControlBusy(false);
      }, 450);
    });
  }, [
    isPreviewControlBusy,
    openChannelFullscreen,
    previewChannel,
    selectedChannel,
  ]);

  const isLoading = status === "loading" && liveTvChannels.length === 0;
  const shouldShowInitialLiveTvLoading =
    isLoading ||
    (status !== "error" && groups.length === 0 && activeGroupChannels.length === 0);
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



  const currentPreviewChannelKey = currentPreviewChannel
    ? getChannelKey(currentPreviewChannel)
    : "";
  const selectedMobileChannelKey = activeGroupChannels.some(
    (channel) => getChannelKey(channel) === currentPreviewChannelKey,
  )
    ? currentPreviewChannelKey
    : "";

  const shouldUseTouchStackedLayout =
    deviceProfile.inputMode === "touch" &&
    (deviceProfile.formFactor === "mobile" ||
      (deviceProfile.formFactor === "tablet" &&
        deviceProfile.viewportHeight >= deviceProfile.viewportWidth));
  const shouldUsePanelLiveTvLayout = !shouldUseTouchStackedLayout;

  return (
    <AppShell
      onSignOut={() => void signOut()}
      hideHeaderOnTv
      mainClassName="px-0 pt-0 pb-0 pr-0 md:px-0 md:pt-0 md:pb-0 md:pr-0 lg:px-0 lg:pt-0 lg:pb-0 lg:pr-0"
    >
      <section
        className={[
          "xf-live-tv-page xf-live-tv-layout flex min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-black text-white",
          shouldUseTouchStackedLayout
            ? "flex-col gap-y-4 overflow-y-auto pb-24"
            : "grid gap-x-0 overflow-hidden pb-0",
        ].join(" ")}
      >
        <div
          className={[
            "order-2 space-y-4 px-5 pt-3 pb-4",
            shouldUseTouchStackedLayout ? "block" : "hidden",
          ].join(" ")}
        >
          <label className="block">
            <span className="mb-2 block text-[0.68rem] font-black uppercase tracking-[0.28em] text-xf-red">
              Grupos de canais
            </span>
            <select
              className="w-full rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-3 text-sm font-bold text-white outline-none"
              value={activeGroupName ?? ""}
              onChange={(event) => handleSelectGroup(event.target.value)}
            >
              {groups.map((group) => (
                <option key={group.name} value={group.name} className="bg-black text-white">
                  {group.name} ({group.count})
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-[0.68rem] font-black uppercase tracking-[0.28em] text-xf-red">
              Canal selecionado
            </span>
            <select
              className="w-full rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-3 text-sm font-bold text-white outline-none"
              value={selectedMobileChannelKey}
              onChange={(event) => {
                const nextChannel = activeGroupChannels.find(
                  (channel) => getChannelKey(channel) === event.target.value,
                );

                if (nextChannel) {
                  handleSelectChannel(nextChannel);
                }
              }}
            >
              <option value="" className="bg-black text-white">
                Selecione um canal
              </option>
              {activeGroupChannels.map((channel) => {
                const channelKey = getChannelKey(channel);

                return (
                  <option key={channelKey} value={channelKey} className="bg-black text-white">
                    {channel.name}
                  </option>
                );
              })}
            </select>
          </label>

          {currentPreviewChannel ? (
            <div className="rounded-3xl border border-white/10 bg-black/75 p-4 shadow-2xl">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/10">
                  {currentPreviewChannel.logo ? (
                    <img
                      src={currentPreviewChannel.logo}
                      alt=""
                      className="max-h-full max-w-full object-contain"
                      loading="lazy"
                    />
                  ) : (
                    <span className="text-xs font-black text-white">TV</span>
                  )}
                </div>

                <div className="min-w-0">
                  <p className="text-[0.65rem] font-black uppercase tracking-[0.28em] text-xf-red">
                    Agora na prévia
                  </p>
                  <h3 className="mt-1 truncate text-base font-black text-white">
                    {currentPreviewChannel.name}
                  </h3>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.05] p-4">
                <p className="text-[0.68rem] font-black uppercase tracking-[0.25em] text-white/70">
                  Grade de programação EPG
                </p>
                <p className="mt-2 text-sm leading-relaxed text-xf-muted">
                  Guia de programação indisponível no momento.
                </p>
              </div>
            </div>
          ) : null}
        </div>

        <aside
          className={[
            "xf-live-tv-groups-column h-screen min-h-screen flex-col border-r border-white/10 bg-black/80 shadow-2xl",
            shouldUsePanelLiveTvLayout ? "flex" : "hidden",
          ].join(" ")}
        >
          <p className="xf-live-tv-column-title font-black uppercase tracking-[0.35em] text-xf-red">
            Grupos
          </p>


          <div className="xf-live-tv-group-list mt-5 min-h-0 flex-1 overflow-y-auto scroll-py-2">
            {groups.length > 0 ? (
              groups.map((group, index) => {
                const isActiveGroup = group.name === activeGroupName;

                return (
                  <FocusableButton
                    key={group.name}
                    focusKey={`live-group-${index}`}
                    data-active-group={isActiveGroup ? "true" : "false"}
                    className={[
                      "xf-live-tv-group-button flex w-full items-center border border-transparent text-left font-black uppercase tracking-wide transition hover:text-white data-[focused=true]:border-xf-red/80 data-[focused=true]:bg-xf-red/25 data-[focused=true]:text-white data-[focused=true]:shadow-lg",
                      isActiveGroup
                        ? "bg-xf-red/25 text-white shadow-lg"
                        : "bg-transparent text-xf-muted",
                    ].join(" ")}
                    onArrowPress={(direction) => handleGroupArrowPress(direction, index)}
                    onEnterPress={() => handleSelectGroup(group.name)}
                    onClick={() => handleSelectGroup(group.name)}
                  >
                    <span className="truncate">{group.name}</span>
                  </FocusableButton>
                );
              })
            ) : shouldShowInitialLiveTvLoading ? (
              Array.from({ length: 5 }).map((_, placeholderIndex) => (
                <div
                  key={`live-group-loading-${placeholderIndex}`}
                  className="h-10 rounded-2xl border border-white/5 bg-white/[0.06]"
                />
              ))
            ) : null}
          </div>
        </aside>

        <aside
          className={[
            "xf-live-tv-channels-column h-screen min-h-screen flex-col border-r border-white/10 bg-black/75 shadow-2xl",
            shouldUsePanelLiveTvLayout ? "flex" : "hidden",
          ].join(" ")}
        >
          <p className="xf-live-tv-column-title font-black uppercase tracking-[0.35em] text-xf-red">
            Canais
          </p>


          <div className="xf-live-tv-channel-list mt-4 min-h-0 flex-1 overflow-y-auto scroll-py-2">
            {activeGroupChannels.length > 0 ? (
              activeGroupChannels.map((channel, index) => {
                const channelKey = getChannelKey(channel);
                const isActive =
                  selectedChannel &&
                  getChannelKey(selectedChannel) === channelKey;
                const isPreviewingThisChannel =
                  previewChannel && getChannelKey(previewChannel) === channelKey;

                return (
                  <FocusableButton
                    key={channelKey}
                    focusKey={`live-channel-${index}`}
                    className={[
                      "xf-live-tv-channel-button group flex w-full items-center border text-left transition-[background-color,border-color,box-shadow,opacity] duration-150",
                      isPreviewingThisChannel
                        ? "border-xf-red/90 bg-xf-red/20 text-white shadow-lg ring-1 ring-xf-red/40"
                        : isActive
                          ? "border-white/25 bg-white/[0.08] text-white"
                          : "border-transparent bg-transparent text-xf-muted hover:text-white",
                    ].join(" ")}
                    onArrowPress={(direction) => handleChannelArrowPress(direction, index)}
                    onEnterPress={() => handleSelectChannel(channel)}
                    onClick={() => handleSelectChannel(channel)}
                  >
                    <div className="xf-live-tv-channel-logo flex shrink-0 items-center justify-center overflow-hidden border border-white/10 bg-white/10">
                      {channel.logo ? (
                        <img
                          src={channel.logo}
                          alt=""
                          className="max-h-full max-w-full object-contain"
                          loading="lazy"
                        />
                      ) : (
                        <span className="xf-live-tv-channel-logo-fallback font-bold">TV</span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <span className="xf-live-tv-channel-name block truncate font-semibold leading-snug normal-case tracking-normal">
                        {channel.name}
                      </span>
                    </div>

                    {isPreviewingThisChannel ? (
                      <span className="xf-live-tv-preview-dot relative flex shrink-0 items-center justify-center rounded-full bg-xf-red shadow-[0_0_0.7rem_rgba(229,9,20,0.9)]">
                        <span className="xf-live-tv-preview-dot-ping absolute inline-flex animate-ping rounded-full bg-xf-red/70 [animation-duration:2.4s]" />
                      </span>
                    ) : null}
                  </FocusableButton>
                );
              })
            ) : shouldShowInitialLiveTvLoading ? (
              Array.from({ length: 8 }).map((_, placeholderIndex) => (
                <div
                  key={`live-channel-loading-${placeholderIndex}`}
                  className="h-12 rounded-2xl border border-white/5 bg-white/[0.06]"
                />
              ))
            ) : null}
          </div>
        </aside>

        <section
          className={[
            "xf-live-tv-preview flex min-h-0 w-full max-w-[100vw] min-w-0 flex-col overflow-x-hidden",
            shouldUseTouchStackedLayout ? "order-1" : "order-none min-h-screen",
          ].join(" ")}
        >
          <div
            className={[
              "xf-live-tv-mobile-fixed-top w-full max-w-[100vw] overflow-x-hidden",
              shouldUseTouchStackedLayout
                ? "bg-black pt-[calc(env(safe-area-inset-top)+0.55rem)] pb-3 shadow-xl"
                : "max-w-none overflow-visible bg-transparent pt-0 pb-0 shadow-none",
            ].join(" ")}
          >
            <div
              data-xf-live-tv-mobile-top-chips="true"
              className={[
                "relative px-5 pb-3",
                shouldUseTouchStackedLayout ? "block" : "hidden",
              ].join(" ")}
            >
              <div className="grid grid-cols-3 gap-2 rounded-[1.6rem] border border-white/10 bg-white/[0.04] p-1">
                <button
                  type="button"
                  className="whitespace-nowrap rounded-[1.25rem] bg-xf-red px-2 py-2 text-[0.72rem] font-black uppercase tracking-[0.08em] text-white shadow-lg"
                  aria-current="page"
                >
                  Ao Vivo
                </button>

                <button
                  type="button"
                  className="whitespace-nowrap rounded-[1.25rem] px-2 py-2 text-[0.72rem] font-black uppercase tracking-[0.08em] text-white/75 transition hover:bg-white/10 hover:text-white"
                  onClick={() => navigate("/category/filmes")}
                >
                  Filmes
                </button>

                <button
                  type="button"
                  className="whitespace-nowrap rounded-[1.25rem] px-2 py-2 text-[0.72rem] font-black uppercase tracking-[0.08em] text-white/75 transition hover:bg-white/10 hover:text-white"
                  onClick={() => navigate("/category/series")}
                >
                  Séries
                </button>
              </div>
            </div>

            <div
              ref={previewContainerRef}
              data-xf-live-tv-mobile-preview-frame="true"
              className={[
                "xf-live-tv-preview-frame relative aspect-video overflow-hidden bg-black",
                shouldUseTouchStackedLayout
                  ? "mt-0 w-full max-w-full border-y border-black shadow-none"
                  : "ml-0 mt-0 w-full max-w-full border border-white/10 shadow-2xl",
              ].join(" ")}
            >
            <video
              ref={previewVideoRef}
              className={
                isNativeInlinePreviewActive
                  ? "hidden"
                  : "absolute inset-0 h-full w-full object-contain"
              }
              playsInline
              autoPlay
                muted={isPreviewMuted}
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
              <div className="absolute inset-0 flex items-center justify-center bg-black">
                <div className="max-w-xl p-8 text-center">
                  <p className="text-xs font-black uppercase tracking-[0.4em] text-xf-red">
                    Xandeflix Live
                  </p>

                  <h2 className="mt-4 text-3xl font-black">
                    {currentPreviewChannel?.name ?? "Selecione um canal"}
                  </h2>

                  {currentPreviewChannel ? (
                    <>
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
                    </>
                  ) : null}
                </div>
              </div>
            ) : null}
            </div>

            <div
              data-xf-live-tv-mobile-preview-controls="true"
              className={[
                "xf-live-tv-preview-mobile-controls mx-auto mt-1 w-fit max-w-[calc(100dvw-1rem)] items-center justify-center gap-2 overflow-visible px-0",
                shouldUseTouchStackedLayout ? "grid grid-cols-[auto_auto_auto]" : "hidden",
              ].join(" ")}
            >
              <button
                type="button"
                className="rounded-2xl border border-white/15 bg-black/70 px-2.5 py-2 text-[0.68rem] font-black uppercase tracking-[0.06em] text-white shadow-lg disabled:opacity-60"
                onClick={handleToggleInlinePreviewPlayback}
                disabled={!currentPreviewChannel}
              >
                {previewStatus === "playing" ? "Pausar" : "Play"}
              </button>

              <div className="contents">
                <button
                  type="button"
                  className="rounded-2xl border border-white/15 bg-black/70 px-2.5 py-2 text-[0.68rem] font-black uppercase tracking-[0.06em] text-white/85 shadow-lg"
                  onClick={() => setIsPreviewMuted((current) => !current)}
                >
                  {isPreviewMuted ? "Som" : "Mudo"}
                </button>

                <button
                  type="button"
                  className="rounded-2xl bg-xf-red px-2.5 py-2 text-[0.68rem] font-black uppercase tracking-[0.06em] text-white shadow-lg disabled:opacity-60"
                  onClick={handleOpenInlinePreviewFullscreen}
                  disabled={!currentPreviewChannel || isPreviewControlBusy}
                >
                  Fullscreen
                </button>
              </div>
            </div>

          </div>

          {currentPreviewChannel ? (
            <div
              className={[
                "xf-live-tv-preview-info bg-black/75 shadow-2xl",
                shouldUsePanelLiveTvLayout ? "block" : "hidden",
              ].join(" ")}
            >
              <h3 className="xf-live-tv-preview-title rounded-2xl bg-xf-red/20 px-4 py-3 font-black text-white">
                {currentPreviewChannel.name}
              </h3>

              <p className="mt-3 text-sm leading-relaxed text-xf-muted">
                Guia de programação indisponível no momento.
              </p>
            </div>
          ) : null}
        </section>
      </section>
    </AppShell>
  );
}
