export function AdminDashboardPage() {
  return (
    <main className="xf-app min-h-screen px-8 py-10 text-white">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-xf-muted">
            Xandeflix Admin
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-tight">
            Painel Administrativo
          </h1>
          <p className="mt-3 max-w-3xl text-base text-xf-muted">
            Área inicial para gestão de clientes, dispositivos, fontes IPTV,
            cache de canais e auditoria administrativa.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <article className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 className="text-xl font-bold">Clientes</h2>
            <p className="mt-2 text-sm text-xf-muted">
              Cadastro, status, vencimento e observações dos assinantes.
            </p>
          </article>

          <article className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 className="text-xl font-bold">Dispositivos</h2>
            <p className="mt-2 text-sm text-xf-muted">
              Controle de aparelhos vinculados aos clientes.
            </p>
          </article>

          <article className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 className="text-xl font-bold">Fontes IPTV</h2>
            <p className="mt-2 text-sm text-xf-muted">
              Gestão das URLs M3U, Xtream ou fontes manuais.
            </p>
          </article>

          <article className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 className="text-xl font-bold">Cache de canais</h2>
            <p className="mt-2 text-sm text-xf-muted">
              Base otimizada para futura sincronização e exibição no catálogo.
            </p>
          </article>

          <article className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 className="text-xl font-bold">Auditoria</h2>
            <p className="mt-2 text-sm text-xf-muted">
              Registro das ações administrativas relevantes do sistema.
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}
