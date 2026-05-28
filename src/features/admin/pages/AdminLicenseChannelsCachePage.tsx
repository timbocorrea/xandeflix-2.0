import { useEffect, useMemo, useState } from 'react';

import { AdminLayout } from '../components/AdminLayout';

import {
  listAdminLicenseChannelsCache,
  updateAdminLicenseChannelStatus,
  type AdminLicenseChannelCacheItem,
} from '../services';

const PAGE_SIZE = 25;

type ChannelStatusFilter = 'all' | 'active' | 'inactive';

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Não informado';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));
}

function getChannelStatusLabel(channel: AdminLicenseChannelCacheItem) {
  if (channel.is_active) {
    return {
      label: 'Ativo',
      className:
        'rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-200',
    };
  }

  return {
    label: 'Inativo',
    className:
      'rounded-full bg-zinc-500/20 px-3 py-1 text-xs font-bold text-zinc-200',
  };
}

function getListErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return 'Não foi possível carregar os canais importados.';
  }

  const messages: Record<string, string> = {
    UNAUTHORIZED: 'Sessão administrativa inválida. Faça login novamente.',
    FORBIDDEN: 'Você não tem permissão para visualizar estes canais.',
    LIST_LICENSE_CHANNELS_CACHE_FAILED:
      'Não foi possível carregar os canais importados.',
  };

  return messages[error.message] ?? error.message;
}

function getUpdateErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return 'Não foi possível atualizar o status do canal.';
  }

  const messages: Record<string, string> = {
    UNAUTHORIZED: 'Sessão administrativa inválida. Faça login novamente.',
    FORBIDDEN: 'Você não tem permissão para gerenciar este canal.',
    INVALID_PAYLOAD: 'Dados inválidos para atualizar o canal.',
    LICENSE_CHANNEL_NOT_FOUND: 'Canal importado não localizado.',
    LICENSE_NOT_FOUND: 'Licença vinculada ao canal não localizada.',
    'supabase-content-writes-disabled':
      'Escritas de conteúdo no Supabase estão desabilitadas pelo modo local.',
    LICENSE_CHANNEL_STATUS_UPDATE_FAILED:
      'Não foi possível atualizar o status do canal.',
  };

  return messages[error.message] ?? error.message;
}

