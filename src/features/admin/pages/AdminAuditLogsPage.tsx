import { useEffect, useMemo, useState } from 'react';

import { AdminLayout } from '../components/AdminLayout';
import { listAdminAuditLogs, type ListAdminAuditLogsFilters } from '../services';
import type { AuditLog } from '../types/admin.types';

const licenseImportAuditAction = 'license_iptv_source_channels_imported';

const auditActionLabels: Record<string, string> = {
  admin_user_created: 'Administrador criado',
  admin_user_activated: 'Administrador ativado',
  admin_user_deactivated: 'Administrador desativado',
  client_suspended: 'Cliente suspenso',
  client_reactivated: 'Cliente reativado',
  client_updated: 'Cliente atualizado',
  license_created: 'Licença criada',
  license_updated: 'Licença atualizada',
  license_expired: 'Licença expirada',
  license_reactivated: 'Licença reativada',
  license_cancelled: 'Licença cancelada',
  license_channel_manually_activated: 'Canal ativado manualmente',
  license_channel_manually_deactivated: 'Canal desativado manualmente',
  license_iptv_source_created: 'Fonte IPTV criada',
  license_iptv_source_updated: 'Fonte IPTV atualizada',
  [licenseImportAuditAction]: 'Canais IPTV importados',
  license_device_activated: 'Dispositivo ativado',
  license_device_deactivated: 'Dispositivo desativado',
  playback_session_manually_ended: 'Sessão encerrada manualmente',
  app_installation_blocked: 'Instalação bloqueada',
  app_installation_unblocked: 'Instalação desbloqueada',
  app_installation_removal_requested: 'Remoção de instalação solicitada',
  app_installation_manually_marked_uninstalled:
    'Instalação marcada como desinstalada',
  app_installation_reactivated: 'Instalação reativada',
  app_installation_status_updated: 'Instalação atualizada',
};

const auditEntityLabels: Record<string, string> = {
  admin_profiles: 'Administradores',
  clients: 'Clientes',
  licenses: 'Licenças',
  license_channels_cache: 'Canais importados',
  license_iptv_sources: 'Fontes IPTV de licença',
  license_devices: 'Dispositivos de licença',
  playback_sessions: 'Sessões de reprodução',
  app_installations: 'Instalações do app',
};



const auditMetadataLabels: Record<string, string> = {
  action: 'Operação',
  channelId: 'ID do canal',
  channelName: 'Canal',
  error: 'Erro',
  limit: 'Limite',
  licenseCode: 'Código da licença',
  licenseId: 'ID da licença',
  nextIsActive: 'Novo status',
  previousIsActive: 'Status anterior',
  sampleChannels: 'Amostra de canais',
  sourceId: 'ID da fonte',
  sourceName: 'Nome da fonte',
  sourceType: 'Tipo da fonte',
  success: 'Sucesso',
  totalDeactivatedMissing: 'Inativados por ausência',
  totalFailed: 'Falhas',
  totalImported: 'Importados',
  totalParsed: 'Processados',
  totalReactivated: 'Reativados',
  totalSkipped: 'Ignorados',
  totalUpdated: 'Atualizados',
  wasLimited: 'Importação limitada',
};

const knownAuditActions = Object.keys(auditActionLabels).sort();
const knownAuditEntities = Object.keys(auditEntityLabels).sort();
const pageSizeOptions = [10, 25, 50, 100];
const licenseImportAuditSummaryFields = [
  { key: 'totalImported', label: 'Importados' },
  { key: 'totalUpdated', label: 'Atualizados' },
  { key: 'totalReactivated', label: 'Reativados' },
  { key: 'totalDeactivatedMissing', label: 'Inativados por ausência' },
  { key: 'totalFailed', label: 'Falhas' },
  { key: 'totalSkipped', label: 'Ignorados' },
] as const;

type LicenseImportAuditSummaryKey =
  (typeof licenseImportAuditSummaryFields)[number]['key'];

type LicenseImportAuditSummary = Record<LicenseImportAuditSummaryKey, number>;

type AuditFiltersForm = {
  action: string;
  entity: string;
  actorId: string;
  startDate: string;
  endDate: string;
  pageSize: number;
};

