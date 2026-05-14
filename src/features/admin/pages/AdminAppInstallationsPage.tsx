import { useEffect, useMemo, useState } from 'react';

import { AdminLayout } from '../components/AdminLayout';
import {
  listAdminAppInstallations,
  updateAdminAppInstallationStatus,
} from '../services/adminAppInstallations.service';

import type { AppInstallation } from '../types/admin.types';

const INACTIVE_AFTER_DAYS = 7;
const POSSIBLY_UNINSTALLED_AFTER_DAYS = 30;
const ALL_FILTER_VALUE = 'all';

const APP_INSTALLATION_STATUS_OPTIONS = [
  { value: ALL_FILTER_VALUE, label: 'Todos os status' },
  { value: 'activated', label: 'Ativadas' },
  { value: 'inactive', label: 'Inativas' },
  { value: 'pending_uninstall', label: 'Remoção solicitada' },
  {
    value: 'manually_marked_uninstalled',
    label: 'Marcadas como desinstaladas',
  },
  { value: 'blocked', label: 'Bloqueadas' },
] as const;

type AppInstallationStatusFilter =
  (typeof APP_INSTALLATION_STATUS_OPTIONS)[number]['value'];

function formatDate(value: string | null) {
  if (!value) {
    return 'Não informado';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function getDaysSince(value: string) {
  const diffMs = Date.now() - new Date(value).getTime();

  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

function getLastSeenLabel(value: string) {
  const diffMs = Date.now() - new Date(value).getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / (1000 * 60)));

  if (diffMinutes < 60) {
    return `sem comunicação há ${diffMinutes} min`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return `sem comunicação há ${diffHours} h`;
  }

  return `sem comunicação há ${Math.floor(diffHours / 24)} dia(s)`;
}

function getOperationalLabel(installation: AppInstallation) {
  const daysSinceLastSeen = getDaysSince(installation.last_seen_at);

  if (installation.installation_status === 'blocked') {
    return 'Bloqueada';
  }

  if (installation.installation_status === 'manually_marked_uninstalled') {
    return 'Marcada manualmente como desinstalada';
  }

  if (installation.installation_status === 'pending_uninstall') {
    return 'Remoção solicitada';
  }

  if (daysSinceLastSeen >= POSSIBLY_UNINSTALLED_AFTER_DAYS) {
    return `Possivelmente desinstalada (${getLastSeenLabel(installation.last_seen_at)})`;
  }

  if (daysSinceLastSeen >= INACTIVE_AFTER_DAYS) {
    return `Inativa (${getLastSeenLabel(installation.last_seen_at)})`;
  }

  return `${installation.installation_status} · ${getLastSeenLabel(installation.last_seen_at)}`;
}

function getStatusClassName(installation: AppInstallation) {
  const daysSinceLastSeen = getDaysSince(installation.last_seen_at);

  if (
    installation.installation_status === 'blocked' ||
    installation.installation_status === 'manually_marked_uninstalled'
  ) {
    return 'border-red-500/30 bg-red-500/10 text-red-200';
  }

  if (
    installation.installation_status === 'pending_uninstall' ||
    daysSinceLastSeen >= POSSIBLY_UNINSTALLED_AFTER_DAYS
  ) {
    return 'border-yellow-500/30 bg-yellow-500/10 text-yellow-100';
  }

  if (daysSinceLastSeen >= INACTIVE_AFTER_DAYS) {
    return 'border-orange-500/30 bg-orange-500/10 text-orange-100';
  }

  return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
}

export function AdminAppInstallationsPage() {
  const [installations, setInstallations] = useState<AppInstallation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [updatingInstallationId, setUpdatingInstallationId] = useState<string | null>(
    null,
  );
  const [statusFilter, setStatusFilter] =
    useState<AppInstallationStatusFilter>(ALL_FILTER_VALUE);
  const [platformFilter, setPlatformFilter] = useState(ALL_FILTER_VALUE);
  const [searchTerm, setSearchTerm] = useState('');


  async function loadInstallations() {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const data = await listAdminAppInstallations();

      setInstallations(data);
    } catch {
      setErrorMessage('Não foi possível carregar as instalações do aplicativo.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadInstallations();
  }, []);

  async function handleBlockInstallation(installation: AppInstallation) {
    const confirmed = window.confirm(
      `Deseja bloquear a instalação ${installation.device_identifier}? Esta ação impedirá o uso técnico desta instalação.`,
    );

    if (!confirmed) {
      return;
    }

    setActionMessage(null);
    setErrorMessage(null);
    setUpdatingInstallationId(installation.id);

    try {
      await updateAdminAppInstallationStatus({
        installationId: installation.id,
        status: 'blocked',
      });

      setActionMessage('Instalação bloqueada com sucesso.');
      await loadInstallations();
    } catch {
      setErrorMessage('Não foi possível bloquear a instalação.');
    } finally {
      setUpdatingInstallationId(null);
    }
  }

  async function handleUnblockInstallation(installation: AppInstallation) {
    const confirmed = window.confirm(
      `Deseja desbloquear a instalação ${installation.device_identifier}? Ela voltará para o status inativo e poderá ser regularizada pelo fluxo do app.`,
    );

    if (!confirmed) {
      return;
    }

    setActionMessage(null);
    setErrorMessage(null);
    setUpdatingInstallationId(installation.id);

    try {
      await updateAdminAppInstallationStatus({
        installationId: installation.id,
        status: 'inactive',
      });

      setActionMessage('Instalação desbloqueada com sucesso.');
      await loadInstallations();
    } catch {
      setErrorMessage('Não foi possível desbloquear a instalação.');
    } finally {
      setUpdatingInstallationId(null);
    }
  }

  async function handleRequestRemoval(installation: AppInstallation) {
    const confirmed = window.confirm(
      `Deseja solicitar a remoção da instalação ${installation.device_identifier}? O status ficará pendente de remoção até validação operacional.`,
    );

    if (!confirmed) {
      return;
    }

    setActionMessage(null);
    setErrorMessage(null);
    setUpdatingInstallationId(installation.id);

    try {
      await updateAdminAppInstallationStatus({
        installationId: installation.id,
        status: 'pending_uninstall',
      });

      setActionMessage('Solicitação de remoção registrada com sucesso.');
      await loadInstallations();
    } catch {
      setErrorMessage('Não foi possível solicitar a remoção da instalação.');
    } finally {
      setUpdatingInstallationId(null);
    }
  }

  async function handleMarkManuallyUninstalled(installation: AppInstallation) {
    const confirmed = window.confirm(
      `Deseja marcar a instalação ${installation.device_identifier} como desinstalada manualmente? Esta ação registra uma baixa operacional sem afirmar desinstalação automática pelo aparelho.`,
    );

    if (!confirmed) {
      return;
    }

    setActionMessage(null);
    setErrorMessage(null);
    setUpdatingInstallationId(installation.id);

    try {
      await updateAdminAppInstallationStatus({
        installationId: installation.id,
        status: 'manually_marked_uninstalled',
      });

      setActionMessage('Instalação marcada manualmente como desinstalada.');
      await loadInstallations();
    } catch {
      setErrorMessage('Não foi possível marcar a instalação como desinstalada.');
    } finally {
      setUpdatingInstallationId(null);
    }
  }

  async function handleReactivateInstallation(installation: AppInstallation) {
    const confirmed = window.confirm(
      `Deseja reativar a instalação ${installation.device_identifier}? Ela voltará para o status inativo até comunicar novamente pelo app.`,
    );

    if (!confirmed) {
      return;
    }

    setActionMessage(null);
    setErrorMessage(null);
    setUpdatingInstallationId(installation.id);

    try {
      await updateAdminAppInstallationStatus({
        installationId: installation.id,
        status: 'inactive',
      });

      setActionMessage('Instalação reativada operacionalmente.');
      await loadInstallations();
    } catch {
      setErrorMessage('Não foi possível reativar a instalação.');
    } finally {
      setUpdatingInstallationId(null);
    }
  }

  const summary = useMemo(() => {
    return installations.reduce(
      (acc, installation) => {
        const daysSinceLastSeen = getDaysSince(installation.last_seen_at);

        acc.total += 1;

        if (daysSinceLastSeen >= POSSIBLY_UNINSTALLED_AFTER_DAYS) {
          acc.possiblyUninstalled += 1;
        } else if (daysSinceLastSeen >= INACTIVE_AFTER_DAYS) {
          acc.inactive += 1;
        } else {
          acc.communicating += 1;
        }

        return acc;
      },
      {
        total: 0,
        communicating: 0,
        inactive: 0,
        possiblyUninstalled: 0,
      },
    );
  }, [installations]);

  const platformOptions = useMemo(() => {
    return Array.from(
      new Set(
        installations
          .map((installation) => installation.platform?.trim())
          .filter((platform): platform is string => Boolean(platform)),
      ),
    ).sort((currentPlatform, nextPlatform) =>
      currentPlatform.localeCompare(nextPlatform, 'pt-BR'),
    );
  }, [installations]);

  const normalizedSearchTerm = searchTerm.trim().toLowerCase();

  const filteredInstallations = useMemo(() => {
    return installations.filter((installation) => {
      const matchesStatus =
        statusFilter === ALL_FILTER_VALUE ||
        installation.installation_status === statusFilter;

      const matchesPlatform =
        platformFilter === ALL_FILTER_VALUE ||
        installation.platform?.trim() === platformFilter;

      const searchableContent = [
        installation.device_identifier,
        installation.linked_license_id,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      const matchesSearch =
        normalizedSearchTerm.length === 0 ||
        searchableContent.includes(normalizedSearchTerm);

      return matchesStatus && matchesPlatform && matchesSearch;
    });
  }, [installations, normalizedSearchTerm, platformFilter, statusFilter]);

  const hasActiveFilters =
    statusFilter !== ALL_FILTER_VALUE ||
    platformFilter !== ALL_FILTER_VALUE ||
    normalizedSearchTerm.length > 0;

  return (
    <AdminLayout>
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-xf-muted">
              Super Admin
            </p>
            <h1 className="mt-3 text-4xl font-black tracking-tight">
              Instalações do app
            </h1>
            <p className="mt-3 max-w-4xl text-base text-xf-muted">
              Registro técnico de instalações detectadas por device_identifier,
              heartbeat e última comunicação. O sistema não afirma desinstalação
              real sem evidência; instalações antigas são classificadas como
              inativas ou possivelmente desinstaladas.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadInstallations()}
            disabled={isLoading}
            className="rounded-xl bg-white/10 px-4 py-3 text-sm font-black text-white transition hover:bg-white/20 disabled:opacity-60"
          >
            {isLoading ? 'Atualizando...' : 'Atualizar'}
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <article className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm font-bold text-xf-muted">Total</p>
            <p className="mt-2 text-3xl font-black text-white">{summary.total}</p>
          </article>

          <article className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-5">
            <p className="text-sm font-bold text-emerald-200">Comunicando</p>
            <p className="mt-2 text-3xl font-black text-white">
              {summary.communicating}
            </p>
          </article>

          <article className="rounded-2xl border border-orange-500/20 bg-orange-500/10 p-5">
            <p className="text-sm font-bold text-orange-100">Inativas</p>
            <p className="mt-2 text-3xl font-black text-white">{summary.inactive}</p>
          </article>

          <article className="rounded-2xl border border-yellow-500/20 bg-yellow-500/10 p-5">
            <p className="text-sm font-bold text-yellow-100">
              Possivelmente desinstaladas
            </p>
            <p className="mt-2 text-3xl font-black text-white">
              {summary.possiblyUninstalled}
            </p>
          </article>
        </div>

        {actionMessage ? (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm font-semibold text-emerald-100">
            {actionMessage}
          </div>
        ) : null}

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
            <label className="flex flex-1 flex-col gap-2 text-sm font-bold text-white">
              Buscar instalação
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Device ID ou licença"
                className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-semibold text-white outline-none transition placeholder:text-xf-muted focus:border-white/30"
              />
            </label>

            <label className="flex flex-col gap-2 text-sm font-bold text-white lg:w-64">
              Status
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(
                    event.target.value as AppInstallationStatusFilter,
                  )
                }
                className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-semibold text-white outline-none transition focus:border-white/30"
              >
                {APP_INSTALLATION_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-2 text-sm font-bold text-white lg:w-64">
              Plataforma
              <select
                value={platformFilter}
                onChange={(event) => setPlatformFilter(event.target.value)}
                className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-semibold text-white outline-none transition focus:border-white/30"
              >
                <option value={ALL_FILTER_VALUE}>Todas as plataformas</option>
                {platformOptions.map((platform) => (
                  <option key={platform} value={platform}>
                    {platform}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setStatusFilter(ALL_FILTER_VALUE);
                setPlatformFilter(ALL_FILTER_VALUE);
              }}
              disabled={!hasActiveFilters}
              className="rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-black text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Limpar filtros
            </button>
          </div>

          <p className="mt-4 text-sm font-semibold text-xf-muted">
            Exibindo {filteredInstallations.length} de {installations.length}{' '}
            instalação(ões).
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
          {isLoading ? (
            <div className="p-6 text-sm text-xf-muted">
              Carregando instalações detectadas...
            </div>
          ) : errorMessage ? (
            <div className="p-6 text-sm text-red-300">{errorMessage}</div>
          ) : installations.length === 0 ? (
            <div className="p-6 text-sm text-xf-muted">
              Nenhuma instalação registrada até o momento.
            </div>
          ) : filteredInstallations.length === 0 ? (
            <div className="p-6 text-sm text-xf-muted">
              Nenhuma instalação encontrada para os filtros aplicados.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1200px] text-left text-sm">
                <thead className="border-b border-white/10 bg-black/20 text-xs uppercase tracking-[0.2em] text-xf-muted">
                  <tr>
                    <th className="px-5 py-4 font-semibold">Status</th>
                    <th className="px-5 py-4 font-semibold">Device ID</th>
                    <th className="px-5 py-4 font-semibold">Plataforma</th>
                    <th className="px-5 py-4 font-semibold">App</th>
                    <th className="px-5 py-4 font-semibold">Primeiro acesso</th>
                    <th className="px-5 py-4 font-semibold">Última comunicação</th>
                    <th className="px-5 py-4 font-semibold">Licença</th>
                    <th className="px-5 py-4 font-semibold">Ações</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredInstallations.map((installation) => (
                    <tr
                      key={installation.id}
                      className="border-b border-white/5 last:border-0"
                    >
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex max-w-[260px] rounded-full border px-3 py-1 text-xs font-black ${getStatusClassName(
                            installation,
                          )}`}
                        >
                          {getOperationalLabel(installation)}
                        </span>
                      </td>

                      <td className="max-w-[260px] truncate px-5 py-4 font-mono text-xs text-white">
                        {installation.device_identifier}
                      </td>

                      <td className="px-5 py-4 text-xf-muted">
                        <p className="font-semibold text-white">
                          {installation.platform ?? 'Não informado'}
                        </p>
                        <p className="mt-1 text-xs">
                          {installation.manufacturer ?? 'sem fabricante'} ·{' '}
                          {installation.model ?? 'sem modelo'}
                        </p>
                      </td>

                      <td className="px-5 py-4 text-xf-muted">
                        {installation.app_version ?? 'Não informado'}
                      </td>

                      <td className="px-5 py-4 text-xf-muted">
                        {formatDate(installation.first_seen_at)}
                      </td>

                      <td className="px-5 py-4 text-xf-muted">
                        <p>{formatDate(installation.last_seen_at)}</p>
                        <p className="mt-1 text-xs">
                          {getLastSeenLabel(installation.last_seen_at)}
                        </p>
                      </td>

                      <td className="max-w-[220px] truncate px-5 py-4 text-xf-muted">
                        {installation.linked_license_id ?? 'Não vinculada'}
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-2">
                          {installation.installation_status === 'blocked' ? (
                            <button
                              type="button"
                              onClick={() => void handleUnblockInstallation(installation)}
                              disabled={updatingInstallationId === installation.id}
                              className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-black text-emerald-100 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {updatingInstallationId === installation.id
                                ? 'Desbloqueando...'
                                : 'Desbloquear'}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void handleBlockInstallation(installation)}
                              disabled={
                                installation.installation_status ===
                                  'manually_marked_uninstalled' ||
                                updatingInstallationId === installation.id
                              }
                              className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-black text-red-100 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {updatingInstallationId === installation.id
                                ? 'Bloqueando...'
                                : 'Bloquear'}
                            </button>
                          )}

                          {installation.installation_status ===
                          'pending_uninstall' ? (
                            <button
                              type="button"
                              onClick={() =>
                                void handleMarkManuallyUninstalled(installation)
                              }
                              disabled={updatingInstallationId === installation.id}
                              className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs font-black text-yellow-100 transition hover:bg-yellow-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {updatingInstallationId === installation.id
                                ? 'Confirmando...'
                                : 'Confirmar remoção'}
                            </button>
                          ) : installation.installation_status ===
                            'manually_marked_uninstalled' ? (
                            <button
                              type="button"
                              onClick={() => void handleReactivateInstallation(installation)}
                              disabled={updatingInstallationId === installation.id}
                              className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-black text-emerald-100 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {updatingInstallationId === installation.id
                                ? 'Reativando...'
                                : 'Reativar'}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                void handleRequestRemoval(installation)
                              }
                              disabled={updatingInstallationId === installation.id}
                              className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs font-black text-yellow-100 transition hover:bg-yellow-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {updatingInstallationId === installation.id
                                ? 'Solicitando...'
                                : 'Solicitar remoção'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </AdminLayout>
  );
}
