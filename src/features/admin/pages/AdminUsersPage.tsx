import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { AdminLayout } from '../components/AdminLayout';
import {
  createAdminUser,
  listAdminUsers,
  updateAdminUserStatus,
} from '../services';
import type { AdminProfile, AdminRole } from '../types/admin.types';

type AdminUserCreationForm = {
  email: string;
  password: string;
  role: AdminRole;
};

const INITIAL_FORM: AdminUserCreationForm = {
  email: '',
  password: '',
  role: 'admin',
};

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

function getCreateAdminUserErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return 'Não foi possível criar o administrador.';
  }

  const messages: Record<string, string> = {
    INVALID_PAYLOAD: 'Informe e-mail, senha e perfil válidos.',
    WEAK_PASSWORD: 'A senha precisa ter pelo menos 8 caracteres.',
    UNAUTHORIZED: 'Sessão administrativa inválida. Faça login novamente.',
    FORBIDDEN: 'Apenas Super Admin pode criar administradores.',
    AUTH_USER_CREATE_FAILED: 'Não foi possível criar o usuário no Supabase Auth.',
    ADMIN_PROFILE_CREATE_FAILED:
      'O usuário Auth foi criado, mas o perfil administrativo falhou.',
    CREATE_ADMIN_USER_FAILED: 'Não foi possível criar o administrador.',
  };

  return messages[error.message] ?? error.message;
}

function getUpdateAdminUserStatusErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return 'Não foi possível atualizar o status do administrador.';
  }

  const messages: Record<string, string> = {
    CANNOT_DISABLE_SELF:
      'Você não pode desativar o próprio usuário administrativo.',
    UNAUTHORIZED: 'Sessão administrativa inválida. Faça login novamente.',
    FORBIDDEN: 'Apenas Super Admin pode alterar status de administradores.',
    ADMIN_USER_NOT_FOUND: 'Administrador não encontrado.',
    ADMIN_PROFILE_UPDATE_FAILED:
      'Não foi possível atualizar o status do administrador.',
    UPDATE_ADMIN_USER_STATUS_FAILED:
      'Não foi possível atualizar o status do administrador.',
  };

  return messages[error.message] ?? error.message;
}

