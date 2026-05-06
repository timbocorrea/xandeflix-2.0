import { useEffect, useState } from 'react';

import { AdminLayout } from '../components/AdminLayout';
import { listAdminDevices } from '../services';
import type { Device } from '../types/admin.types';

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Nunca';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function getBooleanLabel(value: boolean) {
  return value ? 'Ativo' : 'Inativo';
}

export function AdminDevicesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadDevices() {
      try {
        setIsLoading(true);
        setErrorMessage(null);

        const data = await listAdminDevices();

        if (isMounted) {
          setDevices(data);
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

    void loadDevices();

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
          <h1 className="mt-3 text-4xl font-black tracking-tight">Dispositivos</h1>
          <p className="mt-3 max-w-3xl text-base text-xf-muted">
            Lista administrativa dos dispositivos vinculados aos clientes.
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
          {isLoading ? (
            <div className="p-6 text-sm text-xf-muted">
              Carregando dispositivos...
            </div>
          ) : errorMessage ? (
            <div className="p-6 text-sm text-red-300">{errorMessage}</div>
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
                    <th className="px-5 py-4 font-semibold">Plataforma</th>
                    <th className="px-5 py-4 font-semibold">Identificador</th>
                    <th className="px-5 py-4 font-semibold">Status</th>
                    <th className="px-5 py-4 font-semibold">Último acesso</th>
                    <th className="px-5 py-4 font-semibold">Criado em</th>
                  </tr>
                </thead>
                <tbody>
                  {devices.map((device) => (
                    <tr key={device.id} className="border-b border-white/5 last:border-0">
                      <td className="px-5 py-4 font-semibold text-white">
                        {device.device_name ?? 'Sem nome'}
                      </td>
                      <td className="px-5 py-4 text-xf-muted">
                        {device.platform ?? 'Não informada'}
                      </td>
                      <td className="px-5 py-4 text-xf-muted">
                        {device.device_identifier ?? 'Não informado'}
                      </td>
                      <td className="px-5 py-4">
                        <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white">
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
