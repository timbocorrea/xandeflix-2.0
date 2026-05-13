import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';

import { useAuth } from '../../../app/providers/AuthProvider';

export function AdminLoginPage() {
  const navigate = useNavigate();
  const { signIn, signOut, isAuthenticated, isLoading } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setFeedback(null);
    setIsSubmitting(true);

    try {
      await signIn(email.trim(), password);
      navigate('/admin', { replace: true });
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : 'Não foi possível acessar o painel administrativo.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSignOut() {
    setFeedback(null);
    setIsSubmitting(true);

    try {
      await signOut();
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : 'Não foi possível encerrar a sessão administrativa.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="xf-app flex min-h-screen items-center justify-center px-4 py-8">
      <section className="w-full max-w-md rounded-2xl border border-white/10 bg-xf-surface p-6 shadow-2xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-xf-red">
            <ShieldCheck size={22} />
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-xf-red">
              Xandeflix Admin
            </p>
            <h1 className="text-2xl font-black">Acesso administrativo</h1>
          </div>
        </div>

        <p className="mb-5 text-sm font-semibold leading-relaxed text-xf-muted">
          Esta área é exclusiva para administradores. O acesso do aplicativo do
          cliente continua separado e usa apenas ID do aparelho e código de ativação.
        </p>

        {isAuthenticated && (
          <div className="mb-4 rounded-xl border border-white/10 bg-black/30 p-3 text-sm font-semibold text-white">
            Já existe uma sessão administrativa ativa neste navegador.
          </div>
        )}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-2 block text-xs font-black uppercase tracking-[0.2em] text-xf-muted">
              E-mail
            </span>
            <input
              className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm font-semibold text-white outline-none transition focus:border-xf-red"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="admin@xandeflix.com"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-black uppercase tracking-[0.2em] text-xf-muted">
              Senha
            </span>
            <input
              className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm font-semibold text-white outline-none transition focus:border-xf-red"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Digite sua senha"
            />
          </label>

          {feedback && (
            <p className="rounded-xl bg-white/10 px-4 py-3 text-sm font-semibold text-white">
              {feedback}
            </p>
          )}

          <button
            className="w-full rounded-xl bg-xf-red px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-white transition disabled:opacity-60"
            type="submit"
            disabled={isLoading || isSubmitting || !email.trim() || !password}
          >
            {isSubmitting ? 'Entrando...' : 'Entrar no painel'}
          </button>

          {isAuthenticated && (
            <button
              className="w-full rounded-xl border border-white/10 px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-white transition disabled:opacity-60"
              type="button"
              disabled={isLoading || isSubmitting}
              onClick={() => void handleSignOut()}
            >
              Sair da sessão atual
            </button>
          )}
        </form>
      </section>
    </main>
  );
}
