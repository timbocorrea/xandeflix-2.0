import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import { AdminLayout } from '../components/AdminLayout';

import {
  createAdminIptvSource,
  listAdminIptvSources,
} from '../services';

import { importAdminPlaylistSource } from '../lib/adminPlaylistImport.service';

import type { IptvSource } from '../types/admin.types';

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Nunca';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function getSourceTypeLabel(type: IptvSource['type']) {
  const labels: Record<IptvSource['type'], string> = {
    m3u: 'M3U',
    xtream: 'Xtream',
    manual: 'Manual',
  };

  return labels[type];
}

function getBooleanLabel(value: boolean) {
  return value ? 'Ativa' : 'Inativa';
}

export function AdminIptvSourcesPage() {
  const [sources, setSources] = useState<IptvSource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [type, setType] = useState<IptvSource['type']>('m3u');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [syncingSourceId, setSyncingSourceId] =
    useState<string | null>(null);

  async function loadSources() {
    try {
      setIsLoading(true);
      setErrorMessage(null);

      const data = await listAdminIptvSources();

      setSources(data);
    } catch {
      setErrorMessage('Não foi possível carregar as fontes IPTV.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadSources();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      setSuccessMessage(null);

      await createAdminIptvSource({
        name,
        source_url: sourceUrl,
        type,
      });

      setName('');
      setSourceUrl('');
      setType('m3u');

      setSuccessMessage('Fonte IPTV cadastrada com sucesso.');

      await loadSources();
    } catch {
      setErrorMessage('Não foi possível cadastrar a fonte IPTV.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSyncSource(source: IptvSource) {
    try {
      setSyncingSourceId(source.id);
      setErrorMessage(null);
      setSuccessMessage(null);

      const result = await importAdminPlaylistSource(source);

      setSuccessMessage(
        `Fonte "${source.name}" importada com ${result.total} canais encontrados.`,
      );
    } catch (syncError) {
      setErrorMessage(
        syncError instanceof Error
          ? syncError.message
          : 'Não foi possível sincronizar a fonte IPTV.',
      );
    } finally {
      setSyncingSourceId(null);
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
            Fontes IPTV
          </h1>

          <p className="mt-3 max-w-3xl text-base text-xf-muted">
            Lista administrativa das fontes IPTV cadastradas no Xandeflix.
          </p>
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

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <form
            onSubmit={handleSubmit}
            className="grid gap-4 md:grid-cols-4"
          >
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-white">
                Nome
              </label>

              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Minha lista IPTV"
                className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
                required
              />
            </div>

            <div className="flex flex-col gap-2 md:col-span-2">
              <label className="text-sm font-semibold text-white">
                URL da fonte
              </label>

              <input
                value={sourceUrl}
                onChange={(event) => setSourceUrl(event.target.value)}
                placeholder="https://..."
                className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-white">
                Tipo
              </label>

              <select
                value={type}
                onChange={(event) =>
                  setType(event.target.value as IptvSource['type'])
                }
                className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none"
              >
                <option value="m3u">M3U</option>
                <option value="xtream">Xtream</option>
                <option value="manual">Manual</option>
              </select>
            </div>

            <div className="md:col-span-4">
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-xl bg-red-600 px-5 py-3 font-bold text-white transition hover:bg-red-500 disabled:opacity-50"
              >
                {isSubmitting
                  ? 'Cadastrando...'
                  : 'Cadastrar fonte IPTV'}
              </button>
            </div>
          </form>
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
          {isLoading ? (
            <div className="p-6 text-sm text-xf-muted">
              Carregando fontes IPTV...
            </div>
          ) : sources.length === 0 ? (
            <div className="p-6 text-sm text-xf-muted">
              Nenhuma fonte IPTV cadastrada até o momento.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] text-left text-sm">
                <thead className="border-b border-white/10 bg-black/20 text-xs uppercase tracking-[0.2em] text-xf-muted">
                  <tr>
                    <th className="px-5 py-4 font-semibold">Nome</th>
                    <th className="px-5 py-4 font-semibold">Tipo</th>
                    <th className="px-5 py-4 font-semibold">URL</th>
                    <th className="px-5 py-4 font-semibold">Status</th>
                    <th className="px-5 py-4 font-semibold">
                      Última sincronização
                    </th>
                    <th className="px-5 py-4 font-semibold">
                      Criada em
                    </th>
                    <th className="px-5 py-4 font-semibold">Ações</th>
                  </tr>
                </thead>

                <tbody>
                  {sources.map((source) => (
                    <tr
                      key={source.id}
                      className="border-b border-white/5 last:border-0"
                    >
                      <td className="px-5 py-4 font-semibold text-white">
                        {source.name}
                      </td>

                      <td className="px-5 py-4 text-xf-muted">
                        {getSourceTypeLabel(source.type)}
                      </td>

                      <td className="max-w-[260px] truncate px-5 py-4 text-xf-muted">
                        {source.source_url}
                      </td>

                      <td className="px-5 py-4">
                        <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white">
                          {getBooleanLabel(source.is_active)}
                        </span>
                      </td>

                      <td className="px-5 py-4 text-xf-muted">
                        {formatDateTime(source.last_sync_at)}
                      </td>

                      <td className="px-5 py-4 text-xf-muted">
                        {formatDateTime(source.created_at)}
                      </td>

                      <td className="px-5 py-4">
                        <button
                          type="button"
                          onClick={() => handleSyncSource(source)}
                          disabled={syncingSourceId === source.id}
                          className="rounded-xl bg-white/10 px-4 py-2 text-xs font-bold text-white transition hover:bg-white/20 disabled:opacity-50"
                        >
                          {syncingSourceId === source.id
                            ? 'Sincronizando...'
                            : 'Sincronizar'}
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
