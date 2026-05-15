import { useEffect, useMemo, useState } from 'react';

import { AdminLayout } from '../components/AdminLayout';
import { listAdminAuditLogs, type ListAdminAuditLogsFilters } from '../services';
import type { AuditLog } from '../types/admin.types';

const licenseImportAuditAction = 'license_iptv_source_channels_imported';
const pageSizeOptions = [10, 25, 50, 100];
const numberFormatter = new Intl.NumberFormat('pt-BR');

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

type ImportStatus = 'Sucesso' | 'Falha' | 'Com falhas' | 'Não informado';
type ImportStatusFilter = 'all' | 'success' | 'failed';

type LicenseImportsFilters = {
  startDate: string;
  endDate: string;
  status: ImportStatusFilter;
  pageSize: number;
};

const defaultFilters: LicenseImportsFilters = {
  startDate: '',
  endDate: '',
  status: 'all',
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

function toSafeText(value: unknown) {
  if (typeof value === 'string' && value.trim() !== '') {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return 'Não informado';
}

function getAuditMetadata(log: AuditLog) {
  return isRecord(log.metadata) ? log.metadata : {};
}

function getImportStatus(metadata: Record<string, unknown>): ImportStatus {
  const success = metadata.success;

  if (success === true || success === 'true') {
    return 'Sucesso';
  }

  if (success === false || success === 'false') {
    return 'Falha';
  }

  if (toSafeNumber(metadata.totalFailed) > 0) {
    return 'Com falhas';
  }

  return 'Não informado';
}

function matchesStatusFilter(log: AuditLog, statusFilter: ImportStatusFilter) {
  if (statusFilter === 'all') {
    return true;
  }

  const status = getImportStatus(getAuditMetadata(log));

  if (statusFilter === 'success') {
    return status === 'Sucesso';
  }

  return status === 'Falha' || status === 'Com falhas';
}

function getImportStatusClassName(status: ImportStatus) {
  const classNames: Record<ImportStatus, string> = {
    Sucesso:
      'rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-200',
    Falha:
      'rounded-full bg-red-500/15 px-3 py-1 text-xs font-bold text-red-200',
    'Com falhas':
      'rounded-full bg-amber-500/15 px-3 py-1 text-xs font-bold text-amber-100',
    'Não informado':
      'rounded-full bg-zinc-500/20 px-3 py-1 text-xs font-bold text-zinc-200',
  };

  return classNames[status];
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

function summarizeLicenseImports(logs: AuditLog[]) {
  return logs.reduce((summary, log) => {
    const metadata = getAuditMetadata(log);

    licenseImportAuditSummaryFields.forEach(({ key }) => {
      summary[key] += toSafeNumber(metadata[key]);
    });

    return summary;
  }, createEmptyLicenseImportAuditSummary());
}

function buildQueryFilters(
  filters: LicenseImportsFilters,
  page: number,
): ListAdminAuditLogsFilters {
  return {
    action: licenseImportAuditAction,
    startDate: filters.startDate || undefined,
    endDate: filters.endDate || undefined,
    page,
    pageSize: filters.pageSize,
  };
}

export function AdminLicenseImportsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [filters, setFilters] = useState<LicenseImportsFilters>(defaultFilters);
  const [appliedFilters, setAppliedFilters] =
    useState<LicenseImportsFilters>(defaultFilters);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultFilters.pageSize);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null);

  const filteredLogs = useMemo(
    () => logs.filter((log) => matchesStatusFilter(log, appliedFilters.status)),
    [appliedFilters.status, logs],
  );

  const licenseImportAuditSummary = useMemo(
    () => summarizeLicenseImports(filteredLogs),
    [filteredLogs],
  );

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(totalCount / pageSize)),
    [pageSize, totalCount],
  );

  const activeFilterCount = useMemo(
    () =>
      [
        appliedFilters.startDate,
        appliedFilters.endDate,
        appliedFilters.status === 'all' ? '' : appliedFilters.status,
      ].filter(Boolean).length,
    [appliedFilters],
  );

  async function loadLogs(nextFilters = appliedFilters, page = currentPage) {
    try {
      setIsLoading(true);
      setErrorMessage(null);

      const result = await listAdminAuditLogs(buildQueryFilters(nextFilters, page));

      setLogs(result.logs);
      setTotalCount(result.totalCount);
      setPageSize(result.pageSize);
      setLastLoadedAt(new Date().toISOString());
    } catch {
      setErrorMessage('Não foi possível carregar as importações IPTV.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadLogs(appliedFilters, currentPage);
  }, [appliedFilters, currentPage]);

  function handleFilterChange<Key extends keyof LicenseImportsFilters>(
    field: Key,
    value: LicenseImportsFilters[Key],
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

  function handleClearFilters() {
    setFilters(defaultFilters);
    setAppliedFilters(defaultFilters);
    setCurrentPage(1);
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
              Importações IPTV
            </h1>

            <p className="mt-3 max-w-3xl text-base text-xf-muted">
              Acompanhe o histórico operacional das importações de canais por licença.
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
              Importações encontradas
            </p>
            <p className="mt-2 text-3xl font-black">{totalCount}</p>
          </article>

          <article className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-xf-muted">
              Exibidas nesta página
            </p>
            <p className="mt-2 text-3xl font-black">{filteredLogs.length}</p>
          </article>

          <article className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-xf-muted">
              Filtros ativos
            </p>
            <p className="mt-2 text-3xl font-black">{activeFilterCount}</p>
          </article>
        </div>

        <form
          onSubmit={handleSubmitFilters}
          className="grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-5 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_0.8fr_auto_auto]"
        >
          <label className="flex flex-col gap-2">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-xf-muted">
              Data inicial
            </span>
            <input
              type="date"
              value={filters.startDate}
              onChange={(event) => handleFilterChange('startDate', event.target.value)}
              className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition focus:border-white/30"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-xf-muted">
              Data final
            </span>
            <input
              type="date"
              value={filters.endDate}
              onChange={(event) => handleFilterChange('endDate', event.target.value)}
              className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition focus:border-white/30"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-xf-muted">
              Status
            </span>
            <select
              value={filters.status}
              onChange={(event) =>
                handleFilterChange('status', event.target.value as ImportStatusFilter)
              }
              className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition focus:border-white/30"
            >
              <option value="all">Todos</option>
              <option value="success">Sucesso</option>
              <option value="failed">Com falhas</option>
            </select>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-xf-muted">
              Limite
            </span>
            <select
              value={filters.pageSize}
              onChange={(event) =>
                handleFilterChange('pageSize', Number(event.target.value))
              }
              className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition focus:border-white/30"
            >
              {pageSizeOptions.map((option) => (
                <option key={option} value={option}>
                  {option} por página
                </option>
              ))}
            </select>
          </label>

          <button
            type="submit"
            disabled={isLoading}
            className="self-end rounded-xl bg-xf-red px-5 py-3 text-sm font-black text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Filtrar
          </button>

          <button
            type="button"
            onClick={handleClearFilters}
            disabled={isLoading}
            className="self-end rounded-xl bg-white/10 px-5 py-3 text-sm font-black text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Limpar filtros
          </button>
        </form>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-xf-muted">
                Resumo da página atual
              </p>
              <p className="mt-2 text-sm text-xf-muted">
                Os totais consideram apenas os registros carregados nesta página.
              </p>
            </div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-xf-muted">
              Importações IPTV
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {licenseImportAuditSummaryFields.map(({ key, label }) => (
              <article
                key={key}
                className="rounded-2xl border border-white/10 bg-white/5 p-5"
              >
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-xf-muted">
                  {label}
                </p>
                <p className="mt-2 text-3xl font-black">
                  {numberFormatter.format(licenseImportAuditSummary[key])}
                </p>
              </article>
            ))}
          </div>
        </div>

        {errorMessage ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
            {errorMessage}
          </div>
        ) : null}

        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
          <div className="flex flex-col gap-2 border-b border-white/10 bg-black/20 px-5 py-4 md:flex-row md:items-center md:justify-between">
            <p className="text-sm font-bold text-white">
              Histórico de importações
            </p>

            <p className="text-xs text-xf-muted">
              {lastLoadedAt ? formatDateTime(lastLoadedAt) : 'Ainda não atualizado'}
            </p>
          </div>

          {isLoading ? (
            <div className="p-6 text-sm text-xf-muted">
              Carregando importações IPTV...
            </div>
          ) : logs.length === 0 ? (
            <div className="p-6 text-sm text-xf-muted">
              Nenhuma importação IPTV encontrada para os filtros atuais.
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="p-6 text-sm text-xf-muted">
              Nenhuma importação IPTV da página atual corresponde ao status selecionado.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1320px] text-left text-sm">
                <thead className="border-b border-white/10 bg-black/20 text-xs uppercase tracking-[0.2em] text-xf-muted">
                  <tr>
                    <th className="px-5 py-4 font-semibold">Data</th>
                    <th className="px-5 py-4 font-semibold">Status</th>
                    <th className="px-5 py-4 font-semibold">Licença</th>
                    <th className="px-5 py-4 font-semibold">Fonte</th>
                    <th className="px-5 py-4 font-semibold">Tipo</th>
                    <th className="px-5 py-4 font-semibold">Importados</th>
                    <th className="px-5 py-4 font-semibold">Atualizados</th>
                    <th className="px-5 py-4 font-semibold">Reativados</th>
                    <th className="px-5 py-4 font-semibold">Inativados</th>
                    <th className="px-5 py-4 font-semibold">Falhas</th>
                    <th className="px-5 py-4 font-semibold">Ignorados</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredLogs.map((log) => {
                    const metadata = getAuditMetadata(log);
                    const status = getImportStatus(metadata);

                    return (
                      <tr
                        key={log.id}
                        className="border-b border-white/5 last:border-0"
                      >
                        <td className="px-5 py-4 text-xf-muted">
                          {formatDateTime(log.created_at)}
                        </td>

                        <td className="px-5 py-4">
                          <span className={getImportStatusClassName(status)}>
                            {status}
                          </span>
                        </td>

                        <td className="px-5 py-4">
                          <p className="font-bold text-white">
                            {toSafeText(metadata.licenseCode)}
                          </p>
                        </td>

                        <td className="px-5 py-4">
                          <p className="font-bold text-white">
                            {toSafeText(metadata.sourceName)}
                          </p>
                        </td>

                        <td className="px-5 py-4 text-xf-muted">
                          {toSafeText(metadata.sourceType)}
                        </td>

                        {licenseImportAuditSummaryFields.map(({ key }) => (
                          <td key={key} className="px-5 py-4 text-xf-muted">
                            {numberFormatter.format(toSafeNumber(metadata[key]))}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-white/10 px-5 py-4 md:flex-row md:items-center md:justify-between">
            <p className="text-xs text-xf-muted">
              Página {currentPage} de {totalPages} — {totalCount} importação(ões)
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={isLoading || currentPage <= 1}
                className="rounded-xl bg-white/10 px-4 py-2 text-sm font-bold text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Anterior
              </button>

              <button
                type="button"
                onClick={() =>
                  setCurrentPage((page) => Math.min(totalPages, page + 1))
                }
                disabled={isLoading || currentPage >= totalPages}
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
