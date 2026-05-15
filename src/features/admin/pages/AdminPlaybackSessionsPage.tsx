import { useEffect, useMemo, useState } from 'react';

import { AdminLayout } from '../components/AdminLayout';

import {
  adminEndPlaybackSession,
  listAdminActivePlaybackSessions,
  type AdminPlaybackSession,
} from '../services';

const ADMIN_PLAYBACK_SESSIONS_REFRESH_INTERVAL_MS = 5000;

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Não informado';
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

function getHeartbeatStatus(session: AdminPlaybackSession) {
  const isExpired = new Date(session.expires_at).getTime() <= Date.now();

  if (isExpired) {
    return {
      label: 'Heartbeat vencido',
      className:
        'rounded-full bg-amber-500/15 px-3 py-1 text-xs font-bold text-amber-200',
    };
  }

  return {
    label: 'Ativa',
    className:
      'rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-200',
  };
}

function getEndPlaybackSessionErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return 'Não foi possível encerrar a sessão.';
  }

  const messages: Record<string, string> = {
    INVALID_PAYLOAD: 'Sessão inválida para encerramento.',
    UNAUTHORIZED: 'Sessão administrativa inválida. Faça login novamente.',
    FORBIDDEN: 'Você não tem permissão para encerrar esta sessão.',
    PLAYBACK_SESSION_NOT_FOUND: 'Sessão de reprodução não encontrada.',
    PLAYBACK_SESSION_NOT_ACTIVE: 'A sessão já não está mais ativa.',
    LICENSE_NOT_FOUND: 'Licença vinculada à sessão não encontrada.',
    PLAYBACK_SESSION_END_FAILED: 'Não foi possível encerrar a sessão.',
    ADMIN_END_PLAYBACK_SESSION_FAILED: 'Não foi possível encerrar a sessão.',
  };

  return messages[error.message] ?? error.message;
}

