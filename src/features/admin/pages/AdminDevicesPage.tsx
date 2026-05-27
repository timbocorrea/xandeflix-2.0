import { useEffect, useMemo, useState } from 'react';

import { AdminLayout } from '../components/AdminLayout';
import {
  createAdminDevice,
  deleteAdminLicenseAuthorizedDevice,
  deleteAdminLicenseAuthorizedDevices,
  listAdminClients,
  listAdminDevices,
  listAdminLicenseAuthorizedDevices,
} from '../services';
import type { Client, Device } from '../types/admin.types';
import type { LicenseAuthorizedDevice } from '../services/adminDevices.service';

type LicenseDeviceFilter = 'all' | 'active' | 'idle' | 'expired' | 'removable';


const platformOptions = [
  { value: 'android-tv', label: 'Android TV' },
  { value: 'fire-tv', label: 'Fire TV / Fire Stick' },
  { value: 'web', label: 'Web' },
  { value: 'mobile', label: 'Mobile' },
  { value: 'other', label: 'Outro' },
] as const;

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Nunca';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function isRemovableLicenseDevice(device: LicenseAuthorizedDevice) {
  return device.removable;
}

function getOperationalStatusClassName(status: LicenseAuthorizedDevice['operational_status']) {
  const classNames: Record<LicenseAuthorizedDevice['operational_status'], string> = {
    active: 'bg-emerald-500/10 text-emerald-200',
    idle: 'bg-orange-500/15 text-orange-100 ring-1 ring-orange-400/30',
    inactive: 'bg-zinc-500/20 text-zinc-100 ring-1 ring-zinc-300/20',
    expired: 'bg-red-500/15 text-red-100 ring-1 ring-red-400/40',
  };

  return classNames[status];
}

function getOperationalRowClassName(status: LicenseAuthorizedDevice['operational_status']) {
  const classNames: Record<LicenseAuthorizedDevice['operational_status'], string> = {
    active: 'border-b border-white/5 last:border-0',
    idle: 'border-b border-orange-400/20 bg-orange-500/5 last:border-0',
    inactive: 'border-b border-zinc-400/10 bg-zinc-500/5 last:border-0',
    expired: 'border-b border-red-400/20 bg-red-500/5 last:border-0',
  };

  return classNames[status];
}

function getPlanIntervalLabel(value: string) {
  const labels: Record<string, string> = {
    monthly: 'Mensal',
    quarterly: 'Trimestral',
    semiannual: 'Semestral',
    annual: 'Anual',
    unknown: 'Não identificado',
  };

  return labels[value] ?? value;
}

function getBooleanLabel(value: boolean) {
  return value ? 'Ativo' : 'Inativo';
}

function getStatusLabel(status: Client['status']) {
  const labels: Record<Client['status'], string> = {
    active: 'Ativo',
    inactive: 'Inativo',
    expired: 'Expirado',
    blocked: 'Bloqueado',
  };

  return labels[status];
}

function getStatusClassName(status: Client['status']) {
  const classNames: Record<Client['status'], string> = {
    active: 'bg-emerald-500/10 text-emerald-200',
    inactive: 'bg-orange-500/10 text-orange-100',
    expired: 'bg-yellow-500/10 text-yellow-100',
    blocked: 'bg-red-500/10 text-red-200',
  };

  return classNames[status];
}

function getDeviceStatusClassName(value: boolean) {
  return value ? 'bg-emerald-500/10 text-emerald-200' : 'bg-zinc-500/20 text-zinc-200';
}

function getPlatformLabel(value: string | null) {
  if (!value) {
    return 'Não informada';
  }

  return platformOptions.find((option) => option.value === value)?.label ?? value;
}

