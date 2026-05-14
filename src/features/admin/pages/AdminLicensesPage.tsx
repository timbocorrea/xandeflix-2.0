import { useEffect, useMemo, useState } from 'react';

import { AdminLayout } from '../components/AdminLayout';

import {
  createAdminLicense,
  createAdminLicenseIptvSource,
  updateAdminLicenseDetails,
  updateAdminLicenseStatus,
  listAdminLicenseDevices,
  listAdminLicenseIptvSources,
  listAdminLicenses,
  listAdminPlaybackSessions,
} from '../services';

import type {
  License,
  LicenseDevice,
  LicenseIptvSource,
  LicensePlanType,
  LicenseStatus,
  PlaybackSession,
} from '../types/admin.types';

const licenseStatusLabels: Record<LicenseStatus, string> = {
  active: 'Ativa',
  inactive: 'Inativa',
  expired: 'Expirada',
  blocked: 'Bloqueada',
  canceled: 'Cancelada',
};

const licensePlanLabels: Record<LicensePlanType, string> = {
  monthly: 'Mensal',
  quarterly: 'Trimestral',
  semiannual: 'Semestral',
  annual: 'Anual',
};

type LicenseStatusAction = Extract<LicenseStatus, 'active' | 'expired' | 'canceled'>;

type LicenseStatusActionOption = {
  status: LicenseStatusAction;
  label: string;
  confirmationVerb: string;
  successMessage: string;
};

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Sem vencimento';
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

function createDefaultExpirationDate() {
  const date = new Date();
  date.setDate(date.getDate() + 30);

  return date.toISOString().slice(0, 10);
}

function normalizeExpirationDate(value: string) {
  if (!value) {
    return null;
  }

  return new Date(value + 'T23:59:59.000Z').toISOString();
}

function normalizeOptionalFormText(value: string) {
  const normalized = value.trim();

  return normalized ? normalized : null;
}

function getLicenseStatusActions(status: LicenseStatus): LicenseStatusActionOption[] {
  if (status === 'active') {
    return [
      {
        status: 'expired',
        label: 'Expirar',
        confirmationVerb: 'expirar',
        successMessage: 'Licença expirada com sucesso.',
      },
      {
        status: 'canceled',
        label: 'Cancelar',
        confirmationVerb: 'cancelar',
        successMessage: 'Licença cancelada com sucesso.',
      },
    ];
  }

  if (status === 'expired') {
    return [
      {
        status: 'active',
        label: 'Reativar',
        confirmationVerb: 'reativar',
        successMessage: 'Licença reativada com sucesso.',
      },
      {
        status: 'canceled',
        label: 'Cancelar',
        confirmationVerb: 'cancelar',
        successMessage: 'Licença cancelada com sucesso.',
      },
    ];
  }

  if (status === 'canceled') {
    return [
      {
        status: 'active',
        label: 'Reativar',
        confirmationVerb: 'reativar',
        successMessage: 'Licença reativada com sucesso.',
      },
    ];
  }

  return [];
}

function getUpdateLicenseStatusErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return 'Não foi possível atualizar o status da licença.';
  }

  const messages: Record<string, string> = {
    INVALID_PAYLOAD: 'Dados inválidos para atualizar o status da licença.',
    INVALID_LICENSE_STATUS_ACTION: 'Status de licença inválido para esta ação.',
    UNAUTHORIZED: 'Sessão administrativa inválida. Faça login novamente.',
    FORBIDDEN: 'Você não tem permissão para alterar esta licença.',
    LICENSE_NOT_FOUND: 'Licença não encontrada.',
    LICENSE_STATUS_UPDATE_FAILED:
      'Não foi possível atualizar o status da licença.',
    UPDATE_LICENSE_STATUS_FAILED:
      'Não foi possível atualizar o status da licença.',
  };

  return messages[error.message] ?? error.message;
}

function getUpdateLicenseDetailsErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return 'Não foi possível atualizar a licença.';
  }

  const messages: Record<string, string> = {
    INVALID_PAYLOAD: 'Dados inválidos para atualizar a licença.',
    UNAUTHORIZED: 'Sessão administrativa inválida. Faça login novamente.',
    FORBIDDEN: 'Você não tem permissão para editar esta licença.',
    LICENSE_NOT_FOUND: 'Licença não encontrada.',
    LICENSE_DETAILS_UPDATE_FAILED: 'Não foi possível atualizar a licença.',
    UPDATE_LICENSE_DETAILS_FAILED: 'Não foi possível atualizar a licença.',
  };

  return messages[error.message] ?? error.message;
}

function getCreateLicenseErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return 'Não foi possível criar a licença.';
  }

  const messages: Record<string, string> = {
    INVALID_PAYLOAD: 'Dados inválidos para criar a licença.',
    UNAUTHORIZED: 'Sessão administrativa inválida. Faça login novamente.',
    FORBIDDEN: 'Você não tem permissão para criar licenças.',
    LICENSE_CODE_ALREADY_EXISTS: 'Já existe uma licença com este código.',
    LICENSE_CREATE_FAILED: 'Não foi possível criar a licença.',
    CREATE_LICENSE_FAILED: 'Não foi possível criar a licença.',
  };

  return messages[error.message] ?? error.message;
}