const defaultFilters: AuditFiltersForm = {
  action: '',
  entity: '',
  actorId: '',
  startDate: '',
  endDate: '',
  pageSize: 25,
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));
}

function formatAuditAction(action: string) {
  return auditActionLabels[action] ?? action;
}

function formatAuditEntity(entity: string) {
  return auditEntityLabels[entity] ?? entity;
}

function formatAuditMetadataKey(key: string) {
  return auditMetadataLabels[key] ?? key;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toSafeNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsedValue = Number(value);

    return Number.isFinite(parsedValue) ? parsedValue : 0;
  }

  return 0;
}

function normalizeMetadataValue(value: unknown) {
  if (value === null || value === undefined) {
    return 'Não informado';
  }

  if (typeof value === 'string') {
    return value || 'Vazio';
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return JSON.stringify(value, null, 2);
}

function getMetadataEntries(metadata: unknown) {
  if (!isRecord(metadata)) {
    return [];
  }

  return Object.entries(metadata).filter(([, value]) => value !== undefined);
}

function getActorLabel(actorId: string | null) {
  return actorId ?? 'Sistema';
}

function createEmptyLicenseImportAuditSummary(): LicenseImportAuditSummary {
  return {
    totalImported: 0,
    totalUpdated: 0,
    totalReactivated: 0,
    totalDeactivatedMissing: 0,
    totalFailed: 0,
    totalSkipped: 0,
  };
}

function buildQueryFilters(
  filters: AuditFiltersForm,
  page: number,
): ListAdminAuditLogsFilters {
  return {
    action: filters.action || undefined,
    entity: filters.entity || undefined,
    actorId: filters.actorId || undefined,
    startDate: filters.startDate || undefined,
    endDate: filters.endDate || undefined,
    page,
    pageSize: filters.pageSize,
  };
}

export function AdminAuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [filters, setFilters] = useState<AuditFiltersForm>(defaultFilters);
  const [appliedFilters, setAppliedFilters] =
    useState<AuditFiltersForm>(defaultFilters);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultFilters.pageSize);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(totalCount / pageSize)),
    [pageSize, totalCount],
  );

  const activeFilterCount = useMemo(
    () =>
      [
        appliedFilters.action,
        appliedFilters.entity,
        appliedFilters.actorId,
        appliedFilters.startDate,
        appliedFilters.endDate,
      ].filter(Boolean).length,
    [appliedFilters],
  );

  const visibleActionCount = useMemo(
    () => new Set(logs.map((log) => log.action)).size,
    [logs],
  );

  const isLicenseImportFilterActive =
    appliedFilters.action === licenseImportAuditAction;

  const licenseImportAuditSummary = useMemo(
    () =>
      logs.reduce((summary, log) => {
        const metadata = isRecord(log.metadata) ? log.metadata : {};

        licenseImportAuditSummaryFields.forEach(({ key }) => {
          summary[key] += toSafeNumber(metadata[key]);
        });

        return summary;
      }, createEmptyLicenseImportAuditSummary()),
    [logs],
  );

  async function loadLogs(nextFilters = appliedFilters, page = currentPage) {
    try {
      setIsLoading(true);
      setErrorMessage(null);

      const result = await listAdminAuditLogs(buildQueryFilters(nextFilters, page));

      setLogs(result.logs);
      setTotalCount(result.totalCount);
      setPageSize(result.pageSize);
    } catch {
      setErrorMessage('Não foi possível carregar os registros de auditoria.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadLogs(appliedFilters, currentPage);
  }, [appliedFilters, currentPage]);

  function handleFilterChange<Key extends keyof AuditFiltersForm>(
    field: Key,
    value: AuditFiltersForm[Key],
  ) {
    setFilters((currentFilters) => ({
      ...currentFilters,
      [field]: value,
    }));
  }

  function handleSubmitFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAppliedFilters(filters);
    setCurrentPage(1);
  }

  function handleApplyLicenseImportFilter() {
    const nextFilters = {
      ...filters,
      action: licenseImportAuditAction,
    };

    setFilters(nextFilters);
    setAppliedFilters(nextFilters);
    setCurrentPage(1);
  }

  function handleClearFilters() {
    setFilters(defaultFilters);
    setAppliedFilters(defaultFilters);
    setCurrentPage(1);
  }

  return (
    <AdminLayout>
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-xf-muted">
              Administração
            </p>
            <h1 className="mt-3 text-4xl font-black tracking-tight">
              Auditoria
            </h1>
            <p className="mt-3 max-w-3xl text-base text-xf-muted">
              Consulta somente leitura dos eventos administrativos registrados.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadLogs(appliedFilters, currentPage)}
            disabled={isLoading}
            className="rounded-xl bg-white/10 px-5 py-3 text-sm font-black text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? 'Atualizando...' : 'Atualizar'}
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <article className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-xf-muted">
              Registros encontrados
            </p>
            <p className="mt-2 text-3xl font-black">{totalCount}</p>
          </article>

          <article className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-xf-muted">
              Filtros ativos
            </p>
            <p className="mt-2 text-3xl font-black">{activeFilterCount}</p>
          </article>

          <article className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-xf-muted">
              Ações nesta página
            </p>
            <p className="mt-2 text-3xl font-black">{visibleActionCount}</p>
          </article>
        </div>

        <form
          onSubmit={handleSubmitFilters}
          className="grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-5 md:grid-cols-2 xl:grid-cols-6"
        >
          <label className="flex flex-col gap-2 xl:col-span-2">
            <span className="text-sm font-bold text-white">Ação</span>
            <select
              value={filters.action}
              onChange={(event) => handleFilterChange('action', event.target.value)}
              className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition focus:border-xf-red"
            >
              <option value="">Todas</option>
              {knownAuditActions.map((action) => (
                <option key={action} value={action}>
                  {formatAuditAction(action)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-bold text-white">Entidade</span>
            <select
              value={filters.entity}
              onChange={(event) => handleFilterChange('entity', event.target.value)}
              className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition focus:border-xf-red"
            >
              <option value="">Todas</option>
              {knownAuditEntities.map((entity) => (
                <option key={entity} value={entity}>
                  {formatAuditEntity(entity)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-bold text-white">Ator</span>
            <input
              value={filters.actorId}
              onChange={(event) => handleFilterChange('actorId', event.target.value)}
              placeholder="UUID do ator"
              className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition focus:border-xf-red"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-bold text-white">Início</span>
            <input
              type="date"
              value={filters.startDate}
              onChange={(event) => handleFilterChange('startDate', event.target.value)}
              className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition focus:border-xf-red"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-bold text-white">Fim</span>
            <input
              type="date"
              value={filters.endDate}
              onChange={(event) => handleFilterChange('endDate', event.target.value)}
              className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition focus:border-xf-red"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-bold text-white">Limite</span>
            <select
              value={filters.pageSize}
              onChange={(event) =>
                handleFilterChange('pageSize', Number(event.target.value))
              }
              className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition focus:border-xf-red"
            >
              {pageSizeOptions.map((option) => (
                <option key={option} value={option}>
                  {option} por página
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-col gap-2 md:flex-row xl:col-span-5">
            <button
              type="submit"
              disabled={isLoading}
              className="rounded-xl bg-xf-red px-5 py-3 text-sm font-black text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Filtrar
            </button>

            <button
              type="button"
              onClick={handleApplyLicenseImportFilter}
              disabled={isLoading}
              className={`rounded-xl px-5 py-3 text-sm font-black text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
                isLicenseImportFilterActive
                  ? 'bg-xf-red hover:bg-red-700'
                  : 'bg-white/10 hover:bg-white/20'
              }`}
            >
              Importações IPTV
            </button>

            <button
              type="button"
              onClick={handleClearFilters}
              disabled={isLoading}
              className="rounded-xl bg-white/10 px-5 py-3 text-sm font-black text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Limpar filtros
            </button>
          </div>
        </form>

        {isLicenseImportFilterActive ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-xf-muted">
                  Resumo da página atual
                </p>
                <p className="mt-2 text-sm text-xf-muted">
                  Os totais abaixo consideram apenas os registros carregados nesta página.
                </p>
              </div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-xf-muted">
                Importações IPTV
              </p>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {licenseImportAuditSummaryFields.map(({ key, label }) => (
                <article
                  key={key}
                  className="rounded-2xl border border-white/10 bg-black/20 p-4"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-xf-muted">
                    {label}
                  </p>
                  <p className="mt-2 text-2xl font-black text-white">
                    {licenseImportAuditSummary[key]}
                  </p>
                </article>
              ))}
            </div>
          </div>
        ) : null}

        {errorMessage ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
            {errorMessage}
          </div>
        ) : null}

        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
          <div className="flex flex-col gap-2 border-b border-white/10 bg-black/20 px-5 py-4 md:flex-row md:items-center md:justify-between">
            <p className="text-sm font-bold text-white">
              Página {currentPage} de {totalPages}
            </p>

            <p className="text-xs text-xf-muted">
              Exibindo até {pageSize} registro(s) por página.
            </p>
          </div>

          {isLoading ? (
            <div className="p-6 text-sm text-xf-muted">
              Carregando registros de auditoria...
            </div>
          ) : logs.length === 0 ? (
            <div className="p-6 text-sm text-xf-muted">
              Nenhum registro de auditoria encontrado para os filtros atuais.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1180px] text-left text-sm">
                <thead className="border-b border-white/10 bg-black/20 text-xs uppercase tracking-[0.2em] text-xf-muted">
                  <tr>
                    <th className="px-5 py-4 font-semibold">Data</th>
                    <th className="px-5 py-4 font-semibold">Ação</th>
                    <th className="px-5 py-4 font-semibold">Entidade</th>
                    <th className="px-5 py-4 font-semibold">ID da entidade</th>
                    <th className="px-5 py-4 font-semibold">Ator</th>
                    <th className="px-5 py-4 font-semibold">Metadata</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => {
                    const metadataEntries = getMetadataEntries(log.metadata);

                    return (
                      <tr key={log.id} className="border-b border-white/5 last:border-0">
                        <td className="px-5 py-4 text-xf-muted">
                          {formatDateTime(log.created_at)}
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-semibold text-white">
                            {formatAuditAction(log.action)}
                          </p>
                          <p className="mt-1 font-mono text-xs text-xf-muted">
                            {log.action}
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-semibold text-white">
                            {formatAuditEntity(log.entity)}
                          </p>
                          <p className="mt-1 font-mono text-xs text-xf-muted">
                            {log.entity}
                          </p>
                        </td>
                        <td className="max-w-[210px] px-5 py-4">
                          <p className="break-all font-mono text-xs text-xf-muted">
                            {log.entity_id ?? 'Não informado'}
                          </p>
                        </td>
                        <td className="max-w-[210px] px-5 py-4">
                          <p className="break-all font-mono text-xs text-xf-muted">
                            {getActorLabel(log.actor_id)}
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          {metadataEntries.length === 0 ? (
                            <p className="text-xs text-xf-muted">Sem metadados</p>
                          ) : (
                            <dl className="grid max-w-[380px] gap-2">
                              {metadataEntries.map(([key, value]) => (
                                <div
                                  key={key}
                                  className="rounded-xl border border-white/10 bg-black/20 p-3"
                                >
                                  <dt className="font-mono text-[0.7rem] font-bold text-white">
                                    {formatAuditMetadataKey(key)}
                                  </dt>
                                  <dd className="mt-1 whitespace-pre-wrap break-words font-mono text-xs text-xf-muted">
                                    {normalizeMetadataValue(value)}
                                  </dd>
                                </div>
                              ))}
                            </dl>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <button
            type="button"
            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
            disabled={isLoading || currentPage <= 1}
            className="rounded-xl bg-white/10 px-5 py-3 text-sm font-black text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Página anterior
          </button>

          <p className="text-center text-sm text-xf-muted">
            {totalCount} registro(s) no total
          </p>

          <button
            type="button"
            onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
            disabled={isLoading || currentPage >= totalPages}
            className="rounded-xl bg-white/10 px-5 py-3 text-sm font-black text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Próxima página
          </button>
        </div>
      </section>
    </AdminLayout>
  );
}
