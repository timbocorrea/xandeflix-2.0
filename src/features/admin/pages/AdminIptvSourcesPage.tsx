import { useEffect, useMemo, useState } from 'react';

import { AdminLayout } from '../components/AdminLayout';

import {
  importAdminLicenseIptvSourceChannels,
  listAdminIptvSources,
  listAdminLicenseIptvSources,
  listAdminLicenses,
  testAdminLicenseIptvSource,
  updateAdminIptvSource,
  updateAdminLicenseIptvSource,
} from '../services';

import type { LicenseIptvSourceDiagnostic } from '../services/adminLicenses.service';

import type {
  IptvSource,
  IptvSourceType,
  License,
  LicenseIptvSource,
  LicenseStatus,
} from '../types/admin.types';

type IptvSourceOwnerKind = 'legacy-client' | 'license';

type IptvSourceOrigin = 'admin' | 'user' | 'legacy-client';

type LicenseSourceGroup = {
  license: License;
  sources: LicenseIptvSource[];
};

type AdminIptvSourceRow = {
  id: string;
  rowKey: string;
  ownerKind: IptvSourceOwnerKind;
  name: string;
  sourceUrl: string;
  type: IptvSourceType;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string | null;
  lastSyncAt?: string | null;
  clientId?: string | null;
  licenseId?: string | null;
  licenseCode?: string | null;
  licenseLabel?: string | null;
  licenseStatus?: LicenseStatus | null;
  origin: IptvSourceOrigin;
};

type EditSourceForm = {
  name: string;
  sourceUrl: string;
  type: IptvSourceType;
  isActive: boolean;
};

const sourceOriginLabels: Record<IptvSourceOrigin, string> = {
  admin: 'Admin',
  user: 'Usuário',
  'legacy-client': 'Legado/Cliente',
};

const ownerKindLabels: Record<IptvSourceOwnerKind, string> = {
  'legacy-client': 'Legado por cliente',
  license: 'Por licença',
};

const licenseStatusLabels: Record<LicenseStatus, string> = {
  active: 'Ativa',
  inactive: 'Inativa',
  expired: 'Expirada',
  blocked: 'Bloqueada',
  canceled: 'Cancelada',
};

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return 'Nunca';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function getSourceTypeLabel(type: IptvSourceType) {
  const labels: Record<IptvSourceType, string> = {
    m3u: 'M3U',
    xtream: 'Xtream',
    manual: 'Manual',
  };

  return labels[type];
}

function getBooleanLabel(value: boolean) {
  return value ? 'Ativa' : 'Inativa';
}

function getShortId(value: string | null | undefined) {
  if (!value) {
    return 'Não informado';
  }

  return value.length > 10 ? value.slice(0, 8) + '...' : value;
}

function getLicenseStatusLabel(status: LicenseStatus | null | undefined) {
  return status ? licenseStatusLabels[status] : 'Não informado';
}

function getOriginBadgeClassName(origin: IptvSourceOrigin) {
  if (origin === 'admin') {
    return 'bg-emerald-500/10 text-emerald-200';
  }

  if (origin === 'user') {
    return 'bg-sky-500/10 text-sky-200';
  }

  return 'bg-amber-500/10 text-amber-200';
}

function getSourceStatusClassName(isActive: boolean) {
  return isActive ? 'bg-emerald-500/10 text-emerald-200' : 'bg-white/10 text-xf-muted';
}

function getOperationalStatus(row: AdminIptvSourceRow) {
  if (!row.isActive) {
    return {
      label: 'Inativa',
      className: 'bg-white/10 text-xf-muted',
    };
  }

  if (row.ownerKind === 'license' && !row.licenseId) {
    return {
      label: 'Sem licença',
      className: 'bg-red-500/10 text-red-200',
    };
  }

  if (row.ownerKind === 'license' && row.licenseStatus !== 'active') {
    return {
      label: 'Licença não ativa',
      className: 'bg-amber-500/10 text-amber-200',
    };
  }

  if (row.ownerKind === 'legacy-client' && !row.clientId) {
    return {
      label: 'Sem cliente',
      className: 'bg-red-500/10 text-red-200',
    };
  }

  return {
    label: 'Operacional',
    className: 'bg-emerald-500/10 text-emerald-200',
  };
}

function getSourceActionErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Nao foi possivel concluir a acao da fonte IPTV.';
}

function formatDiagnosticHttpStatus(diagnostic: LicenseIptvSourceDiagnostic) {
  if (!diagnostic.responded) {
    return 'sem resposta HTTP';
  }

  if (!diagnostic.httpStatus) {
    return 'HTTP nao informado';
  }

  return 'HTTP ' + diagnostic.httpStatus;
}

function createLegacySourceRow(source: IptvSource): AdminIptvSourceRow {
  return {
    id: source.id,
    rowKey: 'legacy-client-' + source.id,
    ownerKind: 'legacy-client',
    name: source.name,
    sourceUrl: source.source_url,
    type: source.type,
    isActive: source.is_active,
    createdAt: source.created_at,
    updatedAt: source.updated_at,
    lastSyncAt: source.last_sync_at,
    clientId: source.client_id,
    origin: 'legacy-client',
  };
}

function createLicenseSourceRow(
  source: LicenseIptvSource,
  license: License,
): AdminIptvSourceRow {
  return {
    id: source.id,
    rowKey: 'license-' + source.id,
    ownerKind: 'license',
    name: source.name,
    sourceUrl: source.source_url,
    type: source.type,
    isActive: source.is_active,
    createdAt: source.created_at,
    updatedAt: source.updated_at,
    licenseId: source.license_id,
    licenseCode: license.license_code,
    licenseLabel: license.label,
    licenseStatus: license.status,
    origin: source.created_by,
  };
}

function renderOperationalBinding(row: AdminIptvSourceRow) {
  if (row.ownerKind === 'license') {
    if (!row.licenseId) {
      return (
        <div className="text-red-200">
          <p className="font-semibold">Sem vínculo operacional</p>
          <p className="mt-1 text-xs text-xf-muted">Fonte sem licença vinculada.</p>
        </div>
      );
    }

    return (
      <div className="max-w-[150px]">
        <p className="font-semibold text-white">
          Licença: {row.licenseCode ?? getShortId(row.licenseId)}
        </p>
        <p className="mt-1 text-xs text-xf-muted">
          {row.licenseLabel ? 'Rótulo: ' + row.licenseLabel : 'ID: ' + getShortId(row.licenseId)}
        </p>
        <p className="mt-1 text-xs text-xf-muted">
          Status: {getLicenseStatusLabel(row.licenseStatus)}
        </p>
      </div>
    );
  }

  if (!row.clientId) {
    return (
      <div className="text-red-200">
        <p className="font-semibold">Sem vínculo operacional</p>
        <p className="mt-1 text-xs text-xf-muted">Fonte legada sem cliente vinculado.</p>
      </div>
    );
  }

  return (
    <div className="max-w-[140px]">
      <p className="font-semibold text-white">Cliente legado vinculado</p>
      <p className="mt-1 text-xs text-xf-muted">ID: {getShortId(row.clientId)}</p>
    </div>
  );
}

