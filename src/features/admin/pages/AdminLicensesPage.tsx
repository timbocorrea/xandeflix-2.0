import { useEffect, useMemo, useState } from 'react';

import { AdminLayout } from '../components/AdminLayout';

import {
  createAdminLicense,
  listAdminLicenses,
} from '../services';

import type {
  License,
  LicensePlanType,
  LicenseStatus,
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

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Sem vencimento';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
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
        status: 'active',
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

      await loadLicenses();
    } catch {
      setErrorMessage('Não foi possível criar a licença. Verifique se o código já existe.');
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
