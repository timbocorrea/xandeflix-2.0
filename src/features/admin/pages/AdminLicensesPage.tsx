import { useEffect, useMemo, useState } from 'react';

import { AdminLayout } from '../components/AdminLayout';

import {
  createAdminLicense,
  createAdminLicenseIptvSource,
  importAdminLicenseIptvSourceChannels,
  listAdminClients,
  testAdminLicenseIptvSource,
  updateAdminLicenseDetails,
  updateAdminLicenseDeviceStatus,
  updateAdminLicenseStatus,
  listAdminLicenseDevices,
  listAdminLicenseIptvSources,
  listAdminLicenses,
  listAdminPlaybackSessions,
} from '../services';

import type {
  ImportLicenseIptvSourceChannelsResult,
  LicenseIptvSourceDiagnostic,
} from '../services';

import type {
  Client,
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

function createOperationalLicenseNotes(input: {
  client: Client;
  deviceIdentifier: string;
  deviceName: string;
  devicePlatform: string;
}) {
  const lines = [
    'Cliente operacional: ' + input.client.name + ' (' + input.client.id + ')',
    input.deviceIdentifier.trim()
      ? 'ID do aparelho informado para ativação: ' + input.deviceIdentifier.trim()
      : '',
    input.deviceName.trim()
      ? 'Nome do aparelho informado: ' + input.deviceName.trim()
      : '',
    input.devicePlatform.trim()
      ? 'Plataforma informada: ' + input.devicePlatform.trim()
      : '',
    'Orientação: entregar o código da licença ao usuário para ativação no app.',
  ].filter(Boolean);

  return lines.join('\n');
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

function getCreateLicenseIptvSourceErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return 'Não foi possível cadastrar a fonte IPTV da licença.';
  }

  const messages: Record<string, string> = {
    INVALID_PAYLOAD: 'Informe nome, URL e tipo válidos para a fonte IPTV.',
    UNAUTHORIZED: 'Sessão administrativa inválida. Faça login novamente.',
    FORBIDDEN: 'Você não tem permissão para alterar esta licença.',
    LICENSE_NOT_FOUND: 'Licença não encontrada.',
    LICENSE_IPTV_SOURCE_CREATE_FAILED:
      'Não foi possível cadastrar a fonte IPTV da licença.',
    CREATE_LICENSE_IPTV_SOURCE_FAILED:
      'Não foi possível cadastrar a fonte IPTV da licença.',
  };

  return messages[error.message] ?? error.message;
}

function getTestLicenseIptvSourceErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return 'Não foi possível testar a fonte IPTV da licença.';
  }

  const messages: Record<string, string> = {
    INVALID_PAYLOAD: 'Fonte IPTV inválida para teste.',
    UNAUTHORIZED: 'Sessão administrativa inválida. Faça login novamente.',
    FORBIDDEN: 'Você não tem permissão para testar esta fonte IPTV.',
    LICENSE_IPTV_SOURCE_NOT_FOUND: 'Fonte IPTV não encontrada.',
    LICENSE_NOT_FOUND: 'Licença não encontrada.',
    TEST_LICENSE_IPTV_SOURCE_FAILED:
      'Não foi possível testar a fonte IPTV da licença.',
  };

  return messages[error.message] ?? error.message;
}

function getImportLicenseIptvSourceChannelsErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return 'Não foi possível importar os canais desta fonte.';
  }

  const messages: Record<string, string> = {
    INVALID_PAYLOAD: 'Fonte inválida para importação.',
    UNAUTHORIZED: 'Sessão administrativa inválida.',
    FORBIDDEN: 'Você não tem permissão para importar esta fonte.',
    LICENSE_IPTV_SOURCE_NOT_FOUND: 'Fonte IPTV não encontrada.',
    LICENSE_NOT_FOUND: 'Licença vinculada não encontrada.',
    IPTV_SOURCE_TYPE_NOT_SUPPORTED:
      'Tipo de fonte ainda não suportado para importação.',
    XTREAM_IMPORT_NOT_SUPPORTED_YET:
      'Importação Xtream ainda não suportada nesta fase.',
    IPTV_SOURCE_FETCH_FAILED: 'Não foi possível acessar a fonte IPTV.',
    IPTV_SOURCE_PARSE_FAILED: 'Não foi possível interpretar a playlist.',
    CHANNELS_CACHE_IMPORT_FAILED:
      'Não foi possível gravar os canais no cache.',
    IMPORT_LICENSE_IPTV_SOURCE_CHANNELS_FAILED:
      'Não foi possível importar os canais desta fonte.',
  };

  return messages[error.message] ?? error.message;
}

function getUpdateLicenseDeviceStatusErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return 'Não foi possível atualizar o dispositivo.';
  }

  const messages: Record<string, string> = {
    INVALID_PAYLOAD: 'Dados inválidos para atualizar o dispositivo.',
    UNAUTHORIZED: 'Sessão administrativa inválida. Faça login novamente.',
    FORBIDDEN: 'Você não tem permissão para alterar dispositivos desta licença.',
    LICENSE_DEVICE_NOT_FOUND: 'Dispositivo não encontrado.',
    LICENSE_NOT_FOUND: 'Licença não encontrada.',
    LICENSE_DEVICE_STATUS_UPDATE_FAILED:
      'Não foi possível atualizar o dispositivo.',
    UPDATE_LICENSE_DEVICE_STATUS_FAILED:
      'Não foi possível atualizar o dispositivo.',
  };

  return messages[error.message] ?? error.message;
}

function formatDiagnosticBytes(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return 'Não informado';
  }

  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function formatDiagnosticHttpStatus(diagnostic: LicenseIptvSourceDiagnostic) {
  if (!diagnostic.responded || diagnostic.httpStatus === null) {
    return 'Sem resposta';
  }

  return diagnostic.httpStatusText
    ? `${diagnostic.httpStatus} ${diagnostic.httpStatusText}`
    : String(diagnostic.httpStatus);
}

