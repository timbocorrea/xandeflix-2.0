import { useEffect, useState } from 'react';

import { AdminLayout } from '../components/AdminLayout';
import { listAdminChannelsCache } from '../services';
import type { ChannelCache } from '../types/admin.types';

function formatSortOrder(value: number | null) {
  return value === null ? '-' : String(value);
}

export function AdminChannelsPage() {
  const [channels, setChannels] = useState<ChannelCache[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadChannels() {
      try {
        setIsLoading(true);
        setErrorMessage(null);

        const data = await listAdminChannelsCache();

        if (isMounted) {
          setChannels(data);
        }
      } catch {
        if (isMounted) {
          setErrorMessage('Não foi possível carregar os canais.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadChannels();

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
          <h1 className="mt-3 text-4xl font-black tracking-tight">Canais</h1>
          <p className="mt-3 max-w-3xl text-base text-xf-muted">
            Lista administrativa dos canais armazenados no cache IPTV.
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
          {isLoading ? (
            <div className="p-6 text-sm text-xf-muted">Carregando canais...</div>
          ) : errorMessage ? (
            <div className="p-6 text-sm text-red-300">{errorMessage}</div>
          ) : channels.length === 0 ? (
            <div className="p-6 text-sm text-xf-muted">
              Nenhum canal cadastrado no cache até o momento.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="border-b border-white/10 bg-black/20 text-xs uppercase tracking-[0.2em] text-xf-muted">
                  <tr>
                    <th className="px-5 py-4 font-semibold">Ordem</th>
                    <th className="px-5 py-4 font-semibold">Nome</th>
                    <th className="px-5 py-4 font-semibold">Grupo</th>
                    <th className="px-5 py-4 font-semibold">TVG ID</th>
                    <th className="px-5 py-4 font-semibold">Logo</th>
                    <th className="px-5 py-4 font-semibold">Stream</th>
                  </tr>
                </thead>
                <tbody>
                  {channels.map((channel) => (
                    <tr key={channel.id} className="border-b border-white/5 last:border-0">
                      <td className="px-5 py-4 text-xf-muted">
                        {formatSortOrder(channel.sort_order)}
                      </td>
                      <td className="px-5 py-4 font-semibold text-white">
                        {channel.name}
                      </td>
                      <td className="px-5 py-4 text-xf-muted">
                        {channel.group_title ?? 'Sem grupo'}
                      </td>
                      <td className="px-5 py-4 text-xf-muted">
                        {channel.tvg_id ?? 'Não informado'}
                      </td>
                      <td className="max-w-[220px] truncate px-5 py-4 text-xf-muted">
                        {channel.logo_url ?? 'Não informado'}
                      </td>
                      <td className="max-w-[260px] truncate px-5 py-4 text-xf-muted">
                        {channel.stream_url}
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
