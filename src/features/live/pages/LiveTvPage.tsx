import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { App } from "@capacitor/app";
import { setFocus } from "@noriginmedia/norigin-spatial-navigation";
import { useNavigate } from "react-router-dom";

import { useAuth } from "@/app/providers/AuthProvider";
import { AppShell } from "@/components/layout/AppShell";
import { FocusableButton } from "@/components/tv/FocusableButton";
import { getStoredLicenseActivation } from "@/features/licensing/lib/licenseActivationStorage";
import { getOrCreateDeviceIdentifier } from "@/features/playlists/lib/deviceIdentifier";
import {
  getAuthorizedIptvSource,
  mapAuthorizedIptvSourceToPlaylistSource,
} from "@/features/playlists/services/authorizedIptvSource.service";
import { usePlaylistRuntime } from "@/features/playlists/providers/PlaylistRuntimeProvider";
import type { IptvChannel } from "@/features/playlists/types/playlist";

const MAX_VISIBLE_CHANNELS_PER_GROUP = 160;

type ChannelGroup = {
  name: string;
  count: number;
};

function getChannelGroupName(channel: IptvChannel) {
  const groupTitle = channel.groupTitle?.trim();

  if (!groupTitle) {
    return "Sem grupo";
  }

  return groupTitle.replace(/^canais\s*\|\s*/i, "").trim() || groupTitle;
}

function getChannelKey(channel: IptvChannel) {
  return `${channel.id}:${channel.url}`;
}

function isLiveTvChannel(channel: IptvChannel) {
  const groupName = getChannelGroupName(channel).toLowerCase();

  return ![
    "filmes",
    "filme",
    "movies",
    "movie",
    "series",
    "séries",
    "serie",
    "série",
    "novelas",
    "documentarios",
    "documentários",
  ].some((blockedTerm) => groupName.includes(blockedTerm));
}

function getProgressLabel(phase?: string) {
  if (phase === "downloading") return "Baixando lista";
  if (phase === "parsing") return "Processando canais";
  if (phase === "finalizing") return "Finalizando";
  return "Carregando";
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
    selectChannel,
  } = usePlaylistRuntime();

  const [selectedGroupName, setSelectedGroupName] = useState<string | null>(
    null,
  );
  const [sourceLoadError, setSourceLoadError] = useState<string | null>(null);
  const hasRequestedSourceRef = useRef(false);

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
    if (
      hasRequestedSourceRef.current ||
      status === "loading" ||
      status === "ready" ||
      channels.length > 0
    ) {
      return;
    }

    hasRequestedSourceRef.current = true;

    void (async () => {
      try {
        const deviceIdentifier = getOrCreateDeviceIdentifier();
        const storedActivation = getStoredLicenseActivation();

        const authorizedSource = await getAuthorizedIptvSource({
          deviceIdentifier,
          licenseCode: storedActivation?.licenseCode,
        });

        await loadFromSource(
          mapAuthorizedIptvSourceToPlaylistSource(authorizedSource),
        );
      } catch (loadError) {
        setSourceLoadError(
          loadError instanceof Error
            ? loadError.message
            : "Não foi possível carregar os canais ao vivo.",
        );
      }
    })();
  }, [channels.length, loadFromSource, status]);

  const liveTvChannels = useMemo(() => {
    return channels.filter(isLiveTvChannel);
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

  const handleSelectChannel = useCallback(
    (channel: IptvChannel) => {
      const isSameChannel =
        selectedChannel &&
        getChannelKey(selectedChannel) === getChannelKey(channel);

      if (isSameChannel) {
        const params = new URLSearchParams({
          src: channel.url,
          title: channel.name,
        });

        navigate(`/player?${params.toString()}`);
        return;
      }

      selectChannel(channel);
    },
    [navigate, selectChannel, selectedChannel],
  );

  const isLoading = status === "loading";
  const userFacingError = sourceLoadError ?? error;

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
              <p className="text-sm text-xf-muted">
                {isLoading
                    ? "Carregando lista autorizada de canais. Aguarde alguns instantes..."
                    : "Nenhum grupo carregado."}
              </p>
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
                const isActive =
                  selectedChannel &&
                  getChannelKey(selectedChannel) === getChannelKey(channel);

                return (
                  <FocusableButton
                    key={getChannelKey(channel)}
                    focusKey={`live-channel-${index}`}
                    className={[
                      "flex w-full items-center gap-2 rounded-2xl border px-4 py-2 text-left text-sm font-black uppercase tracking-wide",
                      isActive
                        ? "border-xf-red bg-xf-red/15 text-white"
                        : "border-white/5 bg-white/5 text-xf-muted hover:text-white",
                    ].join(" ")}
                    onArrowPress={(direction) => handleChannelArrowPress(direction, index)}
                    onEnterPress={() => handleSelectChannel(channel)}
                    onClick={() => handleSelectChannel(channel)}
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
                        {isActive
                          ? "Clique novamente para abrir em tela cheia"
                          : channel.tvgName || "Clique para selecionar"}
                      </span>
                    </div>
                  </FocusableButton>
                );
              })
            ) : (
              <p className="text-sm text-xf-muted">
                {isLoading
                  ? "Carregando canais..."
                  : "Nenhum canal neste grupo."}
              </p>
            )}
          </div>
        </aside>

        <section className="xf-live-tv-preview flex min-h-[calc(100vh-2rem)] min-w-0 flex-col gap-4 md:pl-4">
          <div className="relative aspect-video overflow-hidden bg-zinc-950">
            <div className="absolute inset-0 flex items-center justify-center bg-black">
              <div className="h-full w-full bg-zinc-950/95 p-8 text-center">
                <p className="text-xs font-black uppercase tracking-[0.4em] text-xf-red">
                  Xandeflix Live
                </p>

                <h2 className="mt-4 text-2xl font-black">
                  {selectedChannel?.name ?? "Selecione um canal"}
                </h2>

                <p className="mt-3 text-sm text-xf-muted">
                  A prévia inline MPEG-TS será ativada no próximo ciclo de forma
                  controlada. Por enquanto, clique novamente no mesmo canal para
                  abrir em tela cheia.
                </p>

                {isLoading && progress ? (
                  <p className="mt-5 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-xf-muted">
                    {getProgressLabel(progress.phase)} ·{" "}
                    {progress.channelsParsed} canais processados
                  </p>
                ) : null}

                {userFacingError ? (
                  <p className="mt-5 rounded-xl border border-yellow-500/40 bg-yellow-950/70 px-4 py-3 text-sm text-yellow-100">
                    {userFacingError}
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/70 p-4">
            <p className="text-xs font-black uppercase tracking-[0.35em] text-white">
              Canal ativo
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

