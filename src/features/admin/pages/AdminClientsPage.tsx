import { useEffect, useState } from 'react';

import { AdminLayout } from '../components/AdminLayout';
import { listAdminClients } from '../services';
import type { Client } from '../types/admin.types';

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

export function AdminClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadClients() {
      try {
        setIsLoading(true);
        setErrorMessage(null);

        const data = await listAdminClients();

        if (isMounted) {
          setClients(data);
        }
      } catch {
        if (isMounted) {
          setErrorMessage('Não foi possível carregar os clientes.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadClients();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <AdminLayout>
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-xf-muted">
            Administração
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-tight">Clientes</h1>
          <p className="mt-3 max-w-3xl text-base text-xf-muted">
            Lista administrativa dos clientes cadastrados no Xandeflix.
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
          {isLoading ? (
            <div className="p-6 text-sm text-xf-muted">Carregando clientes...</div>
          ) : errorMessage ? (
            <div className="p-6 text-sm text-red-300">{errorMessage}</div>
          ) : clients.length === 0 ? (
            <div className="p-6 text-sm text-xf-muted">
              Nenhum cliente cadastrado até o momento.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-white/10 bg-black/20 text-xs uppercase tracking-[0.2em] text-xf-muted">
                  <tr>
                    <th className="px-5 py-4 font-semibold">Nome</th>
                    <th className="px-5 py-4 font-semibold">E-mail</th>
                    <th className="px-5 py-4 font-semibold">Telefone</th>
                    <th className="px-5 py-4 font-semibold">Status</th>
                    <th className="px-5 py-4 font-semibold">Vencimento</th>
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
                        <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white">
                          {getStatusLabel(client.status)}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-xf-muted">
                        {formatDate(client.expires_at)}
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