export function AdminLicenseChannelsCachePage() {
  const [channels, setChannels] = useState<AdminLicenseChannelCacheItem[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [groupTitle, setGroupTitle] = useState('');
  const [statusFilter, setStatusFilter] = useState<ChannelStatusFilter>('all');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [updatingChannelId, setUpdatingChannelId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null);

  const activeCount = useMemo(
    () => channels.filter((channel) => channel.is_active).length,
    [channels],
  );

  const inactiveCount = useMemo(
    () => channels.filter((channel) => !channel.is_active).length,
    [channels],
  );

  const sourceCount = useMemo(
    () =>
      new Set(channels.map((channel) => channel.license_iptv_source_id)).size,
    [channels],
  );

  async function loadChannels(options?: { silent?: boolean; nextPage?: number }) {
    try {
      if (options?.silent) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      setErrorMessage(null);
      setSuccessMessage(null);

      const selectedPage = options?.nextPage ?? page;
      const selectedStatus =
        statusFilter === 'all' ? null : statusFilter === 'active';

      const result = await listAdminLicenseChannelsCache({
        page: selectedPage,
        pageSize: PAGE_SIZE,
        search,
        groupTitle: groupTitle || null,
        isActive: selectedStatus,
      });

      setChannels(result.channels);
      setGroups(result.groups);
      setTotalCount(result.totalCount);
      setTotalPages(result.totalPages);
      setPage(result.page);
      setLastLoadedAt(new Date().toISOString());
    } catch (error) {
      setErrorMessage(getListErrorMessage(error));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setSuccessMessage(null);
      setPage(1);
      setSearch(searchInput.trim());
    }, 400);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [searchInput]);

  useEffect(() => {
    void loadChannels({ nextPage: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, groupTitle, statusFilter]);

  function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccessMessage(null);
    setPage(1);
    setSearch(searchInput.trim());
  }

  function handleClearFilters() {
    setSearchInput('');
    setSearch('');
    setGroupTitle('');
    setStatusFilter('all');
    setSuccessMessage(null);
    setPage(1);
  }

  function handleChangePage(nextPage: number) {
    if (nextPage < 1 || (totalPages > 0 && nextPage > totalPages)) {
      return;
    }

    setPage(nextPage);
    setSuccessMessage(null);
    void loadChannels({ silent: true, nextPage });
  }

  async function handleUpdateChannelStatus(channel: AdminLicenseChannelCacheItem) {
    const nextIsActive = !channel.is_active;
    const actionLabel = nextIsActive ? 'ativar' : 'desativar';
    const confirmed = window.confirm(
      `Deseja ${actionLabel} o canal "${channel.name}"?`,
    );

    if (!confirmed) {
      return;
    }

    try {
      setUpdatingChannelId(channel.id);
      setErrorMessage(null);
      setSuccessMessage(null);

      await updateAdminLicenseChannelStatus({
        channelId: channel.id,
        isActive: nextIsActive,
      });

      await loadChannels({ silent: true });
      setSuccessMessage(
        nextIsActive
          ? `Canal "${channel.name}" ativado com sucesso.`
          : `Canal "${channel.name}" desativado com sucesso.`,
      );
    } catch (error) {
      setErrorMessage(getUpdateErrorMessage(error));
    } finally {
      setUpdatingChannelId(null);
    }
  }

  return (
    <AdminLayout>
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-xf-muted">
              Administração
            </p>

            <h1 className="mt-3 text-4xl font-black tracking-tight">
              Canais importados
            </h1>

            <p className="mt-3 max-w-3xl text-base text-xf-muted">
              Visualização dos canais gravados em cache por licença e fonte IPTV.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadChannels({ silent: true })}
            disabled={isLoading || isRefreshing}
            className="rounded-xl bg-white/10 px-5 py-3 text-sm font-black text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRefreshing ? 'Atualizando...' : 'Atualizar agora'}
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <article className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-xf-muted">
              Total filtrado
            </p>
            <p className="mt-2 text-3xl font-black">{totalCount}</p>
          </article>

          <article className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-xf-muted">
              Nesta página
            </p>
            <p className="mt-2 text-3xl font-black">{channels.length}</p>
          </article>

          <article className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-xf-muted">
              Fontes
            </p>
            <p className="mt-2 text-3xl font-black">{sourceCount}</p>
          </article>

          <article className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-xf-muted">
              Ativos/Inativos
            </p>
            <p className="mt-2 text-3xl font-black">
              {activeCount}/{inactiveCount}
            </p>
          </article>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <form
            onSubmit={handleSearchSubmit}
            className="grid gap-4 lg:grid-cols-[1.4fr_1fr_0.8fr_auto_auto]"
          >
            <label className="flex flex-col gap-2">
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-xf-muted">
                Busca
              </span>
              <input
                type="search"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Nome, TVG ID ou URL"
                title="A busca é aplicada automaticamente enquanto você digita."
                className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition placeholder:text-xf-muted focus:border-white/30"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-xf-muted">
                Grupo
              </span>
              <select
                value={groupTitle}
                onChange={(event) => {
                  setPage(1);
                  setGroupTitle(event.target.value);
                }}
                className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition focus:border-white/30"
              >
                <option value="">Todos os grupos</option>
                {groups.map((group) => (
                  <option key={group} value={group}>
                    {group}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-xf-muted">
                Status
              </span>
              <select
                value={statusFilter}
                onChange={(event) => {
                  setPage(1);
                  setStatusFilter(event.target.value as ChannelStatusFilter);
                }}
                className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition focus:border-white/30"
              >
                <option value="all">Todos</option>
                <option value="active">Ativos</option>
                <option value="inactive">Inativos</option>
              </select>
            </label>

            <button
              type="submit"
              className="self-end rounded-xl bg-white px-5 py-3 text-sm font-black text-black transition hover:bg-zinc-200"
            >
              {isRefreshing ? 'Buscando...' : 'Buscar'}
            </button>

            <button
              type="button"
              onClick={handleClearFilters}
              className="self-end rounded-xl bg-white/10 px-5 py-3 text-sm font-black text-white transition hover:bg-white/20"
            >
              Limpar
            </button>
          </form>
        </div>

        {errorMessage ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
            {errorMessage}
          </div>
        ) : null}

        {successMessage ? (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-200">
            {successMessage}
          </div>
        ) : null}

        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
          <div className="flex flex-col gap-2 border-b border-white/10 bg-black/20 px-5 py-4 md:flex-row md:items-center md:justify-between">
            <p className="text-sm font-bold text-white">
              Cache administrativo de canais
            </p>

            <p className="text-xs text-xf-muted">
              {lastLoadedAt ? formatDateTime(lastLoadedAt) : 'Ainda não atualizado'}
            </p>
          </div>

          {isLoading ? (
            <div className="p-6 text-sm text-xf-muted">
              Carregando canais importados...
            </div>
          ) : channels.length === 0 ? (
            <div className="p-6 text-sm text-xf-muted">
              Nenhum canal importado encontrado para os filtros atuais.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1280px] text-left text-sm">
                <thead className="border-b border-white/10 bg-black/20 text-xs uppercase tracking-[0.2em] text-xf-muted">
                  <tr>
                    <th className="px-5 py-4 font-semibold">Canal</th>
                    <th className="px-5 py-4 font-semibold">Grupo</th>
                    <th className="px-5 py-4 font-semibold">Licença</th>
                    <th className="px-5 py-4 font-semibold">Fonte</th>
                    <th className="px-5 py-4 font-semibold">TVG ID</th>
                    <th className="px-5 py-4 font-semibold">Status</th>
                    <th className="px-5 py-4 font-semibold">Importado em</th>
                    <th className="px-5 py-4 font-semibold">Atualizado em</th>
                    <th className="px-5 py-4 font-semibold">Ações</th>
                  </tr>
                </thead>

                <tbody>
                  {channels.map((channel) => {
                    const status = getChannelStatusLabel(channel);

                    return (
                      <tr
                        key={channel.id}
                        className="border-b border-white/5 last:border-0"
                      >
                        <td className="px-5 py-4">
                          <p className="font-bold text-white">{channel.name}</p>
                          <p className="mt-1 max-w-sm truncate text-xs text-xf-muted">
                            {channel.stream_url}
                          </p>
                        </td>

                        <td className="px-5 py-4 text-xf-muted">
                          {channel.group_title ?? 'Sem grupo'}
                        </td>

                        <td className="px-5 py-4">
                          <p className="font-bold text-white">
                            {channel.license?.license_code ?? 'Licença não localizada'}
                          </p>
                          <p className="mt-1 text-xs text-xf-muted">
                            {channel.license?.label ?? 'Sem nome interno'}
                          </p>
                        </td>

                        <td className="px-5 py-4">
                          <p className="font-bold text-white">
                            {channel.source?.name ?? 'Fonte não localizada'}
                          </p>
                          <p className="mt-1 text-xs uppercase text-xf-muted">
                            {channel.source?.type ?? 'sem tipo'}
                          </p>
                        </td>

                        <td className="px-5 py-4 text-xf-muted">
                          {channel.tvg_id ?? 'Não informado'}
                        </td>

                        <td className="px-5 py-4">
                          <span className={status.className}>{status.label}</span>
                        </td>

                        <td className="px-5 py-4 text-xf-muted">
                          {formatDateTime(channel.last_imported_at)}
                        </td>

                        <td className="px-5 py-4 text-xf-muted">
                          {formatDateTime(channel.updated_at)}
                        </td>

                        <td className="px-5 py-4">
                          <button
                            type="button"
                            onClick={() => void handleUpdateChannelStatus(channel)}
                            disabled={
                              isLoading ||
                              isRefreshing ||
                              updatingChannelId !== null
                            }
                            className="rounded-xl bg-white/10 px-4 py-2 text-xs font-bold text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {updatingChannelId === channel.id
                              ? channel.is_active
                                ? 'Desativando...'
                                : 'Ativando...'
                              : channel.is_active
                                ? 'Desativar'
                                : 'Ativar'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-white/10 px-5 py-4 md:flex-row md:items-center md:justify-between">
            <p className="text-xs text-xf-muted">
              Página {page} de {Math.max(totalPages, 1)} — {totalCount} resultado(s)
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleChangePage(page - 1)}
                disabled={page <= 1 || isLoading || isRefreshing}
                className="rounded-xl bg-white/10 px-4 py-2 text-sm font-bold text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Anterior
              </button>

              <button
                type="button"
                onClick={() => handleChangePage(page + 1)}
                disabled={
                  totalPages === 0 || page >= totalPages || isLoading || isRefreshing
                }
                className="rounded-xl bg-white/10 px-4 py-2 text-sm font-bold text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Próxima
              </button>
            </div>
          </div>
        </div>
      </section>
    </AdminLayout>
  );
}
