import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { AdminLayout } from '../components/AdminLayout';
import {
  createAdminClient,
  createAdminDevice,
  createAdminIptvSource,
  listAdminClients,
  updateAdminClientStatus,
} from '../services';
import type { Client, ClientStatus, IptvSourceType } from '../types/admin.types';

type ClientCreationForm = {
  name: string;
  email: string;
  phone: string;
  status: ClientStatus;
  expires_at: string;
  notes: string;
  device_identifier: string;
  device_name: string;
  platform: string;
  provider_name: string;
  source_url: string;
  source_type: IptvSourceType;
};

const INITIAL_FORM: ClientCreationForm = {
  name: '',
  email: '',
  phone: '',
  status: 'active',
  expires_at: '',
  notes: '',
  device_identifier: '',
  device_name: '',
  platform: 'android-tv',
  provider_name: '',
  source_url: '',
  source_type: 'm3u',
};

function formatDate(value: string | null) {
  if (!value) {
    return 'Sem vencimento';
  }

  return new Intl.DateTimeFormat('pt-BR').format(new Date(value));
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

function getUpdateClientStatusErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return 'Não foi possível atualizar o status do cliente.';
  }

  const messages: Record<string, string> = {
    INVALID_PAYLOAD: 'Dados inválidos para atualizar o status do cliente.',
    INVALID_CLIENT_STATUS_ACTION: 'Status de cliente inválido para esta ação.',
    UNAUTHORIZED: 'Sessão administrativa inválida. Faça login novamente.',
    FORBIDDEN: 'Apenas Super Admin pode alterar status de clientes.',
    CLIENT_NOT_FOUND: 'Cliente não encontrado.',
    CLIENT_STATUS_UPDATE_FAILED:
      'Não foi possível atualizar o status do cliente.',
    UPDATE_CLIENT_STATUS_FAILED:
      'Não foi possível atualizar o status do cliente.',
  };

  return messages[error.message] ?? error.message;
}

function normalizeOptionalValue(value: string) {
  const normalizedValue = value.trim();

  return normalizedValue ? normalizedValue : null;
}