export function AdminLicensesPage() {
  const [licenses, setLicenses] = useState<License[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingClients, setIsLoadingClients] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [activationDeviceIdentifier, setActivationDeviceIdentifier] = useState('');
  const [activationDeviceName, setActivationDeviceName] = useState('');
  const [activationDevicePlatform, setActivationDevicePlatform] = useState('fire-tv');
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
  const [testingSourceId, setTestingSourceId] = useState<string | null>(null);
  const [sourceDiagnostics, setSourceDiagnostics] = useState<
    Record<string, LicenseIptvSourceDiagnostic>
  >({});
  const [sourceTestErrors, setSourceTestErrors] = useState<Record<string, string>>(
    {},
  );
  const [importingSourceId, setImportingSourceId] = useState<string | null>(null);
  const [sourceImportResults, setSourceImportResults] = useState<
    Record<string, ImportLicenseIptvSourceChannelsResult>
  >({});
  const [updatingLicenseStatusId, setUpdatingLicenseStatusId] = useState<string | null>(
    null,
  );
  const [updatingLicenseDeviceId, setUpdatingLicenseDeviceId] = useState<
    string | null
  >(null);

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

  const selectedClient = useMemo(
    () => clients.find((client) => client.id === selectedClientId) ?? null,
    [clients, selectedClientId],
  );

  async function loadClients() {
    try {
      setIsLoadingClients(true);
      setErrorMessage(null);

      const data = await listAdminClients();

      setClients(data);
    } catch {
      setErrorMessage('Não foi possível carregar os clientes para vincular licenças.');
    } finally {
      setIsLoadingClients(false);
    }
  }

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
    void loadClients();
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
    } catch (error) {
      setErrorMessage(getCreateLicenseIptvSourceErrorMessage(error));
    } finally {
      setIsCreatingSource(false);
    }
  }

  async function handleTestLicenseIptvSource(source: LicenseIptvSource) {
    try {
      setTestingSourceId(source.id);
      setErrorMessage(null);
      setSuccessMessage(null);
      setSourceTestErrors((currentErrors) => {
        const nextErrors = { ...currentErrors };
        delete nextErrors[source.id];
        return nextErrors;
      });

      const diagnostic = await testAdminLicenseIptvSource(source.id);

      setSourceDiagnostics((currentDiagnostics) => ({
        ...currentDiagnostics,
        [source.id]: diagnostic,
      }));

    } catch (error) {
      setSourceTestErrors((currentErrors) => ({
        ...currentErrors,
        [source.id]: getTestLicenseIptvSourceErrorMessage(error),
      }));
    } finally {
      setTestingSourceId(null);
    }
  }

  async function handleImportLicenseIptvSourceChannels(source: LicenseIptvSource) {
    try {
      setImportingSourceId(source.id);
      setErrorMessage(null);
      setSuccessMessage(null);

      const result = await importAdminLicenseIptvSourceChannels(source.id);

      setSourceImportResults((currentResults) => ({
        ...currentResults,
        [source.id]: result,
      }));

      setSuccessMessage('Importação de canais concluída.');
    } catch (error) {
      setErrorMessage(getImportLicenseIptvSourceChannelsErrorMessage(error));
    } finally {
      setImportingSourceId(null);
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

  async function handleUpdateLicenseDeviceStatus(
    device: LicenseDevice,
    nextIsActive: boolean,
  ) {
    if (!selectedLicense) {
      return;
    }

    const actionVerb = nextIsActive ? 'ativar' : 'desativar';
    const confirmed = window.confirm(
      `Deseja ${actionVerb} o dispositivo ${device.device_identifier} da licença ${selectedLicense.license_code}?`,
    );

    if (!confirmed) {
      return;
    }

    try {
      setUpdatingLicenseDeviceId(device.id);
      setErrorMessage(null);
      setSuccessMessage(null);

      const updatedDevice = await updateAdminLicenseDeviceStatus({
        deviceId: device.id,
        isActive: nextIsActive,
      });

      setLicenseDevices((currentDevices) =>
        currentDevices.map((currentDevice) =>
          currentDevice.id === updatedDevice.id ? updatedDevice : currentDevice,
        ),
      );

      setSuccessMessage(
        nextIsActive
          ? 'Dispositivo ativado com sucesso.'
          : 'Dispositivo desativado com sucesso.',
      );
    } catch (error) {
      setErrorMessage(getUpdateLicenseDeviceStatusErrorMessage(error));
    } finally {
      setUpdatingLicenseDeviceId(null);
    }
  }


  async function handleCreateLicense(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedCode = licenseCode.trim().toUpperCase();
    const normalizedDeviceIdentifier = activationDeviceIdentifier.trim();

    if (!selectedClient) {
      setErrorMessage('Selecione o cliente que receberá esta licença.');
      return;
    }

    if (!normalizedCode) {
      setErrorMessage('Informe um código de licença.');
      return;
    }

    try {
      setIsCreating(true);
      setErrorMessage(null);
      setSuccessMessage(null);

      const createdLicense = await createAdminLicense({
        license_code: normalizedCode,
        label: label.trim() || selectedClient.name,
        plan_type: planType,
        expires_at: normalizeExpirationDate(expiresAt),
        max_devices: maxDevices,
        max_concurrent_streams: maxConcurrentStreams,
        allow_user_manage_sources: allowUserManageSources,
        notes: createOperationalLicenseNotes({
          client: selectedClient,
          deviceIdentifier: normalizedDeviceIdentifier,
          deviceName: activationDeviceName,
          devicePlatform: activationDevicePlatform,
        }),
      });

      setSuccessMessage(
        'Licença criada para ' +
          selectedClient.name +
          '. Informe este código ao cliente para ativar no Fire Stick: ' +
          createdLicense.license_code,
      );
      setSelectedClientId('');
      setActivationDeviceIdentifier('');
      setActivationDeviceName('');
      setActivationDevicePlatform('fire-tv');
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
      setSourceDiagnostics({});
      setSourceImportResults({});

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
            Gestão do novo modelo de licenciamento com cliente identificado,\n            código recuperável, limite de dispositivos e telas simultâneas.
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
            <p className="mt-2 text-lg font-bold">Cliente → Licença → Ativação</p>
          </article>
        </div>

        <form
          onSubmit={handleCreateLicense}
          className="grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-5 md:grid-cols-2 xl:grid-cols-4"
        >
          <label className="flex flex-col gap-2 xl:col-span-2">
            <span className="text-sm font-bold text-white">Cliente</span>
            <select
              value={selectedClientId}
              onChange={(event) => {
                const nextClientId = event.target.value;
                const nextClient = clients.find((client) => client.id === nextClientId) ?? null;

                setSelectedClientId(nextClientId);

                if (nextClient && !label.trim()) {
                  setLabel(nextClient.name);
                }
              }}
              disabled={isLoadingClients}
              className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition focus:border-xf-red"
            >
              <option value="">
                {isLoadingClients ? 'Carregando clientes...' : 'Selecione o cliente'}
              </option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name} {client.email ? '- ' + client.email : ''}
                </option>
              ))}
            </select>
            <span className="text-xs text-xf-muted">
              A licença ficará operacionalmente identificada para este cliente. O vínculo técnico do aparelho será concluído quando o usuário ativar o código no app.
            </span>
          </label>

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
            <span className="text-xs text-xf-muted">
              Inventário/vínculo de aparelhos; não é o limite principal de consumo.
            </span>
            <input
              type="number"
              min={1}
              value={maxDevices}
              onChange={(event) => setMaxDevices(Number(event.target.value))}
              className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition focus:border-xf-red"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-bold text-white">
              Telas simultâneas permitidas
            </span>
            <span className="text-xs text-xf-muted">
              Limite operacional principal de reprodução da licença.
            </span>
            <input
              type="number"
              min={1}
              value={maxConcurrentStreams}
              onChange={(event) => setMaxConcurrentStreams(Number(event.target.value))}
              className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition focus:border-xf-red"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-bold text-white">ID do aparelho</span>
            <input
              value={activationDeviceIdentifier}
              onChange={(event) => setActivationDeviceIdentifier(event.target.value)}
              placeholder="ID exibido no Fire Stick"
              className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition focus:border-xf-red"
            />
            <span className="text-xs text-xf-muted">
              Este ID será registrado nas observações da licença. O vínculo técnico ocorre quando o cliente ativa o código no app.
            </span>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-bold text-white">Nome do aparelho</span>
            <input
              value={activationDeviceName}
              onChange={(event) => setActivationDeviceName(event.target.value)}
              placeholder="Fire Stick sala"
              className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition focus:border-xf-red"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-bold text-white">Plataforma</span>
            <select
              value={activationDevicePlatform}
              onChange={(event) => setActivationDevicePlatform(event.target.value)}
              className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition focus:border-xf-red"
            >
              <option value="fire-tv">Fire TV / Fire Stick</option>
              <option value="android-tv">Android TV</option>
              <option value="web">Web</option>
              <option value="mobile">Mobile</option>
              <option value="other">Outro</option>
            </select>
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
            {isCreating ? 'Criando...' : 'Criar licença e liberar acesso'}
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
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <span
                          className={
                            device.is_active
                              ? 'rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-200'
                              : 'rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-xf-muted'
                          }
                        >
                          {device.is_active ? 'Ativo' : 'Inativo'}
                        </span>

                        <button
                          type="button"
                          onClick={() =>
                            void handleUpdateLicenseDeviceStatus(
                              device,
                              !device.is_active,
                            )
                          }
                          disabled={updatingLicenseDeviceId === device.id}
                          className={
                            device.is_active
                              ? 'rounded-xl bg-white/10 px-3 py-2 text-xs font-bold text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50'
                              : 'rounded-xl bg-xf-red px-3 py-2 text-xs font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50'
                          }
                        >
                          {updatingLicenseDeviceId === device.id
                            ? 'Atualizando...'
                            : device.is_active
                              ? 'Desativar'
                              : 'Ativar'}
                        </button>
                      </div>
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
                  licenseSources.map((source) => {
                    const diagnostic = sourceDiagnostics[source.id];
                    const sourceTestError = sourceTestErrors[source.id];
                    const importResult = sourceImportResults[source.id];
                    const isTestingSource = testingSourceId === source.id;
                    const isImportingSource = importingSourceId === source.id;

                    return (
                      <div
                        key={source.id}
                        className="rounded-xl border border-white/10 bg-black/20 p-3"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <p className="font-bold text-white">{source.name}</p>
                            <p className="mt-1 truncate text-xs text-xf-muted">
                              {source.source_url}
                            </p>
                            <p className="mt-2 text-xs font-bold text-white">
                              {source.type.toUpperCase()} ·{' '}
                              {source.is_active ? 'Ativa' : 'Inativa'}
                            </p>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => void handleTestLicenseIptvSource(source)}
                              disabled={isTestingSource}
                              className="rounded-xl bg-white/10 px-3 py-2 text-xs font-bold text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {isTestingSource ? 'Testando...' : 'Testar fonte'}
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                void handleImportLicenseIptvSourceChannels(source)
                              }
                              disabled={isImportingSource}
                              className="rounded-xl bg-xf-red px-3 py-2 text-xs font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {isImportingSource
                                ? 'Importando...'
                                : 'Importar canais'}
                            </button>
                          </div>
                        </div>

                        {sourceTestError ? (
                          <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-100">
                            {sourceTestError}
                          </p>
                        ) : null}

                        {isTestingSource ? (
                          <p className="mt-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-xf-muted">
                            Testando a fonte IPTV...
                          </p>
                        ) : diagnostic ? (
                          <p
                            className={
                              diagnostic.success
                                ? 'mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-100'
                                : 'mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-100'
                            }
                          >
                            {diagnostic.success
                              ? 'Teste concluído com sucesso'
                              : 'Teste concluído com alerta'}
                            {' · '}
                            {formatDiagnosticHttpStatus(diagnostic)}
                            {' · '}
                            {diagnostic.entryCount} entrada(s)
                          </p>
                        ) : null}

                        {diagnostic ? (
                          <div
                            className={
                              diagnostic.success
                                ? 'mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3'
                                : 'mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3'
                            }
                          >
                            <div className="grid gap-3 text-xs sm:grid-cols-2">
                              <div>
                                <p className="font-black text-white">HTTP</p>
                                <p className="mt-1 text-xf-muted">
                                  {formatDiagnosticHttpStatus(diagnostic)}
                                </p>
                              </div>

                              <div>
                                <p className="font-black text-white">Content-Type</p>
                                <p className="mt-1 break-words text-xf-muted">
                                  {diagnostic.contentType || 'Não informado'}
                                </p>
                              </div>

                              <div>
                                <p className="font-black text-white">Tamanho</p>
                                <p className="mt-1 text-xf-muted">
                                  {formatDiagnosticBytes(
                                    diagnostic.contentLength ?? diagnostic.bytesRead,
                                  )}
                                  {diagnostic.wasTruncated ? ' lido parcialmente' : ''}
                                </p>
                              </div>

                              <div>
                                <p className="font-black text-white">Playlist</p>
                                <p className="mt-1 text-xf-muted">
                                  {diagnostic.looksLikeM3u ? 'M3U detectada' : 'Não detectada'} ·{' '}
                                  {diagnostic.entryCount} entrada(s)
                                </p>
                              </div>
                            </div>

                            <p className="mt-3 text-xs text-xf-muted">
                              EXTINF: {diagnostic.extinfLines} · URLs: {diagnostic.playableUrlLines}
                            </p>

                            {diagnostic.errorMessage ? (
                              <p className="mt-3 rounded-lg bg-black/30 px-3 py-2 text-xs font-semibold text-amber-100">
                                {diagnostic.errorMessage}
                              </p>
                            ) : null}

                            {diagnostic.sampleGroups.length > 0 ? (
                              <p className="mt-3 text-xs text-xf-muted">
                                Grupos: {diagnostic.sampleGroups.join(', ')}
                              </p>
                            ) : null}

                            {diagnostic.sampleChannels.length > 0 ? (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {diagnostic.sampleChannels.map((channel) => (
                                  <span
                                    key={`${channel.name}-${channel.groupTitle ?? 'sem-grupo'}`}
                                    className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-white"
                                  >
                                    {channel.groupTitle
                                      ? `${channel.name} · ${channel.groupTitle}`
                                      : channel.name}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ) : null}

                        {importResult ? (
                          <div className="mt-4 rounded-xl border border-sky-500/30 bg-sky-500/10 p-3">
                            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <p className="text-sm font-black text-sky-100">
                                  Importação concluída
                                </p>
                                <p className="mt-1 text-xs text-sky-100/80">
                                  {importResult.message}
                                </p>
                              </div>
                              <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-black text-white">
                                Limite: {importResult.limit}
                              </span>
                            </div>

                            <div className="mt-3 grid gap-3 text-xs sm:grid-cols-3">
                              <div>
                                <p className="font-black text-white">Lidos</p>
                                <p className="mt-1 text-xf-muted">
                                  {importResult.totalParsed}
                                </p>
                              </div>
                              <div>
                                <p className="font-black text-white">Importados</p>
                                <p className="mt-1 text-xf-muted">
                                  {importResult.totalImported}
                                </p>
                              </div>
                              <div>
                                <p className="font-black text-white">Atualizados</p>
                                <p className="mt-1 text-xf-muted">
                                  {importResult.totalUpdated}
                                </p>
                              </div>
                              <div>
                                <p className="font-black text-white">Ignorados</p>
                                <p className="mt-1 text-xf-muted">
                                  {importResult.totalSkipped}
                                </p>
                              </div>
                              <div>
                                <p className="font-black text-white">Falhas</p>
                                <p className="mt-1 text-xf-muted">
                                  {importResult.totalFailed}
                                </p>
                              </div>
                              <div>
                                <p className="font-black text-white">
                                  Limite aplicado
                                </p>
                                <p className="mt-1 text-xf-muted">
                                  {importResult.wasLimited ? 'Sim' : 'Não'}
                                </p>
                              </div>
                            </div>

                            {importResult.sampleChannels.length > 0 ? (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {importResult.sampleChannels.map((channel) => (
                                  <span
                                    key={`${channel.name}-${channel.groupTitle ?? 'sem-grupo'}`}
                                    className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-white"
                                  >
                                    {channel.groupTitle
                                      ? `${channel.name} · ${channel.groupTitle}`
                                      : channel.name}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })
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
                    <span className="text-xs text-xf-muted">
                      Inventário/vínculo de aparelhos; não é o limite principal.
                    </span>
                    <input
                      type="number"
                      min={1}
                      value={editMaxDevices}
                      onChange={(event) => setEditMaxDevices(Number(event.target.value))}
                      className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition focus:border-xf-red"
                    />
                  </label>

                  <label className="flex flex-col gap-2">
                    <span className="text-sm font-bold text-white">
                      Telas simultâneas permitidas
                    </span>
                    <span className="text-xs text-xf-muted">
                      Limite operacional principal de reprodução da licença.
                    </span>
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
