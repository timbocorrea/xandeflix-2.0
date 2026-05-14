import { useEffect, useState } from 'react';

import { AdminLayout } from '../components/AdminLayout';
import { listAdminUsers } from '../services';
import type { AdminProfile } from '../types/admin.types';

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function getRoleLabel(role: AdminProfile['role']) {
  const labels: Record<AdminProfile['role'], string> = {
    admin: 'Admin',
    super_admin: 'Super Admin',
  };

  return labels[role];
}

function getStatusLabel(isActive: boolean) {
  return isActive ? 'Ativo' : 'Inativo';
}

export function AdminUsersPage() {
  const [adminUsers, setAdminUsers] = useState<AdminProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadAdminUsers() {
      try {
        setIsLoading(true);
        setErrorMessage(null);

        const data = await listAdminUsers();

        if (isMounted) {
          setAdminUsers(data);
        }
      } catch {
        if (isMounted) {
          setErrorMessage('Não foi possível carregar os administradores.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadAdminUsers();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <AdminLayout>
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-xf-muted">
            Super Admin
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-tight">
            Administradores
          </h1>
          <p className="mt-3 max-w-3xl text-base text-xf-muted">
            Lista dos perfis administrativos autorizados no painel. A criação real
            de novos administradores será implementada posteriormente por Edge
            Function segura, sem expor service role no frontend.
          </p>
        </div>

        <div className="rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-5">
          <p className="text-sm font-bold text-yellow-100">
            Segurança: esta etapa é somente leitura.
          </p>
          <p className="mt-2 text-sm text-yellow-100/80">
            Criar usuário no Supabase Auth exige Admin API/service role. Essa
            credencial nunca deve ser usada em componentes React.
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
          {isLoading ? (
            <div className="p-6 text-sm text-xf-muted">
              Carregando administradores...
            </div>
          ) : errorMessage ? (
            <div className="p-6 text-sm text-red-300">{errorMessage}</div>
          ) : adminUsers.length === 0 ? (
            <div className="p-6 text-sm text-xf-muted">
              Nenhum administrador encontrado até o momento.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="border-b border-white/10 bg-black/20 text-xs uppercase tracking-[0.2em] text-xf-muted">
                  <tr>
                    <th className="px-5 py-4 font-semibold">E-mail</th>
                    <th className="px-5 py-4 font-semibold">Role</th>
                    <th className="px-5 py-4 font-semibold">Status</th>
                    <th className="px-5 py-4 font-semibold">Criado em</th>
                    <th className="px-5 py-4 font-semibold">Atualizado em</th>
                    <th className="px-5 py-4 font-semibold">ID</th>
                  </tr>
                </thead>
                <tbody>
                  {adminUsers.map((adminUser) => (
                    <tr
                      key={adminUser.id}
                      className="border-b border-white/5 last:border-0"
                    >
                      <td className="px-5 py-4 font-semibold text-white">
                        {adminUser.email}
                      </td>
                      <td className="px-5 py-4 text-xf-muted">
                        {getRoleLabel(adminUser.role)}
                      </td>
                      <td className="px-5 py-4">
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-white">
                          {getStatusLabel(adminUser.is_active)}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-xf-muted">
                        {formatDateTime(adminUser.created_at)}
                      </td>
                      <td className="px-5 py-4 text-xf-muted">
                        {formatDateTime(adminUser.updated_at)}
                      </td>
                      <td className="max-w-[180px] truncate px-5 py-4 text-xf-muted">
                        {adminUser.id}
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