function getShortId(value: string) {
  return value.length > 12 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDuplicateDeviceError(error: unknown) {
  if (!isRecord(error)) {
    return false;
  }

  const code = typeof error.code === 'string' ? error.code : '';
  const message = typeof error.message === 'string' ? error.message : '';

  return code === '23505' || /duplicate|unique/i.test(message);
}

export function AdminDevicesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [licenseAuthorizedDevices, setLicenseAuthorizedDevices] = useState<LicenseAuthorizedDevice[]>([]);
  const [licenseDeviceFilter, setLicenseDeviceFilter] = useState<LicenseDeviceFilter>('all');
  const [deletingLicenseDeviceId, setDeletingLicenseDeviceId] = useState<string | null>(null);
  const [selectedLicenseDeviceIds, setSelectedLicenseDeviceIds] = useState<string[]>([]);
  const [isBulkDeletingLicenseDevices, setIsBulkDeletingLicenseDevices] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [clientId, setClientId] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [deviceIdentifier, setDeviceIdentifier] = useState('');
  const [platform, setPlatform] = useState('android-tv');

  const clientsById = useMemo(
    () => new Map(clients.map((client) => [client.id, client])),
    [clients],
  );

  const selectedClient = clientId ? clientsById.get(clientId) ?? null : null;

  const filteredLicenseAuthorizedDevices = useMemo(() => {
    return licenseAuthorizedDevices.filter((device) => {
      if (licenseDeviceFilter === 'active') {
        return device.operational_status === 'active';
      }

      if (licenseDeviceFilter === 'idle') {
        return device.operational_status === 'idle' || device.operational_status === 'inactive';
      }

      if (licenseDeviceFilter === 'expired') {
        return device.operational_status === 'expired';
      }

      if (licenseDeviceFilter === 'removable') {
        return device.removable;
      }

      return true;
    });
  }, [licenseAuthorizedDevices, licenseDeviceFilter]);



  const visibleLicenseDeviceIds = useMemo(
    () => filteredLicenseAuthorizedDevices.map((device) => device.id),
    [filteredLicenseAuthorizedDevices],
  );

  const selectedVisibleLicenseDeviceCount = useMemo(
    () =>
      visibleLicenseDeviceIds.filter((deviceId) =>
        selectedLicenseDeviceIds.includes(deviceId),
      ).length,
    [selectedLicenseDeviceIds, visibleLicenseDeviceIds],
  );

  const allVisibleLicenseDevicesSelected =
    visibleLicenseDeviceIds.length > 0 &&
    selectedVisibleLicenseDeviceCount === visibleLicenseDeviceIds.length;

  const devicesCountByClientId = useMemo(() => {
    const counts = new Map<string, number>();

    devices.forEach((device) => {
      counts.set(device.client_id, (counts.get(device.client_id) ?? 0) + 1);
    });

    return counts;
  }, [devices]);

  async function loadAdminData() {
    setIsLoading(true);
    setErrorMessage(null);

    const [devicesData, clientsData, licenseAuthorizedDevicesData] = await Promise.all([
      listAdminDevices(),
      listAdminClients(),
      listAdminLicenseAuthorizedDevices(),
    ]);

    setDevices(devicesData);
    setClients(clientsData);
    setLicenseAuthorizedDevices(licenseAuthorizedDevicesData);
  }

  useEffect(() => {
    let isMounted = true;

    async function loadInitialData() {
      try {
        const [devicesData, clientsData, licenseAuthorizedDevicesData] = await Promise.all([
          listAdminDevices(),
          listAdminClients(),
          listAdminLicenseAuthorizedDevices(),
        ]);

        if (isMounted) {
          setDevices(devicesData);
          setClients(clientsData);
          setLicenseAuthorizedDevices(licenseAuthorizedDevicesData);
        }
      } catch {
        if (isMounted) {
          setErrorMessage('Não foi possível carregar os dispositivos.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadInitialData();

    return () => {
      isMounted = false;
    };
  }, []);

  function handleToggleLicenseDeviceSelection(device: LicenseAuthorizedDevice) {
    setSelectedLicenseDeviceIds((currentIds) =>
      currentIds.includes(device.id)
        ? currentIds.filter((currentId) => currentId !== device.id)
        : [...currentIds, device.id],
    );
  }

  function handleToggleAllVisibleLicenseDevices() {
    if (visibleLicenseDeviceIds.length === 0) {
      return;
    }

    setSelectedLicenseDeviceIds((currentIds) =>
      allVisibleLicenseDevicesSelected
        ? currentIds.filter((deviceId) => !visibleLicenseDeviceIds.includes(deviceId))
        : Array.from(new Set([...currentIds, ...visibleLicenseDeviceIds])),
    );
  }

  async function handleBulkDeleteLicenseAuthorizedDevices() {
    const selectedIds = [...selectedLicenseDeviceIds];

    if (selectedIds.length === 0) {
      setErrorMessage('Selecione ao menos um dispositivo.');
      return;
    }

    const confirmed = window.confirm(
      `Excluir ${selectedIds.length} dispositivo(s) selecionado(s)? Esta ação remove a autorização destes aparelhos.`,
    );

    if (!confirmed) {
      return;
    }

    try {
      setIsBulkDeletingLicenseDevices(true);
      setErrorMessage(null);
      setSuccessMessage(null);

      await deleteAdminLicenseAuthorizedDevices(selectedIds);

      setLicenseAuthorizedDevices((currentDevices) =>
        currentDevices.filter((device) => !selectedIds.includes(device.id)),
      );
      setSelectedLicenseDeviceIds((currentIds) =>
        currentIds.filter((deviceId) => !selectedIds.includes(deviceId)),
      );

      setSuccessMessage(`${selectedIds.length} dispositivo(s) selecionado(s) removido(s) com sucesso.`);
    } catch {
      setErrorMessage('Não foi possível excluir os dispositivos selecionados.');
    } finally {
      setIsBulkDeletingLicenseDevices(false);
    }
  }

  async function handleDeleteLicenseAuthorizedDevice(device: LicenseAuthorizedDevice) {
    if (!isRemovableLicenseDevice(device)) {
      setErrorMessage('Somente dispositivos classificados como removíveis podem ser excluídos por esta tela.');
      return;
    }

    const confirmed = window.confirm(
      `Excluir o dispositivo ${device.device_identifier}? Esta ação remove a autorização deste aparelho na licença.`,
    );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingLicenseDeviceId(device.id);
      setErrorMessage(null);
      setSuccessMessage(null);

      await deleteAdminLicenseAuthorizedDevice(device.id);

      setLicenseAuthorizedDevices((currentDevices) =>
        currentDevices.filter((currentDevice) => currentDevice.id !== device.id),
      );
      setSelectedLicenseDeviceIds((currentIds) =>
        currentIds.filter((currentId) => currentId !== device.id),
      );

      setSuccessMessage('Dispositivo removível excluído com sucesso.');
    } catch {
      setErrorMessage('Não foi possível excluir o dispositivo ocioso.');
    } finally {
      setDeletingLicenseDeviceId(null);
    }
  }

  async function handleCreateDevice(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedDeviceIdentifier = deviceIdentifier.trim();

    if (!clientId) {
      setErrorMessage('Selecione um cliente para vincular o dispositivo.');
      return;
    }

    if (!normalizedDeviceIdentifier) {
      setErrorMessage('Informe o identificador do dispositivo.');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      setSuccessMessage(null);

      await createAdminDevice({
        client_id: clientId,
        device_name: deviceName.trim() || null,
        device_identifier: normalizedDeviceIdentifier,
        platform: platform.trim() || null,
        is_active: true,
      });

      setDeviceName('');
      setDeviceIdentifier('');
      setPlatform('android-tv');
      setSuccessMessage('Dispositivo vinculado ao cliente com sucesso.');

      await loadAdminData();
    } catch (error) {
      setErrorMessage(
        isDuplicateDeviceError(error)
          ? 'Este identificador de dispositivo já está cadastrado. Revise o vínculo antes de criar outro registro.'
          : 'Não foi possível vincular o dispositivo ao cliente.',
      );
    } finally {
      setIsSubmitting(false);
      setIsLoading(false);
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
            Dispositivos
          </h1>
          <p className="mt-3 max-w-3xl text-base text-xf-muted">
            Cadastre e vincule o identificador local do app ao cliente
            autorizado.
          </p>
        </div>

        <form
          onSubmit={handleCreateDevice}
          className="grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-6"
        >
          <div>
            <h2 className="text-xl font-black text-white">
              Vincular novo dispositivo ao cliente — cadastro legado
            </h2>
            <p className="mt-2 text-sm text-xf-muted">
              O identificador deve ser igual ao gerado no app pelo helper
              local do dispositivo.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-bold text-white">
              Cliente
              <select
                className="rounded-xl border border-white/10 bg-black px-4 py-3 text-white outline-none focus:border-xf-red"
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
              >
                <option value="">Selecione um cliente</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name} · {client.status}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm font-bold text-white">
              Nome do dispositivo
              <input
                className="rounded-xl border border-white/10 bg-black px-4 py-3 text-white outline-none focus:border-xf-red"
                placeholder="Ex.: Fire Stick Sala"
                value={deviceName}
                onChange={(event) => setDeviceName(event.target.value)}
              />
            </label>

            <label className="grid gap-2 text-sm font-bold text-white">
              Identificador do dispositivo
              <input
                className="rounded-xl border border-white/10 bg-black px-4 py-3 font-mono text-white outline-none focus:border-xf-red"
                placeholder="Ex.: xf-..."
                value={deviceIdentifier}
                onChange={(event) => setDeviceIdentifier(event.target.value)}
              />
            </label>

            <label className="grid gap-2 text-sm font-bold text-white">
              Plataforma
              <select
                className="rounded-xl border border-white/10 bg-black px-4 py-3 text-white outline-none focus:border-xf-red"
                value={platform}
                onChange={(event) => setPlatform(event.target.value)}
              >
                {platformOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {selectedClient ? (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-xf-muted">
                Cliente selecionado
              </p>
              <div className="mt-3 grid gap-4 md:grid-cols-4">
                <div>
                  <p className="text-xs font-semibold text-xf-muted">Nome</p>
                  <p className="mt-1 font-bold text-white">{selectedClient.name}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-xf-muted">Status</p>
                  <span
                    className={`mt-1 inline-flex rounded-full px-3 py-1 text-xs font-bold ${getStatusClassName(
                      selectedClient.status,
                    )}`}
                  >
                    {getStatusLabel(selectedClient.status)}
                  </span>
                </div>
                <div>
                  <p className="text-xs font-semibold text-xf-muted">Vencimento</p>
                  <p className="mt-1 font-bold text-white">
                    {formatDateTime(selectedClient.expires_at)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-xf-muted">Dispositivos</p>
                  <p className="mt-1 font-bold text-white">
                    {devicesCountByClientId.get(selectedClient.id) ?? 0} vínculo(s)
                  </p>
                </div>
              </div>
              <p className="mt-4 text-sm text-xf-muted">
                O cadastro de dispositivos não representa o limite principal de telas.
                O controle de reprodução deve considerar telas simultâneas da licença.
              </p>
            </div>
          ) : null}

          {errorMessage ? (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
              {errorMessage}
            </div>
          ) : null}

          {successMessage ? (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-200">
              {successMessage}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-fit rounded-xl bg-xf-red px-6 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? 'Vinculando...' : 'Vincular dispositivo'}
          </button>
        </form>

        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
          <div className="border-b border-white/10 bg-black/20 p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-xl font-black text-white">
                  Dispositivos autorizados por licença
                </h2>
                <p className="mt-2 text-sm text-xf-muted">
                  Esta é a fonte usada pela ativação segura do app. A licença só libera aparelhos cadastrados aqui. O vínculo de cliente/licença detalhado aparece na tela Licenças.
                </p>

                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleToggleAllVisibleLicenseDevices}
                    disabled={visibleLicenseDeviceIds.length === 0}
                    className="rounded-xl bg-white/10 px-4 py-2 text-xs font-black text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {allVisibleLicenseDevicesSelected
                      ? 'Desmarcar todos visíveis'
                      : `Selecionar todos visíveis (${visibleLicenseDeviceIds.length})`}
                  </button>

                  <span className="rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-xs font-bold text-xf-muted">
                    Selecionados: {selectedLicenseDeviceIds.length}
                  </span>

                  <button
                    type="button"
                    onClick={() => void handleBulkDeleteLicenseAuthorizedDevices()}
                    disabled={
                      isBulkDeletingLicenseDevices ||
                      selectedLicenseDeviceIds.length === 0
                    }
                    className="rounded-xl bg-red-600 px-4 py-2 text-xs font-black text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isBulkDeletingLicenseDevices
                      ? 'Excluindo...'
                      : `Excluir selecionados (${selectedLicenseDeviceIds.length})`}
                  </button>
                </div>
              </div>

              <label className="grid gap-2 text-sm font-bold text-white">
                Filtrar dispositivos
                <select
                  className="rounded-xl border border-white/10 bg-black px-4 py-3 text-white outline-none focus:border-xf-red"
                  value={licenseDeviceFilter}
                  onChange={(event) =>
                    setLicenseDeviceFilter(event.target.value as LicenseDeviceFilter)
                  }
                >
                  <option value="all">Todos</option>
                  <option value="active">Ativos com acesso recente</option>
                  <option value="idle">Ociosos / inativos</option>
                  <option value="expired">Vencidos</option>
                  <option value="removable">Removíveis</option>
                </select>
              </label>
            </div>
          </div>

          {isLoading ? (
            <div className="p-6 text-sm text-xf-muted">
              Carregando dispositivos autorizados...
            </div>
          ) : filteredLicenseAuthorizedDevices.length === 0 ? (
            <div className="p-6 text-sm text-xf-muted">
              Nenhum dispositivo encontrado para o filtro selecionado.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-left text-sm">
                <thead className="border-b border-white/10 bg-black/20 text-xs uppercase tracking-[0.2em] text-xf-muted">
                  <tr>
                    <th className="px-5 py-4 font-semibold">
                      <input
                        type="checkbox"
                        checked={allVisibleLicenseDevicesSelected}
                        disabled={visibleLicenseDeviceIds.length === 0}
                        onChange={handleToggleAllVisibleLicenseDevices}
                        aria-label="Selecionar todos os dispositivos visíveis"
                        className="h-4 w-4 accent-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                      />
                    </th>
                    <th className="px-5 py-4 font-semibold">Nome</th>
                    <th className="px-5 py-4 font-semibold">Cliente</th>
                    <th className="px-5 py-4 font-semibold">Licença</th>
                    <th className="px-5 py-4 font-semibold">Plano</th>
                    <th className="px-5 py-4 font-semibold">Vigência</th>
                    <th className="px-5 py-4 font-semibold">Plataforma</th>
                    <th className="px-5 py-4 font-semibold">Identificador</th>
                    <th className="px-5 py-4 font-semibold">Status operacional</th>
                    <th className="px-5 py-4 font-semibold">Último acesso</th>
                    <th className="px-5 py-4 font-semibold">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLicenseAuthorizedDevices.map((device) => (
                    <tr
                      key={device.id}
                      className={getOperationalRowClassName(device.operational_status)}
                    >
                      <td className="px-5 py-4">
                        <input
                          type="checkbox"
                          checked={selectedLicenseDeviceIds.includes(device.id)}
                          onClick={(event) => event.stopPropagation()}
                          onChange={() => handleToggleLicenseDeviceSelection(device)}
                          aria-label={`Selecionar ${device.device_identifier}`}
                          className="h-4 w-4 accent-red-600"
                        />
                      </td>
                      <td className="px-5 py-4 font-semibold text-white">
                        {device.device_name ?? 'Xandeflix App'}
                      </td>
                      <td className="px-5 py-4 text-xf-muted">
                        {device.client_name ?? 'Ver na licença'}
                      </td>
                      <td className="px-5 py-4 font-mono text-xs text-xf-muted">
                        {device.license_code ?? getShortId(device.license_id)}
                      </td>
                      <td className="px-5 py-4 text-xf-muted">
                        {getPlanIntervalLabel(device.plan_interval)}
                      </td>
                      <td className="px-5 py-4 text-xf-muted">
                        {formatDateTime(device.license_expires_at)}
                      </td>
                      <td className="px-5 py-4 text-xf-muted">
                        {getPlatformLabel(device.platform)}
                      </td>
                      <td className="px-5 py-4 font-mono text-xs text-xf-muted">
                        {device.device_identifier}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ${getOperationalStatusClassName(
                            device.operational_status,
                          )}`}
                        >
                          {device.operational_label}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-xf-muted">
                        {formatDateTime(device.last_seen_at)}
                      </td>
                      <td className="px-5 py-4">
                        {true ? (
                          <button
                            type="button"
                            disabled={deletingLicenseDeviceId === device.id}
                            onClick={() => void handleDeleteLicenseAuthorizedDevice(device)}
                            className="rounded-xl bg-red-600 px-4 py-2 text-xs font-black text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {deletingLicenseDeviceId === device.id ? 'Excluindo...' : 'Excluir'}
                          </button>
                        ) : (
                          <span className="text-xs font-semibold text-xf-muted">
                            Protegido
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
          {isLoading ? (
            <div className="p-6 text-sm text-xf-muted">
              Carregando dispositivos...
            </div>
          ) : devices.length === 0 ? (
            <div className="p-6 text-sm text-xf-muted">
              Nenhum dispositivo cadastrado até o momento.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="border-b border-white/10 bg-black/20 text-xs uppercase tracking-[0.2em] text-xf-muted">
                  <tr>
                    <th className="px-5 py-4 font-semibold">Nome</th>
                    <th className="px-5 py-4 font-semibold">Cliente</th>
                    <th className="px-5 py-4 font-semibold">Plataforma</th>
                    <th className="px-5 py-4 font-semibold">Identificador</th>
                    <th className="px-5 py-4 font-semibold">Status</th>
                    <th className="px-5 py-4 font-semibold">Último acesso</th>
                    <th className="px-5 py-4 font-semibold">Criado em</th>
                  </tr>
                </thead>
                <tbody>
                  {devices.map((device) => {
                    const client = clientsById.get(device.client_id);

                    return (
                      <tr
                        key={device.id}
                        className="border-b border-white/5 last:border-0"
                      >
                        <td className="px-5 py-4 font-semibold text-white">
                          {device.device_name ?? 'Sem nome'}
                        </td>
                        <td className="px-5 py-4 text-xf-muted">
                          {client ? (
                            <div>
                              <p className="font-semibold text-white">{client.name}</p>
                              <p className="mt-1 text-xs text-xf-muted">
                                {getStatusLabel(client.status)} · vence em{' '}
                                {formatDateTime(client.expires_at)}
                              </p>
                            </div>
                          ) : (
                            <div>
                              <p className="font-semibold text-white">
                                Cliente não encontrado
                              </p>
                              <p className="mt-1 font-mono text-xs text-xf-muted">
                                {getShortId(device.client_id)}
                              </p>
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-4 text-xf-muted">
                          {getPlatformLabel(device.platform)}
                        </td>
                        <td className="px-5 py-4 font-mono text-xs text-xf-muted">
                          {device.device_identifier ?? 'Não informado'}
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-bold ${getDeviceStatusClassName(
                              device.is_active,
                            )}`}
                          >
                            {getBooleanLabel(device.is_active)}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-xf-muted">
                          {formatDateTime(device.last_seen_at)}
                        </td>
                        <td className="px-5 py-4 text-xf-muted">
                          {formatDateTime(device.created_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </AdminLayout>
  );
}
