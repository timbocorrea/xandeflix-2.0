import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { AdminLayout } from '../components/AdminLayout';
import { getAdminAppInstallationById } from '../services/adminAppInstallations.service';

import type { AppInstallation } from '../types/admin.types';

function formatDate(value: string | null) {
  if (!value) {
    return 'Não informado';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatValue(value: string | null) {
  return value ?? 'Não informado';
}

function formatMetadata(metadata: Record<string, unknown>) {
  return JSON.stringify(metadata ?? {}, null, 2);
}

function DetailItem({
  label,
  value,
  isMonospace = false,
}: {
  label: string;
  value: string;
  isMonospace?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-xf-muted">
        {label}
      </p>
      <p
        className={`mt-2 break-words text-sm font-semibold text-white ${
          isMonospace ? 'font-mono' : ''
        }`}
      >
        {value}
      </p>
    </div>
  );
}

export function AdminAppInstallationDetailsPage() {
  const { installationId } = useParams<{ installationId: string }>();
  const [installation, setInstallation] = useState<AppInstallation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadInstallationDetails() {
      if (!installationId) {
        setErrorMessage('Identificador da instalação não informado.');
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setErrorMessage(null);

      try {
        const result = await getAdminAppInstallationById(installationId);

        if (!result) {
          setErrorMessage('Instalação não encontrada.');
          setInstallation(null);
          return;
        }

        setInstallation(result);
      } catch {
        setErrorMessage('Não foi possível carregar os detalhes da instalação.');
      } finally {
        setIsLoading(false);
      }
    }

    void loadInstallationDetails();
  }, [installationId]);

  return (
    <AdminLayout>
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-xf-muted">
              Super Admin
            </p>
            <h1 className="mt-3 text-4xl font-black tracking-tight">
              Detalhes da instalação
            </h1>
            <p className="mt-3 max-w-4xl text-base text-xf-muted">
              Visualização técnica dos campos existentes da instalação do app,
              sem alterar status, auditoria ou dados operacionais.
            </p>
          </div>

          <Link
            to="/admin/app-installations"
            className="rounded-xl bg-white/10 px-4 py-3 text-center text-sm font-black text-white transition hover:bg-white/20"
          >
            Voltar para instalações
          </Link>
        </div>

        {isLoading ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-xf-muted">
            Carregando detalhes da instalação...
          </div>
        ) : errorMessage ? (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-sm font-semibold text-red-100">
            {errorMessage}
          </div>
        ) : installation ? (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <DetailItem label="ID" value={installation.id} isMonospace />
              <DetailItem
                label="Device identifier"
                value={installation.device_identifier}
                isMonospace
              />
              <DetailItem
                label="Status"
                value={installation.installation_status}
              />
              <DetailItem
                label="Plataforma"
                value={formatValue(installation.platform)}
              />
              <DetailItem
                label="Fabricante"
                value={formatValue(installation.manufacturer)}
              />
              <DetailItem
                label="Modelo"
                value={formatValue(installation.model)}
              />
              <DetailItem
                label="Versão do app"
                value={formatValue(installation.app_version)}
              />
              <DetailItem
                label="Primeiro acesso"
                value={formatDate(installation.first_seen_at)}
              />
              <DetailItem
                label="Última comunicação"
                value={formatDate(installation.last_seen_at)}
              />
              <DetailItem
                label="Ativada em"
                value={formatDate(installation.activated_at)}
              />
              <DetailItem
                label="Remoção solicitada em"
                value={formatDate(installation.pending_uninstall_at)}
              />
              <DetailItem
                label="Marcada como desinstalada em"
                value={formatDate(installation.manually_marked_uninstalled_at)}
              />
              <DetailItem
                label="Licença vinculada"
                value={formatValue(installation.linked_license_id)}
                isMonospace
              />
              <DetailItem
                label="Dispositivo da licença"
                value={formatValue(installation.linked_license_device_id)}
                isMonospace
              />
              <DetailItem
                label="Criada em"
                value={formatDate(installation.created_at)}
              />
              <DetailItem
                label="Atualizada em"
                value={formatDate(installation.updated_at)}
              />
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-xf-muted">
                Metadata
              </p>
              <pre className="mt-4 overflow-x-auto rounded-xl border border-white/10 bg-black/40 p-4 text-xs text-white">
                {formatMetadata(installation.metadata)}
              </pre>
            </div>
          </>
        ) : null}
      </section>
    </AdminLayout>
  );
}