export function AdminClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [form, setForm] = useState<ClientCreationForm>(INITIAL_FORM);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [updatingClientId, setUpdatingClientId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadClients = useCallback(async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);

      const data = await listAdminClients();

      setClients(data);
    } catch {
      setErrorMessage('Não foi possível carregar os clientes.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadClients();
  }, [loadClients]);

  const updateFormField = <Field extends keyof ClientCreationForm>(
    field: Field,
    value: ClientCreationForm[Field],
  ) => {
    setForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const clientName = form.name.trim();
    const deviceIdentifier = form.device_identifier.trim();
    const providerName = form.provider_name.trim();
    const sourceUrl = form.source_url.trim();

    if (!clientName) {
      setErrorMessage('Informe o nome do cliente.');
      return;
    }

    if ((deviceIdentifier || providerName || sourceUrl) && !deviceIdentifier) {
      setErrorMessage('Informe o ID permanente do dispositivo.');
      return;
    }

    if ((providerName || sourceUrl) && (!providerName || !sourceUrl)) {
      setErrorMessage('Informe o nome do provedor e a URL da lista IPTV.');
      return;
    }

    try {
      setIsCreating(true);
      setErrorMessage(null);
      setSuccessMessage(null);

      const createdClient = await createAdminClient({
        name: clientName,
        email: normalizeOptionalValue(form.email),
        phone: normalizeOptionalValue(form.phone),
        status: form.status,
        expires_at: normalizeOptionalValue(form.expires_at),
        notes: normalizeOptionalValue(form.notes),
      });

      if (deviceIdentifier) {
        await createAdminDevice({
          client_id: createdClient.id,
          device_name: normalizeOptionalValue(form.device_name) ?? 'Dispositivo principal',
          device_identifier: deviceIdentifier,
          platform: normalizeOptionalValue(form.platform),
          is_active: true,
        });
      }

      if (providerName && sourceUrl) {
        await createAdminIptvSource({
          client_id: createdClient.id,
          name: providerName,
          source_url: sourceUrl,
          type: form.source_type,
          is_active: true,
        });
      }

      setSuccessMessage('Cliente cadastrado e vínculos autorizados criados com sucesso.');
      setForm(INITIAL_FORM);
      await loadClients();
    } catch {
      setErrorMessage('Não foi possível cadastrar o cliente e seus vínculos.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleToggleClientStatus = async (client: Client) => {
    const nextStatus: Extract<ClientStatus, 'active' | 'blocked'> =
      client.status === 'blocked' ? 'active' : 'blocked';
    const actionLabel = nextStatus === 'blocked' ? 'suspender' : 'reativar';

    const confirmed = window.confirm(
      `Deseja ${actionLabel} o cliente ${client.name}?`,
    );

    if (!confirmed) {
      return;
    }

    try {
      setUpdatingClientId(client.id);
      setErrorMessage(null);
      setSuccessMessage(null);

      await updateAdminClientStatus({
        clientId: client.id,
        status: nextStatus,
      });

      setSuccessMessage(
        nextStatus === 'blocked'
          ? 'Cliente suspenso com sucesso.'
          : 'Cliente reativado com sucesso.',
      );

      await loadClients();
    } catch (error) {
      setErrorMessage(getUpdateClientStatusErrorMessage(error));
    } finally {
      setUpdatingClientId(null);
    }
  };

  return (
    <AdminLayout>
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-xf-muted">
            Administração
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-tight">Clientes</h1>
          <p className="mt-3 max-w-3xl text-base text-xf-muted">
            Cadastre clientes e vincule o ID permanente do dispositivo à lista
            IPTV individual autorizada.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-white/10 bg-white/5 p-6"
        >
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.3em] text-xf-red">
              Novo cliente autorizado
            </p>
            <h2 className="mt-2 text-2xl font-black text-white">
              Cliente + dispositivo + lista IPTV
            </h2>
            <p className="mt-2 max-w-3xl text-sm text-xf-muted">
              A lista não é global. Ela será vinculada ao cliente e entregue
              somente ao dispositivo cujo ID permanente foi informado.
            </p>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm font-semibold text-white">
              Nome do cliente *
              <input
                className="rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-white outline-none focus:border-xf-red"
                value={form.name}
                onChange={(event) => updateFormField('name', event.target.value)}
                placeholder="Ex.: João Silva"
              />
            </label>

            <label className="flex flex-col gap-2 text-sm font-semibold text-white">
              Status
              <select
                className="rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-white outline-none focus:border-xf-red"
                value={form.status}
                onChange={(event) =>
                  updateFormField('status', event.target.value as ClientStatus)
                }
              >
                <option value="active">Ativo</option>
                <option value="inactive">Inativo</option>
                <option value="expired">Expirado</option>
                <option value="blocked">Bloqueado</option>
              </select>
            </label>

            <label className="flex flex-col gap-2 text-sm font-semibold text-white">
              E-mail
              <input
                className="rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-white outline-none focus:border-xf-red"
                value={form.email}
                onChange={(event) => updateFormField('email', event.target.value)}
                placeholder="cliente@email.com"
              />
            </label>

            <label className="flex flex-col gap-2 text-sm font-semibold text-white">
              Telefone
              <input
                className="rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-white outline-none focus:border-xf-red"
                value={form.phone}
                onChange={(event) => updateFormField('phone', event.target.value)}
                placeholder="(62) 99999-9999"
              />
            </label>

            <label className="flex flex-col gap-2 text-sm font-semibold text-white">
              Vencimento
              <input
                type="date"
                className="rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-white outline-none focus:border-xf-red"
                value={form.expires_at}
                onChange={(event) => updateFormField('expires_at', event.target.value)}
              />
            </label>

            <label className="flex flex-col gap-2 text-sm font-semibold text-white">
              ID permanente do dispositivo
              <input
                className="rounded-xl border border-white/10 bg-black/50 px-4 py-3 font-mono text-white outline-none focus:border-xf-red"
                value={form.device_identifier}
                onChange={(event) =>
                  updateFormField('device_identifier', event.target.value)
                }
                placeholder="xf-..."
              />
            </label>

            <label className="flex flex-col gap-2 text-sm font-semibold text-white">
              Nome do dispositivo
              <input
                className="rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-white outline-none focus:border-xf-red"
                value={form.device_name}
                onChange={(event) =>
                  updateFormField('device_name', event.target.value)
                }
                placeholder="Fire Stick da sala"
              />
            </label>

            <label className="flex flex-col gap-2 text-sm font-semibold text-white">
              Plataforma
              <input
                className="rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-white outline-none focus:border-xf-red"
                value={form.platform}
                onChange={(event) => updateFormField('platform', event.target.value)}
                placeholder="android-tv"
              />
            </label>

            <label className="flex flex-col gap-2 text-sm font-semibold text-white">
              Nome do provedor
              <input
                className="rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-white outline-none focus:border-xf-red"
                value={form.provider_name}
                onChange={(event) =>
                  updateFormField('provider_name', event.target.value)
                }
                placeholder="Provedor IPTV do cliente"
              />
            </label>

            <label className="flex flex-col gap-2 text-sm font-semibold text-white">
              Tipo da lista
              <select
                className="rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-white outline-none focus:border-xf-red"
                value={form.source_type}
                onChange={(event) =>
                  updateFormField('source_type', event.target.value as IptvSourceType)
                }
              >
                <option value="m3u">M3U</option>
                <option value="xtream">Xtream</option>
                <option value="manual">Manual</option>
              </select>
            </label>

            <label className="flex flex-col gap-2 text-sm font-semibold text-white md:col-span-2">
              URL da lista IPTV
              <input
                className="rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-white outline-none focus:border-xf-red"
                value={form.source_url}
                onChange={(event) => updateFormField('source_url', event.target.value)}
                placeholder="https://..."
              />
            </label>

            <label className="flex flex-col gap-2 text-sm font-semibold text-white md:col-span-2">
              Observações
              <textarea
                className="min-h-24 rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-white outline-none focus:border-xf-red"
                value={form.notes}
                onChange={(event) => updateFormField('notes', event.target.value)}
                placeholder="Observações administrativas..."
              />
            </label>
          </div>

          {errorMessage ? (
            <p className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {errorMessage}
            </p>
          ) : null}

          {successMessage ? (
            <p className="mt-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
              {successMessage}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isCreating}
            className="mt-6 rounded-xl bg-xf-red px-6 py-3 text-sm font-black uppercase tracking-[0.2em] text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isCreating ? 'Cadastrando...' : 'Cadastrar cliente autorizado'}
          </button>
        </form>

        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
          {isLoading ? (
            <div className="p-6 text-sm text-xf-muted">Carregando clientes...</div>
          ) : clients.length === 0 ? (
            <div className="p-6 text-sm text-xf-muted">
              Nenhum cliente cadastrado até o momento.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="border-b border-white/10 bg-black/20 text-xs uppercase tracking-[0.2em] text-xf-muted">
                  <tr>
                    <th className="px-5 py-4 font-semibold">Nome</th>
                    <th className="px-5 py-4 font-semibold">E-mail</th>
                    <th className="px-5 py-4 font-semibold">Telefone</th>
                    <th className="px-5 py-4 font-semibold">Status</th>
                    <th className="px-5 py-4 font-semibold">Vencimento</th>
                    <th className="px-5 py-4 font-semibold">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((client) => (
                    <tr key={client.id} className="border-b border-white/5 last:border-0">
                      <td className="px-5 py-4 font-semibold text-white">{client.name}</td>
                      <td className="px-5 py-4 text-xf-muted">
                        {client.email ?? 'Não informado'}
                      </td>
                      <td className="px-5 py-4 text-xf-muted">
                        {client.phone ?? 'Não informado'}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ${getStatusClassName(
                            client.status,
                          )}`}
                        >
                          {getStatusLabel(client.status)}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-xf-muted">
                        {formatDate(client.expires_at)}
                      </td>
                      <td className="px-5 py-4">
                        <button
                          type="button"
                          onClick={() => void handleToggleClientStatus(client)}
                          disabled={updatingClientId === client.id}
                          className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-xs font-black text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {updatingClientId === client.id
                            ? 'Atualizando...'
                            : client.status === 'blocked'
                              ? 'Reativar cliente'
                              : 'Suspender cliente'}
                        </button>
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