export function AdminUsersPage() {
  const [adminUsers, setAdminUsers] = useState<AdminProfile[]>([]);
  const [form, setForm] = useState<AdminUserCreationForm>(INITIAL_FORM);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [updatingAdminUserId, setUpdatingAdminUserId] = useState<string | null>(
    null,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadAdminUsers = useCallback(async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);

      const data = await listAdminUsers();

      setAdminUsers(data);
    } catch {
      setErrorMessage('Não foi possível carregar os administradores.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAdminUsers();
  }, [loadAdminUsers]);

  const updateFormField = <Field extends keyof AdminUserCreationForm>(
    field: Field,
    value: AdminUserCreationForm[Field],
  ) => {
    setForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const email = form.email.trim().toLowerCase();
    const password = form.password.trim();

    if (!email || !password) {
      setErrorMessage('Informe e-mail e senha do administrador.');
      return;
    }

    if (password.length < 8) {
      setErrorMessage('A senha precisa ter pelo menos 8 caracteres.');
      return;
    }

    try {
      setIsCreating(true);
      setErrorMessage(null);
      setSuccessMessage(null);

      await createAdminUser({
        email,
        password,
        role: form.role,
      });

      setSuccessMessage('Administrador criado com sucesso.');
      setForm(INITIAL_FORM);
      await loadAdminUsers();
    } catch (error) {
      setErrorMessage(getCreateAdminUserErrorMessage(error));
    } finally {
      setIsCreating(false);
    }
  };

  const handleToggleAdminUserStatus = async (adminUser: AdminProfile) => {
    const nextIsActive = !adminUser.is_active;
    const actionLabel = nextIsActive ? 'ativar' : 'desativar';

    const confirmed = window.confirm(
      `Deseja ${actionLabel} o administrador ${adminUser.email}?`,
    );

    if (!confirmed) {
      return;
    }

    try {
      setUpdatingAdminUserId(adminUser.id);
      setErrorMessage(null);
      setSuccessMessage(null);

      await updateAdminUserStatus({
        adminUserId: adminUser.id,
        isActive: nextIsActive,
      });

      setSuccessMessage(
        nextIsActive
          ? 'Administrador ativado com sucesso.'
          : 'Administrador desativado com sucesso.',
      );

      await loadAdminUsers();
    } catch (error) {
      setErrorMessage(getUpdateAdminUserStatusErrorMessage(error));
    } finally {
      setUpdatingAdminUserId(null);
    }
  };

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
            Gerencie os perfis administrativos autorizados no painel. A criação
            usa Edge Function segura no backend, sem expor service role no
            frontend.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-white/10 bg-white/5 p-6"
        >
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.3em] text-xf-red">
              Novo administrador
            </p>
            <h2 className="mt-2 text-2xl font-black text-white">
              Criar acesso administrativo
            </h2>
            <p className="mt-2 max-w-3xl text-sm text-xf-muted">
              O usuário será criado no Supabase Auth por uma Edge Function
              protegida e receberá um perfil em admin_profiles.
            </p>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <label className="flex flex-col gap-2 text-sm font-semibold text-white md:col-span-1">
              E-mail *
              <input
                type="email"
                className="rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-white outline-none focus:border-xf-red"
                value={form.email}
                onChange={(event) => updateFormField('email', event.target.value)}
                placeholder="admin@email.com"
              />
            </label>

            <label className="flex flex-col gap-2 text-sm font-semibold text-white md:col-span-1">
              Senha temporária *
              <input
                type="password"
                className="rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-white outline-none focus:border-xf-red"
                value={form.password}
                onChange={(event) =>
                  updateFormField('password', event.target.value)
                }
                placeholder="Mínimo 8 caracteres"
              />
            </label>

            <label className="flex flex-col gap-2 text-sm font-semibold text-white md:col-span-1">
              Perfil
              <select
                className="rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-white outline-none focus:border-xf-red"
                value={form.role}
                onChange={(event) =>
                  updateFormField('role', event.target.value as AdminRole)
                }
              >
                <option value="admin">Admin</option>
                <option value="super_admin">Super Admin</option>
              </select>
            </label>
          </div>

          {errorMessage ? (
            <div className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
              {errorMessage}
            </div>
          ) : null}

          {successMessage ? (
            <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
              {successMessage}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isCreating}
            className="mt-6 rounded-xl bg-white px-5 py-3 text-sm font-black text-black transition hover:bg-xf-red hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isCreating ? 'Criando administrador...' : 'Criar administrador'}
          </button>
        </form>

        <div className="rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-5">
          <p className="text-sm font-bold text-yellow-100">
            Segurança: a service role permanece no backend.
          </p>
          <p className="mt-2 text-sm text-yellow-100/80">
            Esta tela chama apenas a Edge Function create-admin-user. A função
            valida a sessão atual e confirma permissão de Super Admin antes de
            criar o usuário no Supabase Auth.
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
          {isLoading ? (
            <div className="p-6 text-sm text-xf-muted">
              Carregando administradores...
            </div>
          ) : errorMessage && adminUsers.length === 0 ? (
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
                    <th className="px-5 py-4 font-semibold">Ações</th>
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
                      <td className="px-5 py-4">
                        <button
                          type="button"
                          onClick={() => void handleToggleAdminUserStatus(adminUser)}
                          disabled={updatingAdminUserId === adminUser.id}
                          className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-xs font-black text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {updatingAdminUserId === adminUser.id
                            ? 'Atualizando...'
                            : adminUser.is_active
                              ? 'Desativar'
                              : 'Ativar'}
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