export function AdminPlaybackSessionsPage() {
  const [sessions, setSessions] = useState<AdminPlaybackSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [endingSessionId, setEndingSessionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null);

  const activeLicenseCount = useMemo(
    () => new Set(sessions.map((session) => session.license_id)).size,
    [sessions],
  );

  const expiredHeartbeatCount = useMemo(
    () =>
      sessions.filter(
        (session) => new Date(session.expires_at).getTime() <= Date.now(),
      ).length,
    [sessions],
  );

  async function loadSessions(options?: { silent?: boolean }) {
    try {
      if (options?.silent) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      setErrorMessage(null);

      const activeSessions = await listAdminActivePlaybackSessions();

      setSessions(activeSessions);
      setLastLoadedAt(new Date().toISOString());
    } catch {
      setErrorMessage('Não foi possível carregar as sessões ativas.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    void loadSessions();

    const intervalId = window.setInterval(() => {
      void loadSessions({ silent: true });
    }, ADMIN_PLAYBACK_SESSIONS_REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  async function handleEndSession(session: AdminPlaybackSession) {
    const confirmed = window.confirm(
      `Deseja encerrar manualmente a sessão do dispositivo ${session.device_identifier}?`,
    );

    if (!confirmed) {
      return;
    }

    try {
      setEndingSessionId(session.id);
      setErrorMessage(null);
      setSuccessMessage(null);

      await adminEndPlaybackSession(session.id);

      setSessions((currentSessions) =>
        currentSessions.filter((currentSession) => currentSession.id !== session.id),
      );
      setSuccessMessage('Sessão encerrada manualmente com sucesso.');
    } catch (error) {
      setErrorMessage(getEndPlaybackSessionErrorMessage(error));
    } finally {
      setEndingSessionId(null);
    }
  }

  return (
    <AdminLayout>
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-xf-muted">
              Administração
            </p>

            <h1 className="mt-3 text-4xl font-black tracking-tight">
              Sessões ativas
            </h1>

            <p className="mt-3 max-w-3xl text-base text-xf-muted">
              Reprodução em andamento por licença, dispositivo e canal.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadSessions({ silent: true })}
            disabled={isLoading || isRefreshing}
            className="rounded-xl bg-white/10 px-5 py-3 text-sm font-black text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRefreshing ? 'Atualizando...' : 'Atualizar agora'}
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <article className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-xf-muted">
              Sessões
            </p>
            <p className="mt-2 text-3xl font-black">{sessions.length}</p>
          </article>

          <article className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-xf-muted">
              Licenças em uso
            </p>
            <p className="mt-2 text-3xl font-black">{activeLicenseCount}</p>
          </article>

          <article className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-xf-muted">
              Heartbeat vencido
            </p>
            <p className="mt-2 text-3xl font-black">{expiredHeartbeatCount}</p>
          </article>
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

        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-black/20 px-5 py-4">
            <p className="text-sm font-bold text-white">
              Atualização automática a cada 5s
            </p>

            <p className="text-xs text-xf-muted">
              {lastLoadedAt ? formatDateTime(lastLoadedAt) : 'Ainda não atualizada'}
            </p>
          </div>

          {isLoading ? (
            <div className="p-6 text-sm text-xf-muted">
              Carregando sessões ativas...
            </div>
          ) : sessions.length === 0 ? (
            <div className="p-6 text-sm text-xf-muted">
              Nenhuma sessão ativa no momento.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1120px] text-left text-sm">
                <thead className="border-b border-white/10 bg-black/20 text-xs uppercase tracking-[0.2em] text-xf-muted">
                  <tr>
                    <th className="px-5 py-4 font-semibold">Licença</th>
                    <th className="px-5 py-4 font-semibold">Dispositivo</th>
                    <th className="px-5 py-4 font-semibold">Canal</th>
                    <th className="px-5 py-4 font-semibold">Início</th>
                    <th className="px-5 py-4 font-semibold">Último heartbeat</th>
                    <th className="px-5 py-4 font-semibold">Estado</th>
                    <th className="px-5 py-4 font-semibold">Ações</th>
                  </tr>
                </thead>

                <tbody>
                  {sessions.map((session) => {
                    const heartbeatStatus = getHeartbeatStatus(session);

                    return (
                      <tr
                        key={session.id}
                        className="border-b border-white/5 last:border-0"
                      >
                        <td className="px-5 py-4">
                          <p className="font-bold text-white">
                            {session.license?.license_code ?? 'Licença sem código'}
                          </p>
                          <p className="mt-1 text-xs text-xf-muted">
                            {session.license?.label ?? 'Sem nome interno'}
                          </p>
                        </td>

                        <td className="px-5 py-4">
                          <p className="break-all font-mono text-xs text-white">
                            {session.device_identifier}
                          </p>
                          <p className="mt-1 text-xs text-xf-muted">
                            {session.license_device_id ?? 'Sem vínculo técnico'}
                          </p>
                        </td>

                        <td className="px-5 py-4 text-xf-muted">
                          {session.channel_name || 'Canal não informado'}
                        </td>

                        <td className="px-5 py-4 text-xf-muted">
                          {formatDateTime(session.started_at)}
                        </td>

                        <td className="px-5 py-4 text-xf-muted">
                          <p>{formatDateTime(session.last_heartbeat_at)}</p>
                          <p className="mt-1 text-xs">
                            Expira: {formatDateTime(session.expires_at)}
                          </p>
                        </td>

                        <td className="px-5 py-4">
                          <span className={heartbeatStatus.className}>
                            {heartbeatStatus.label}
                          </span>
                        </td>

                        <td className="px-5 py-4">
                          <button
                            type="button"
                            onClick={() => void handleEndSession(session)}
                            disabled={endingSessionId === session.id}
                            className="rounded-xl bg-xf-red px-4 py-2 text-xs font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {endingSessionId === session.id
                              ? 'Encerrando...'
                              : 'Encerrar'}
                          </button>
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