export function AdminLicensesPage() {
  const [licenses, setLicenses] = useState<License[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [licenseCode, setLicenseCode] = useState('');
  const [label, setLabel] = useState('');
  const [planType, setPlanType] = useState<LicensePlanType>('monthly');
  const [expiresAt, setExpiresAt] = useState(createDefaultExpirationDate());
  const [maxDevices, setMaxDevices] = useState(2);
  const [maxConcurrentStreams, setMaxConcurrentStreams] = useState(1);
  const [allowUserManageSources, setAllowUserManageSources] = useState(true);
  const [selectedLicense, setSelectedLicense] = useState<License | null>(null);
  const [licenseDevices, setLicenseDevices] = useState<LicenseDevice[]>([]);
  const [licenseSources, setLicenseSources] = useState<LicenseIptvSource[]>([]);
  const [playbackSessions, setPlaybackSessions] = useState<PlaybackSession[]>([]);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [isCreatingSource, setIsCreatingSource] = useState(false);
  const [sourceName, setSourceName] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceType, setSourceType] = useState<LicenseIptvSource['type']>('m3u');
  const [updatingLicenseStatusId, setUpdatingLicenseStatusId] = useState<string | null>(
    null,
  );

  const [editingLicense, setEditingLicense] = useState<License | null>(null);
  const [isUpdatingLicense, setIsUpdatingLicense] = useState(false);

  const [editLabel, setEditLabel] = useState('');
  const [editPlanType, setEditPlanType] = useState<LicensePlanType>('monthly');
  const [editExpiresAt, setEditExpiresAt] = useState('');
  const [editMaxDevices, setEditMaxDevices] = useState(1);
  const [editMaxConcurrentStreams, setEditMaxConcurrentStreams] = useState(1);
  const [editAllowUserManageSources, setEditAllowUserManageSources] = useState(true);
  const [editNotes, setEditNotes] = useState('');

  const activePlaybackSessions = useMemo(
    () => playbackSessions.filter((session) => session.status === 'active'),
    [playbackSessions],
  );

  const recentPlaybackHistory = useMemo(
    () => playbackSessions.filter((session) => session.status !== 'active'),
    [playbackSessions],
  );

  const activeLicensesCount = useMemo(
    () => licenses.filter((license) => license.status === 'active').length,
    [licenses],
  );

  async function loadLicenses() {
    try {
      setIsLoading(true);
      setErrorMessage(null);

      const data = await listAdminLicenses();

      setLicenses(data);
    } catch {
      setErrorMessage('Não foi possível carregar as licenças.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadLicenses();
  }, []);

  async function loadLicenseDetails(license: License, options?: { silent?: boolean }) {
    try {
      if (!options?.silent) {
        setIsLoadingDetails(true);
      }

      setErrorMessage(null);
      setSelectedLicense(license);

      const [devicesData, sourcesData, sessionsData] = await Promise.all([
        listAdminLicenseDevices(license.id),
        listAdminLicenseIptvSources(license.id),
        listAdminPlaybackSessions(license.id),
      ]);

      setLicenseDevices(devicesData);
      setLicenseSources(sourcesData);
      setPlaybackSessions(sessionsData);
    } catch {
      setErrorMessage('Não foi possível carregar os detalhes da licença.');
    } finally {
      if (!options?.silent) {
        setIsLoadingDetails(false);
      }
    }
  }

  const ADMIN_LICENSE_DETAILS_REFRESH_INTERVAL_MS = 5000;

  useEffect(() => {
    if (!selectedLicense) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void loadLicenseDetails(selectedLicense, { silent: true });
    }, ADMIN_LICENSE_DETAILS_REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [selectedLicense]);

  async function handleCreateLicenseIptvSource(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedLicense) {
      setErrorMessage('Selecione uma licença antes de cadastrar a fonte IPTV.');
      return;
    }

    if (!sourceName.trim() || !sourceUrl.trim()) {
      setErrorMessage('Informe o nome e a URL da fonte IPTV.');
      return;
    }

    try {
      setIsCreatingSource(true);
      setErrorMessage(null);
      setSuccessMessage(null);

      await createAdminLicenseIptvSource({
        license_id: selectedLicense.id,
        name: sourceName,
        source_url: sourceUrl,
        type: sourceType,
        is_active: true,
        created_by: 'admin',
      });

      setSuccessMessage('Fonte IPTV vinculada à licença com sucesso.');
      setSourceName('');
      setSourceUrl('');
      setSourceType('m3u');

      await loadLicenseDetails(selectedLicense);
    } catch {
      setErrorMessage('Não foi possível cadastrar a fonte IPTV da licença.');
    } finally {
      setIsCreatingSource(false);
    }
  }

  function openEditLicenseModal(license: License) {
    setEditingLicense(license);
    setEditLabel(license.label ?? '');
    setEditPlanType(license.plan_type);
    setEditExpiresAt(license.expires_at ? license.expires_at.slice(0, 10) : '');
    setEditMaxDevices(license.max_devices);
    setEditMaxConcurrentStreams(license.max_concurrent_streams);
    setEditAllowUserManageSources(license.allow_user_manage_sources);
    setEditNotes(license.notes ?? '');
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  function closeEditLicenseModal() {
    if (isUpdatingLicense) {
      return;
    }

    setEditingLicense(null);
  }

  async function handleUpdateLicense(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingLicense) {
      return;
    }

    if (editMaxDevices < 1 || editMaxConcurrentStreams < 1) {
      setErrorMessage('Dispositivos e telas simultâneas devem ser maiores ou iguais a 1.');
      return;
    }

    try {
      setIsUpdatingLicense(true);
      setErrorMessage(null);
      setSuccessMessage(null);

      const updatedLicense = await updateAdminLicenseDetails({
        licenseId: editingLicense.id,
        label: normalizeOptionalFormText(editLabel),
        plan_type: editPlanType,
        expires_at: normalizeExpirationDate(editExpiresAt),
        max_devices: editMaxDevices,
        max_concurrent_streams: editMaxConcurrentStreams,
        allow_user_manage_sources: editAllowUserManageSources,
        notes: normalizeOptionalFormText(editNotes),
      });

      setLicenses((currentLicenses) =>
        currentLicenses.map((license) =>
          license.id === updatedLicense.id ? updatedLicense : license,
        ),
      );

      setSelectedLicense((currentLicense) =>
        currentLicense?.id === updatedLicense.id ? updatedLicense : currentLicense,
      );

      setEditingLicense(null);
      setSuccessMessage('Licença atualizada com sucesso.');
    } catch (error) {
      setErrorMessage(getUpdateLicenseDetailsErrorMessage(error));
    } finally {
      setIsUpdatingLicense(false);
    }
  }

  async function handleUpdateLicenseStatus(
    license: License,
    action: LicenseStatusActionOption,
  ) {
    const confirmed = window.confirm(
      `Deseja ${action.confirmationVerb} a licença ${license.license_code}?`,
    );

    if (!confirmed) {
      return;
    }

    try {
      setUpdatingLicenseStatusId(license.id);
      setErrorMessage(null);
      setSuccessMessage(null);

      const updatedLicense = await updateAdminLicenseStatus({
        licenseId: license.id,
        status: action.status,
      });

      setLicenses((currentLicenses) =>
        currentLicenses.map((currentLicense) =>
          currentLicense.id === updatedLicense.id ? updatedLicense : currentLicense,
        ),
      );

      setSelectedLicense((currentLicense) =>
        currentLicense?.id === updatedLicense.id ? updatedLicense : currentLicense,
      );

      setSuccessMessage(action.successMessage);
    } catch (error) {
      setErrorMessage(getUpdateLicenseStatusErrorMessage(error));
    } finally {
      setUpdatingLicenseStatusId(null);
    }
  }


  async function handleCreateLicense(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedCode = licenseCode.trim().toUpperCase();

    if (!normalizedCode) {
      setErrorMessage('Informe um código de licença.');
      return;
    }

    try {
      setIsCreating(true);
      setErrorMessage(null);
      setSuccessMessage(null);

      await createAdminLicense({
        license_code: normalizedCode,
        label: label.trim() || null,
        plan_type: planType,
        expires_at: normalizeExpirationDate(expiresAt),
        max_devices: maxDevices,
        max_concurrent_streams: maxConcurrentStreams,
        allow_user_manage_sources: allowUserManageSources,
      });

      setSuccessMessage('Licença criada com sucesso.');
      setLicenseCode('');
      setLabel('');
      setPlanType('monthly');
      setExpiresAt(createDefaultExpirationDate());
      setMaxDevices(2);
      setMaxConcurrentStreams(1);
      setAllowUserManageSources(true);
      setSelectedLicense(null);
      setLicenseDevices([]);
      setLicenseSources([]);
      setPlaybackSessions([]);

      await loadLicenses();
    } catch (error) {
      setErrorMessage(getCreateLicenseErrorMessage(error));
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <AdminLayout>
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-xf-muted">
            Administração
          </p>

          <h1 className="mt-3 text-4xl font-black tracking-tight">
            Licenças
          </h1>

          <p className="mt-3 max-w-3xl text-base text-xf-muted">
            Gestão do novo modelo de licenciamento anônimo, com código
            recuperável, limite de dispositivos e limite de telas simultâneas.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <article className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-xf-muted">
              Total
            </p>
            <p className="mt-2 text-3xl font-black">{licenses.length}</p>
          </article>

          <article className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-xf-muted">
              Ativas
            </p>
            <p className="mt-2 text-3xl font-black">{activeLicensesCount}</p>
          </article>

          <article className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-xf-muted">
              Modelo
            </p>
            <p className="mt-2 text-lg font-bold">Licenciamento anônimo</p>
          </article>
        </div>

        <form
          onSubmit={handleCreateLicense}
          className="grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-5 md:grid-cols-2 xl:grid-cols-4"
        >
          <label className="flex flex-col gap-2">
            <span className="text-sm font-bold text-white">Código</span>
            <input
              value={licenseCode}
              onChange={(event) => setLicenseCode(event.target.value)}
              placeholder="XFLX-ABCD-001"
              className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition focus:border-xf-red"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-bold text-white">Nome interno</span>
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Cliente / referência"
              className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition focus:border-xf-red"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-bold text-white">Plano</span>
            <select
              value={planType}
              onChange={(event) => setPlanType(event.target.value as LicensePlanType)}
              className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition focus:border-xf-red"
            >
              <option value="monthly">Mensal</option>
              <option value="quarterly">Trimestral</option>
              <option value="semiannual">Semestral</option>
              <option value="annual">Anual</option>
            </select>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-bold text-white">Vencimento</span>
            <input
              type="date"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
              className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition focus:border-xf-red"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-bold text-white">Dispositivos</span>
            <input
              type="number"
              min={1}
              value={maxDevices}
              onChange={(event) => setMaxDevices(Number(event.target.value))}
              className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition focus:border-xf-red"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-bold text-white">Telas simultâneas</span>
            <input
              type="number"
              min={1}
              value={maxConcurrentStreams}
              onChange={(event) => setMaxConcurrentStreams(Number(event.target.value))}
              className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition focus:border-xf-red"
            />
          </label>

          <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3 md:mt-7">
            <input
              type="checkbox"
              checked={allowUserManageSources}
              onChange={(event) => setAllowUserManageSources(event.target.checked)}
            />
            <span className="text-sm font-bold text-white">
              Usuário pode gerenciar lista
            </span>
          </label>

          <button
            type="submit"
            disabled={isCreating}
            className="rounded-xl bg-xf-red px-5 py-3 text-sm font-black text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60 md:mt-7"
          >
            {isCreating ? 'Criando...' : 'Criar licença'}
          </button>
        </form>

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

        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
          {isLoading ? (
            <div className="p-6 text-sm text-xf-muted">
              Carregando licenças...
            </div>
          ) : licenses.length === 0 ? (
            <div className="p-6 text-sm text-xf-muted">
              Nenhuma licença cadastrada até o momento.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1120px] text-left text-sm">
                <thead className="border-b border-white/10 bg-black/20 text-xs uppercase tracking-[0.2em] text-xf-muted">
                  <tr>
                    <th className="px-5 py-4 font-semibold">Código</th>
                    <th className="px-5 py-4 font-semibold">Nome</th>
                    <th className="px-5 py-4 font-semibold">Status</th>
                    <th className="px-5 py-4 font-semibold">Plano</th>
                    <th className="px-5 py-4 font-semibold">Vencimento</th>
                    <th className="px-5 py-4 font-semibold">Dispositivos</th>
                    <th className="px-5 py-4 font-semibold">Telas</th>
                    <th className="px-5 py-4 font-semibold">Listas pelo usuário</th>
                    <th className="px-5 py-4 font-semibold">Ações</th>
                  </tr>
                </thead>

                <tbody>
                  {licenses.map((license) => (
                    <tr
                      key={license.id}
                      className="border-b border-white/5 last:border-0"
                    >
                      <td className="px-5 py-4 font-semibold text-white">
                        {license.license_code}
                      </td>

                      <td className="px-5 py-4 text-xf-muted">
                        {license.label || 'Sem nome'}
                      </td>

                      <td className="px-5 py-4">
                        <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white">
                          {licenseStatusLabels[license.status]}
                        </span>
                      </td>

                      <td className="px-5 py-4 text-xf-muted">
                        {licensePlanLabels[license.plan_type]}
                      </td>

                      <td className="px-5 py-4 text-xf-muted">
                        {formatDateTime(license.expires_at)}
                      </td>

                      <td className="px-5 py-4 text-xf-muted">
                        {license.max_devices}
                      </td>

                      <td className="px-5 py-4 text-xf-muted">
                        {license.max_concurrent_streams}
                      </td>

                      <td className="px-5 py-4 text-xf-muted">
                        {license.allow_user_manage_sources ? 'Sim' : 'Não'}
                      </td>

                        <td className="px-5 py-4">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => void loadLicenseDetails(license)}
                              className="rounded-xl bg-white/10 px-4 py-2 text-xs font-bold text-white transition hover:bg-white/20"
                            >
                              Ver detalhes
                            </button>

                            <button
                              type="button"
                              onClick={() => openEditLicenseModal(license)}
                              className="rounded-xl bg-xf-red px-4 py-2 text-xs font-bold text-white transition hover:bg-red-700"
                            >
                              Editar
                            </button>

                            {getLicenseStatusActions(license.status).map((action) => (
                              <button
                                key={action.status}
                                type="button"
                                onClick={() =>
                                  void handleUpdateLicenseStatus(license, action)
                                }
                                disabled={updatingLicenseStatusId === license.id}
                                className="rounded-xl bg-white/10 px-4 py-2 text-xs font-bold text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {updatingLicenseStatusId === license.id
                                  ? 'Atualizando...'
                                  : action.label}
                              </button>
                            ))}
                          </div>
                        </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {selectedLicense ? (
          <div className="grid gap-4 xl:grid-cols-3">
            <article className="rounded-2xl border border-white/10 bg-white/5 p-5 xl:col-span-3">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-xf-muted">
                Detalhes da licença
              </p>
              <h2 className="mt-2 text-2xl font-black">
                {selectedLicense.license_code}
              </h2>
              <p className="mt-2 text-sm text-xf-muted">
                {selectedLicense.label || 'Licença sem nome interno'}
              </p>

              {isLoadingDetails ? (
                <p className="mt-4 text-sm text-xf-muted">
                  Carregando detalhes...
                </p>
              ) : null}
            </article>

            <article className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <h3 className="text-lg font-black">Dispositivos</h3>
              <p className="mt-1 text-sm text-xf-muted">
                {licenseDevices.length} dispositivo(s) vinculado(s).
              </p>

              <div className="mt-4 flex flex-col gap-3">
                {licenseDevices.length === 0 ? (
                  <p className="text-sm text-xf-muted">
                    Nenhum dispositivo ativado.
                  </p>
                ) : (
                  licenseDevices.map((device) => (
                    <div
                      key={device.id}
                      className="rounded-xl border border-white/10 bg-black/20 p-3"
                    >
                      <p className="font-bold text-white">
                        {device.device_name || 'Dispositivo sem nome'}
                      </p>
                      <p className="mt-1 text-xs text-xf-muted">
                        {device.device_identifier}
                      </p>
                      <p className="mt-1 text-xs text-xf-muted">
                        {device.platform || 'Plataforma não informada'} ·{' '}
                        {device.model || 'Modelo não informado'}
                      </p>
                      <p className="mt-2 text-xs font-bold text-white">
                        {device.is_active ? 'Ativo' : 'Inativo'}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </article>

            <article className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <h3 className="text-lg font-black">Fontes IPTV</h3>
              <p className="mt-1 text-sm text-xf-muted">
                {licenseSources.length} fonte(s) vinculada(s).
              </p>

              <form
                onSubmit={handleCreateLicenseIptvSource}
                className="mt-4 flex flex-col gap-3 rounded-xl border border-white/10 bg-black/20 p-3"
              >
                <input
                  value={sourceName}
                  onChange={(event) => setSourceName(event.target.value)}
                  placeholder="Nome da lista"
                  className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition focus:border-xf-red"
                />

                <input
                  value={sourceUrl}
                  onChange={(event) => setSourceUrl(event.target.value)}
                  placeholder="URL M3U / Xtream"
                  className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition focus:border-xf-red"
                />

                <select
                  value={sourceType}
                  onChange={(event) => setSourceType(event.target.value as LicenseIptvSource['type'])}
                  className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition focus:border-xf-red"
                >
                  <option value="m3u">M3U</option>
                  <option value="xtream">Xtream</option>
                  <option value="manual">Manual</option>
                </select>

                <button
                  type="submit"
                  disabled={isCreatingSource}
                  className="rounded-xl bg-xf-red px-4 py-3 text-xs font-black text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isCreatingSource ? 'Salvando...' : 'Adicionar fonte'}
                </button>
              </form>

              <div className="mt-4 flex flex-col gap-3">
                {licenseSources.length === 0 ? (
                  <p className="text-sm text-xf-muted">
                    Nenhuma fonte IPTV vinculada.
                  </p>
                ) : (
                  licenseSources.map((source) => (
                    <div
                      key={source.id}
                      className="rounded-xl border border-white/10 bg-black/20 p-3"
                    >
                      <p className="font-bold text-white">{source.name}</p>
                      <p className="mt-1 truncate text-xs text-xf-muted">
                        {source.source_url}
                      </p>
                      <p className="mt-2 text-xs font-bold text-white">
                        {source.type.toUpperCase()} ·{' '}
                        {source.is_active ? 'Ativa' : 'Inativa'}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </article>

            <article className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-black">Monitoramento ao vivo</h3>
                  <p className="mt-1 text-sm text-xf-muted">
                    Atualização automática a cada 5s.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => selectedLicense && void loadLicenseDetails(selectedLicense)}
                  className="rounded-xl bg-white/10 px-3 py-2 text-xs font-bold text-white transition hover:bg-white/20"
                >
                  Atualizar agora
                </button>
              </div>

              <div className="mt-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                <p className="text-sm font-black text-emerald-300">
                  Sessões ativas agora
                </p>
                <p className="mt-1 text-xs text-emerald-100/80">
                  {activePlaybackSessions.length} reprodução(ões) em andamento.
                </p>

                <div className="mt-4 flex flex-col gap-3">
                  {activePlaybackSessions.length === 0 ? (
                    <p className="text-sm text-emerald-100/70">
                      Nenhum player ativo neste momento.
                    </p>
                  ) : (
                    activePlaybackSessions.map((session) => (
                      <div
                        key={session.id}
                        className="rounded-xl border border-emerald-400/30 bg-black/30 p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="font-bold text-white">
                            {session.channel_name || 'Canal não informado'}
                          </p>
                          <span className="rounded-full bg-emerald-500 px-2 py-1 text-[10px] font-black uppercase text-black">
                            ao vivo
                          </span>
                        </div>

                        <p className="mt-2 text-xs text-xf-muted">
                          Dispositivo: {session.device_identifier}
                        </p>
                        <p className="mt-1 text-xs text-xf-muted">
                          Início: {formatDateTime(session.started_at)}
                        </p>
                        <p className="mt-1 text-xs text-xf-muted">
                          Último heartbeat: {formatDateTime(session.last_heartbeat_at)}
                        </p>
                        <p className="mt-1 text-xs text-xf-muted">
                          Expira se não renovar: {formatDateTime(session.expires_at)}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="mt-5">
                <h4 className="text-sm font-black text-white">Histórico recente</h4>
                <p className="mt-1 text-sm text-xf-muted">
                  {recentPlaybackHistory.length} sessão(ões) encerradas ou expiradas.
                </p>

                <div className="mt-4 flex flex-col gap-3">
                  {recentPlaybackHistory.length === 0 ? (
                    <p className="text-sm text-xf-muted">
                      Nenhuma sessão histórica registrada.
                    </p>
                  ) : (
                    recentPlaybackHistory.slice(0, 8).map((session) => (
                      <div
                        key={session.id}
                        className="rounded-xl border border-white/10 bg-black/20 p-3"
                      >
                        <p className="font-bold text-white">
                          {session.channel_name || 'Canal não informado'}
                        </p>
                        <p className="mt-1 text-xs text-xf-muted">
                          {session.device_identifier}
                        </p>
                        <p className="mt-1 text-xs text-xf-muted">
                          Início: {formatDateTime(session.started_at)}
                        </p>
                        <p className="mt-1 text-xs text-xf-muted">
                          Último heartbeat: {formatDateTime(session.last_heartbeat_at)}
                        </p>
                        <p className="mt-2 text-xs font-bold text-white">
                          {session.status}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </article>
          </div>
        ) : null}
          {editingLicense ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
              <form
                onSubmit={handleUpdateLicense}
                className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#101014] p-6 shadow-2xl"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.2em] text-xf-muted">
                      Editar licença
                    </p>
                    <h2 className="mt-2 text-2xl font-black text-white">
                      {editingLicense.license_code}
                    </h2>
                  </div>

                  <button
                    type="button"
                    onClick={closeEditLicenseModal}
                    disabled={isUpdatingLicense}
                    className="rounded-xl bg-white/10 px-3 py-2 text-sm font-bold text-white transition hover:bg-white/20 disabled:opacity-60"
                  >
                    Fechar
                  </button>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <label className="flex flex-col gap-2 md:col-span-2">
                    <span className="text-sm font-bold text-white">Nome interno</span>
                    <input
                      value={editLabel}
                      onChange={(event) => setEditLabel(event.target.value)}
                      className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition focus:border-xf-red"
                    />
                  </label>

                  <label className="flex flex-col gap-2">
                    <span className="text-sm font-bold text-white">Plano</span>
                    <select
                      value={editPlanType}
                      onChange={(event) => setEditPlanType(event.target.value as LicensePlanType)}
                      className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition focus:border-xf-red"
                    >
                      <option value="monthly">Mensal</option>
                      <option value="quarterly">Trimestral</option>
                      <option value="semiannual">Semestral</option>
                      <option value="annual">Anual</option>
                    </select>
                  </label>

                  <label className="flex flex-col gap-2">
                    <span className="text-sm font-bold text-white">Vencimento</span>
                    <input
                      type="date"
                      value={editExpiresAt}
                      onChange={(event) => setEditExpiresAt(event.target.value)}
                      className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition focus:border-xf-red"
                    />
                  </label>

                  <label className="flex flex-col gap-2">
                    <span className="text-sm font-bold text-white">Dispositivos</span>
                    <input
                      type="number"
                      min={1}
                      value={editMaxDevices}
                      onChange={(event) => setEditMaxDevices(Number(event.target.value))}
                      className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition focus:border-xf-red"
                    />
                  </label>

                  <label className="flex flex-col gap-2">
                    <span className="text-sm font-bold text-white">Telas simultâneas</span>
                    <input
                      type="number"
                      min={1}
                      value={editMaxConcurrentStreams}
                      onChange={(event) => setEditMaxConcurrentStreams(Number(event.target.value))}
                      className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition focus:border-xf-red"
                    />
                  </label>

                  <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3 md:mt-7">
                    <input
                      type="checkbox"
                      checked={editAllowUserManageSources}
                      onChange={(event) => setEditAllowUserManageSources(event.target.checked)}
                    />
                    <span className="text-sm font-bold text-white">
                      Usuário pode gerenciar lista
                    </span>
                  </label>

                  <label className="flex flex-col gap-2 md:col-span-2">
                    <span className="text-sm font-bold text-white">Observações</span>
                    <textarea
                      value={editNotes}
                      onChange={(event) => setEditNotes(event.target.value)}
                      rows={4}
                      className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition focus:border-xf-red"
                    />
                  </label>
                </div>

                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={closeEditLicenseModal}
                    disabled={isUpdatingLicense}
                    className="rounded-xl bg-white/10 px-5 py-3 text-sm font-black text-white transition hover:bg-white/20 disabled:opacity-60"
                  >
                    Cancelar
                  </button>

                  <button
                    type="submit"
                    disabled={isUpdatingLicense}
                    className="rounded-xl bg-xf-red px-5 py-3 text-sm font-black text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isUpdatingLicense ? 'Salvando...' : 'Salvar alterações'}
                  </button>
                </div>
              </form>
            </div>
          ) : null}


      </section>
    </AdminLayout>
  );
}
