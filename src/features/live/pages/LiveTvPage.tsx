import { useCallback, useEffect, useMemo, useState } from "react";
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
  return channel.groupTitle?.trim() || "Sem grupo";
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

export default function LiveTvPage() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
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
  const [hasRequestedSource, setHasRequestedSource] = useState(false);

  useEffect(() => {
    if (
      hasRequestedSource ||
      status === "loading" ||
      status === "ready" ||
      channels.length > 0
    ) {
      return;
    }

    setHasRequestedSource(true);
    setSourceLoadError(null);

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
  }, [channels.length, hasRequestedSource, loadFromSource, status]);

  const groups = useMemo<ChannelGroup[]>(() => {
    const groupMap = new Map<string, number>();

    for (const channel of channels) {
      const groupName = getChannelGroupName(channel);
      groupMap.set(groupName, (groupMap.get(groupName) ?? 0) + 1);
    }

    return Array.from(groupMap.entries()).map(([name, count]) => ({
      name,
      count,
    }));
  }, [channels]);

  const activeGroupName = selectedGroupName ?? groups[0]?.name ?? null;

  useEffect(() => {
    if (!selectedGroupName && groups[0]?.name) {
      setSelectedGroupName(groups[0].name);
    }
  }, [groups, selectedGroupName]);

  const activeGroupChannels = useMemo(() => {
    if (!activeGroupName) {
      return [];
    }

    return channels
      .filter((channel) => getChannelGroupName(channel) === activeGroupName)
      .slice(0, MAX_VISIBLE_CHANNELS_PER_GROUP);
  }, [activeGroupName, channels]);

  const handleSelectGroup = useCallback((groupName: string) => {
    setSelectedGroupName(groupName);
  }, []);

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
    <AppShell userEmail={user?.email} onSignOut={() => void signOut()}>
      <section className="xf-live-tv-layout grid min-h-[calc(100vh-7rem)] gap-4 text-white">
        <aside className="rounded-2xl border border-white/10 bg-black/70 p-3">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-xf-red">
            Grupos
          </p>

          <div className="mt-5 max-h-[70vh] space-y-2 overflow-y-auto pr-1">
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
                {isLoading ? "Carregando grupos..." : "Nenhum grupo carregado."}
              </p>
            )}
          </div>
        </aside>

        <aside className="rounded-2xl border border-white/10 bg-black/70 p-3">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-xf-red">
            Canais
          </p>

          <h1 className="mt-3 truncate text-2xl font-black">
            {activeGroupName ?? "Canais ao vivo"}
          </h1>

          <div className="mt-5 max-h-[70vh] space-y-2 overflow-y-auto pr-1">
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
                      "flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left",
                      isActive
                        ? "border-xf-red bg-xf-red/15 text-white"
                        : "border-white/5 bg-white/5 text-xf-muted hover:text-white",
                    ].join(" ")}
                    onEnterPress={() => handleSelectChannel(channel)}
                    onClick={() => handleSelectChannel(channel)}
                  >
                    <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/10">
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
                      <span className="block truncate text-base font-black">
                        {channel.name}
                      </span>
                      <span className="mt-1 block truncate text-xs text-xf-muted">
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

        <section className="flex min-w-0 flex-col gap-4">
          <div className="relative aspect-video overflow-hidden rounded-3xl border border-white/10 bg-zinc-950">
            <div className="absolute inset-0 flex items-center justify-center bg-black">
              <div className="max-w-xl rounded-3xl border border-white/10 bg-zinc-950/95 p-8 text-center">
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
            <p className="text-xs font-black uppercase tracking-[0.35em] text-xf-red">
              Canal ativo
            </p>
            <h2 className="mt-2 text-2xl font-black">
              {selectedChannel?.name ?? "Nenhum canal selecionado"}
            </h2>
            <p className="mt-2 text-sm text-xf-muted">
              {selectedChannel?.groupTitle ??
                "Escolha um grupo e selecione um canal."}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/70 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.35em] text-xf-red">
                  Guia de programação
                </p>
                <h3 className="mt-2 text-2xl font-black">
                  {selectedChannel?.tvgName ?? selectedChannel?.name ?? "EPG"}
                </h3>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-xf-muted">
              A estrutura visual do guia está pronta. A integração real depende
              de uma URL XMLTV/EPG cadastrada no backend/admin e retornada junto
              da fonte autorizada.
            </div>
          </div>
        </section>
      </section>
    </AppShell>
  );
}