export function AdminIptvSourcesPage() {
  const [legacySources, setLegacySources] = useState<IptvSource[]>([]);
  const [licenseSourceGroups, setLicenseSourceGroups] = useState<LicenseSourceGroup[]>([]);
  const [loadWarnings, setLoadWarnings] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [editingSource, setEditingSource] = useState<AdminIptvSourceRow | null>(null);
  const [editSourceForm, setEditSourceForm] = useState<EditSourceForm>({
    name: '',
    sourceUrl: '',
    type: 'm3u',
    isActive: true,
  });
  const [isUpdatingSource, setIsUpdatingSource] = useState(false);
  const [testingSourceId, setTestingSourceId] = useState<string | null>(null);
  const [importingSourceId, setImportingSourceId] = useState<string | null>(null);
  const [sourceDiagnostics, setSourceDiagnostics] = useState<
    Record<string, LicenseIptvSourceDiagnostic>
  >({});

  const rows = useMemo(() => {
    const legacyRows = legacySources.map(createLegacySourceRow);
    const licenseRows = licenseSourceGroups.flatMap(({ license, sources }) =>
      sources.map((source) => createLicenseSourceRow(source, license)),
    );

    return [...licenseRows, ...legacyRows].sort(
      (current, next) =>
        new Date(next.createdAt).getTime() - new Date(current.createdAt).getTime(),
    );
  }, [legacySources, licenseSourceGroups]);

  async function loadSources() {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      setSuccessMessage(null);

      const warnings: string[] = [];

      const [legacySourcesResult, licensesResult] = await Promise.allSettled([
        listAdminIptvSources(),
        listAdminLicenses(),
      ]);

      const nextLegacySources =
        legacySourcesResult.status === 'fulfilled' ? legacySourcesResult.value : [];
      const licenses = licensesResult.status === 'fulfilled' ? licensesResult.value : [];

      if (legacySourcesResult.status === 'rejected') {
        warnings.push('Não foi possível carregar as fontes legadas por cliente.');
      }

      if (licensesResult.status === 'rejected') {
        warnings.push('Não foi possível carregar as licenças para mapear fontes por licença.');
      }

      if (
        legacySourcesResult.status === 'rejected' &&
        licensesResult.status === 'rejected'
      ) {
        setLegacySources([]);
        setLicenseSourceGroups([]);
        setLoadWarnings([]);
        setErrorMessage('Não foi possível carregar as fontes IPTV administrativas.');
        return;
      }

      const licenseSourceResults = await Promise.allSettled(
        licenses.map(async (license) => ({
          license,
          sources: await listAdminLicenseIptvSources(license.id),
        })),
      );

      const nextLicenseSourceGroups: LicenseSourceGroup[] = [];

      licenseSourceResults.forEach((result, index) => {
        const license = licenses[index];

        if (result.status === 'fulfilled') {
          nextLicenseSourceGroups.push(result.value);
          return;
        }

        warnings.push(
          'Não foi possível carregar fontes da licença ' +
            license.license_code +
            '. As demais fontes continuam visíveis.',
        );
      });

      setLegacySources(nextLegacySources);
      setLicenseSourceGroups(nextLicenseSourceGroups);
      setLoadWarnings(warnings);
    } catch {
      setErrorMessage('Não foi possível carregar as fontes IPTV administrativas.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadSources();
  }, []);

  function handleValidateSource(row: AdminIptvSourceRow) {
    setErrorMessage(null);

    if (row.ownerKind === 'license') {
      setSuccessMessage(
        'Fonte "' +
          row.name +
          '" vinculada à licença ' +
          (row.licenseCode ?? getShortId(row.licenseId)) +
          '. Origem: ' +
          sourceOriginLabels[row.origin] +
          '. Teste/importação operacional deve ser feita nos detalhes da licença nesta etapa.',
      );
      return;
    }

    setSuccessMessage(
      'Fonte "' +
        row.name +
        '" pertence ao modelo legado por cliente. Migração para fonte por licença deve ser avaliada antes do self-service.',
    );
  }

  function openEditSource(row: AdminIptvSourceRow) {
    setEditingSource(row);
    setEditSourceForm({
      name: row.name,
      sourceUrl: row.sourceUrl,
      type: row.type,
      isActive: row.isActive,
    });
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  function closeEditSource() {
    if (isUpdatingSource) {
      return;
    }

    setEditingSource(null);
  }

  async function handleUpdateSource(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingSource) {
      return;
    }

    const nextName = editSourceForm.name.trim();
    const nextSourceUrl = editSourceForm.sourceUrl.trim();

    if (!nextName || !nextSourceUrl) {
      setErrorMessage('Informe o nome e a URL da fonte IPTV.');
      return;
    }

    try {
      setIsUpdatingSource(true);
      setErrorMessage(null);
      setSuccessMessage(null);

      if (editingSource.ownerKind === 'license') {
        await updateAdminLicenseIptvSource(editingSource.id, {
          name: nextName,
          source_url: nextSourceUrl,
          type: editSourceForm.type,
          is_active: editSourceForm.isActive,
        });
      } else {
        await updateAdminIptvSource(editingSource.id, {
          name: nextName,
          source_url: nextSourceUrl,
          type: editSourceForm.type,
          is_active: editSourceForm.isActive,
        });
      }

      setEditingSource(null);
      setSuccessMessage(
        'Fonte IPTV atualizada. Se a URL mudou, teste a fonte e importe os canais novamente para renovar o cache.',
      );

      await loadSources();
    } catch (error) {
      setErrorMessage(getSourceActionErrorMessage(error));
    } finally {
      setIsUpdatingSource(false);
    }
  }

  async function handleTestSource(row: AdminIptvSourceRow) {
    if (row.ownerKind !== 'license') {
      setErrorMessage('Teste operacional esta disponivel apenas para fontes por licenca.');
      return;
    }

    try {
      setTestingSourceId(row.id);
      setErrorMessage(null);
      setSuccessMessage(null);

      const diagnostic = await testAdminLicenseIptvSource(row.id);

      setSourceDiagnostics((currentDiagnostics) => ({
        ...currentDiagnostics,
        [row.id]: diagnostic,
      }));

      setSuccessMessage(
        'Teste da fonte "' +
          row.name +
          '" concluido: ' +
          formatDiagnosticHttpStatus(diagnostic) +
          ', ' +
          diagnostic.entryCount +
          ' entrada(s).',
      );
    } catch (error) {
      setErrorMessage(getSourceActionErrorMessage(error));
    } finally {
      setTestingSourceId(null);
    }
  }

  async function handleImportSourceChannels(row: AdminIptvSourceRow) {
    if (row.ownerKind !== 'license') {
      setErrorMessage('Importacao operacional esta disponivel apenas para fontes por licenca.');
      return;
    }

    try {
      setImportingSourceId(row.id);
      setErrorMessage(null);
      setSuccessMessage(null);

      const result = await importAdminLicenseIptvSourceChannels(row.id);

      if (result.skipped) {
        setSuccessMessage(result.message);
      } else {
        setSuccessMessage(
          'Importacao concluida para "' +
            row.name +
            '". Canais recebidos: ' +
            result.totalParsed +
            ', importados: ' +
            result.totalImported +
            ', atualizados: ' +
            result.totalUpdated +
            '.',
        );
      }
    } catch (error) {
      setErrorMessage(getSourceActionErrorMessage(error));
    } finally {
      setImportingSourceId(null);
    }
  }

  return (
    <AdminLayout>
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-xf-muted">
            Administração
          </p>

          <h1 className="mt-3 text-4xl font-black tracking-tight">
            Fontes IPTV
          </h1>

          <p className="mt-3 max-w-4xl text-base text-xf-muted">
            Acompanhe fontes legadas por cliente e fontes vinculadas a licenças.
            O modelo por licença é o caminho principal para canais autorizados,
            origem da lista e futuro self-service.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm font-bold uppercase tracking-[0.25em] text-white">
              Modelo atual
            </p>
            <p className="mt-3 text-sm text-xf-muted">
              Fontes por licença concentram a operação atual: origem da lista,
              autorização e importação de canais por licença.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm font-bold uppercase tracking-[0.25em] text-white">
              Legado visível
            </p>
            <p className="mt-3 text-sm text-xf-muted">
              Fontes por cliente continuam listadas para rastreabilidade e
              análise antes de qualquer migração operacional.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm font-bold uppercase tracking-[0.25em] text-white">
              Origem da lista
            </p>
            <p className="mt-3 text-sm text-xf-muted">
              Admin indica cadastro pelo operador. Usuário prepara o caminho do
              self-service futuro. Legado/Cliente identifica fontes antigas.
            </p>
          </div>
        </div>

        {successMessage ? (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-200">
            {successMessage}
          </div>
        ) : null}

        {errorMessage ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
            {errorMessage}
          </div>
        ) : null}

        {loadWarnings.length > 0 ? (
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-100">
            <p className="font-semibold">Atenção ao carregamento parcial</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {loadWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
          {isLoading ? (
            <div className="p-6 text-sm text-xf-muted">
              Carregando fontes IPTV administrativas...
            </div>
          ) : rows.length === 0 ? (
            <div className="p-6 text-sm text-xf-muted">
              Nenhuma fonte IPTV cadastrada até o momento.
            </div>
          ) : (
            <div className="w-full overflow-hidden">
              <table className="w-full table-fixed text-left text-xs">
                <thead className="border-b border-white/10 bg-black/20 text-[10px] uppercase tracking-[0.12em] text-xf-muted">
                  <tr>
                    <th className="w-[15%] px-3 py-3 font-semibold">Nome</th>
                    <th className="w-[8%] px-3 py-3 font-semibold">Origem</th>
                    <th className="w-[15%] px-3 py-3 font-semibold">
                      Vínculo
                    </th>
                    <th className="w-[7%] px-3 py-3 font-semibold">Tipo</th>
                    <th className="w-[21%] px-3 py-3 font-semibold">URL</th>
                    <th className="w-[7%] px-3 py-3 font-semibold">Fonte</th>
                    <th className="w-[10%] px-3 py-3 font-semibold">
                      Status
                    </th>
                    <th className="w-[8%] px-3 py-3 font-semibold">
                      Atual.
                    </th>
                    <th className="w-[8%] px-3 py-3 font-semibold">
                      Criada
                    </th>
                    <th className="w-[21%] px-3 py-3 font-semibold">Ações</th>
                  </tr>
                </thead>

                <tbody>
                  {rows.map((row) => {
                    const operationalStatus = getOperationalStatus(row);
                    const diagnostic = sourceDiagnostics[row.id];
                    const isTestingSource = testingSourceId === row.id;
                    const isImportingSource = importingSourceId === row.id;

                    return (
                      <tr
                        key={row.rowKey}
                        className="border-b border-white/5 last:border-0"
                      >
                        <td className="px-3 py-3 align-top">
                          <p className="truncate font-semibold text-white">{row.name}</p>
                          <p className="mt-1 text-xs text-xf-muted">
                            {ownerKindLabels[row.ownerKind]}
                          </p>
                        </td>

                        <td className="px-3 py-3 align-top">
                          <span
                            className={
                              'rounded-full px-2 py-1 text-[11px] font-bold ' +
                              getOriginBadgeClassName(row.origin)
                            }
                          >
                            {sourceOriginLabels[row.origin]}
                          </span>
                        </td>

                        <td className="px-3 py-3 align-top text-xf-muted">
                          {renderOperationalBinding(row)}
                        </td>

                        <td className="px-3 py-3 align-top text-xf-muted">
                          {getSourceTypeLabel(row.type)}
                        </td>

                        <td className="truncate px-3 py-3 align-top font-mono text-[11px] text-xf-muted">
                          {row.sourceUrl}
                        </td>

                        <td className="px-3 py-3 align-top">
                          <span
                            className={
                              'rounded-full px-2 py-1 text-[11px] font-bold ' +
                              getSourceStatusClassName(row.isActive)
                            }
                          >
                            {getBooleanLabel(row.isActive)}
                          </span>
                        </td>

                        <td className="px-3 py-3 align-top">
                          <span
                            className={
                              'rounded-full px-2 py-1 text-[11px] font-bold ' +
                              operationalStatus.className
                            }
                          >
                            {operationalStatus.label}
                          </span>
                        </td>

                        <td className="px-3 py-3 align-top text-[11px] text-xf-muted">
                          {row.ownerKind === 'legacy-client'
                            ? formatDateTime(row.lastSyncAt)
                            : formatDateTime(row.updatedAt)}
                        </td>

                        <td className="px-3 py-3 align-top text-[11px] text-xf-muted">
                          {formatDateTime(row.createdAt)}
                        </td>

                        <td className="px-3 py-3 align-top">
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => openEditSource(row)}
                              className="rounded-lg bg-xf-red px-3 py-2 text-[11px] font-bold text-white transition hover:bg-red-700"
                            >
                              Editar
                            </button>

                            <button
                              type="button"
                              onClick={() => void handleTestSource(row)}
                              disabled={row.ownerKind !== 'license' || isTestingSource}
                              className="rounded-lg bg-white/10 px-3 py-2 text-[11px] font-bold text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {isTestingSource ? 'Testando...' : 'Testar'}
                            </button>

                            <button
                              type="button"
                              onClick={() => void handleImportSourceChannels(row)}
                              disabled={row.ownerKind !== 'license' || isImportingSource}
                              className="rounded-lg bg-white px-3 py-2 text-[11px] font-bold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {isImportingSource ? 'Importando...' : 'Importar'}
                            </button>

                            <button
                              type="button"
                              onClick={() => handleValidateSource(row)}
                              className="rounded-lg bg-white/10 px-3 py-2 text-[11px] font-bold text-white transition hover:bg-white/20"
                            >
                              Regra
                            </button>
                          </div>

                          {diagnostic ? (
                            <p
                              className={
                                diagnostic.success
                                  ? 'mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-2 text-[11px] font-semibold text-emerald-100'
                                  : 'mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-2 text-[11px] font-semibold text-amber-100'
                              }
                            >
                              {formatDiagnosticHttpStatus(diagnostic)} ·{' '}
                              {diagnostic.entryCount} entrada(s)
                            </p>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {editingSource ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <form
              onSubmit={handleUpdateSource}
              className="w-full max-w-2xl rounded-2xl border border-white/10 bg-zinc-950 p-6 shadow-2xl"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.24em] text-xf-red">
                    Editar fonte IPTV
                  </p>
                  <h2 className="mt-2 text-2xl font-black text-white">
                    {editingSource.name}
                  </h2>
                  <p className="mt-1 text-sm text-xf-muted">
                    {ownerKindLabels[editingSource.ownerKind]}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeEditSource}
                  disabled={isUpdatingSource}
                  className="rounded-xl bg-white/10 px-4 py-2 text-xs font-bold text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Fechar
                </button>
              </div>

              <div className="mt-5 grid gap-4">
                <label className="grid gap-2">
                  <span className="text-xs font-black uppercase tracking-[0.2em] text-xf-muted">
                    Nome
                  </span>
                  <input
                    value={editSourceForm.name}
                    onChange={(event) =>
                      setEditSourceForm((currentForm) => ({
                        ...currentForm,
                        name: event.target.value,
                      }))
                    }
                    className="rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition focus:border-xf-red"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-xs font-black uppercase tracking-[0.2em] text-xf-muted">
                    URL M3U / Xtream
                  </span>
                  <textarea
                    value={editSourceForm.sourceUrl}
                    onChange={(event) =>
                      setEditSourceForm((currentForm) => ({
                        ...currentForm,
                        sourceUrl: event.target.value,
                      }))
                    }
                    rows={4}
                    className="resize-y rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition focus:border-xf-red"
                  />
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-2">
                    <span className="text-xs font-black uppercase tracking-[0.2em] text-xf-muted">
                      Tipo
                    </span>
                    <select
                      value={editSourceForm.type}
                      onChange={(event) =>
                        setEditSourceForm((currentForm) => ({
                          ...currentForm,
                          type: event.target.value as IptvSourceType,
                        }))
                      }
                      className="rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition focus:border-xf-red"
                    >
                      <option value="m3u">M3U</option>
                      <option value="xtream">Xtream</option>
                      <option value="manual">Manual</option>
                    </select>
                  </label>

                  <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/40 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={editSourceForm.isActive}
                      onChange={(event) =>
                        setEditSourceForm((currentForm) => ({
                          ...currentForm,
                          isActive: event.target.checked,
                        }))
                      }
                      className="h-4 w-4 accent-xf-red"
                    />
                    <span className="text-sm font-bold text-white">
                      Fonte ativa
                    </span>
                  </label>
                </div>
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeEditSource}
                  disabled={isUpdatingSource}
                  className="rounded-xl bg-white/10 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={isUpdatingSource}
                  className="rounded-xl bg-xf-red px-5 py-3 text-sm font-black text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isUpdatingSource ? 'Salvando...' : 'Salvar fonte'}
                </button>
              </div>
            </form>
          </div>
        ) : null}
      </section>
    </AdminLayout>
  );
}
