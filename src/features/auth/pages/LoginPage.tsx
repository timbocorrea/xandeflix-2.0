import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Play } from 'lucide-react';

import { useAuth } from '../../../app/providers/AuthProvider';
import { FocusableButton } from '../../../components/tv/FocusableButton';
import { FocusableInput } from '../../../components/tv/FocusableInput';
import { FocusableSection } from '../../../components/tv/FocusableSection';

const TEST_EMAIL = 'teste@xandeflix.com';
const TEST_PASSWORD = '12345678';

export function LoginPage() {
  const { signIn, isAuthenticated, isLoading } = useAuth();

  const [email, setEmail] = useState(TEST_EMAIL);
  const [password, setPassword] = useState(TEST_PASSWORD);
  const [feedback, setFeedback] = useState<string | null>(null);

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  async function handleLogin(currentEmail = email, currentPassword = password) {
    setFeedback(null);

    try {
      await signIn(currentEmail, currentPassword);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao entrar.');
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await handleLogin();
  }

  async function handleTestLogin() {
    setEmail(TEST_EMAIL);
    setPassword(TEST_PASSWORD);
    await handleLogin(TEST_EMAIL, TEST_PASSWORD);
  }

  return (
    <main className="xf-app flex min-h-screen items-center justify-center px-6">
      <FocusableSection
        focusKey="login-section"
        autoFocus
        className="w-full max-w-md rounded-2xl bg-xf-surface p-8"
      >
        <div className="mb-8 flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-xl bg-xf-red">
            <Play size={24} fill="white" />
          </div>

          <div>
            <p className="text-sm font-bold uppercase tracking-[0.3em] text-xf-red">
              Xandeflix
            </p>
            <h1 className="text-3xl font-black">Entrar</h1>
          </div>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <FocusableInput
            focusKey="login-email-input"
            label="E-mail"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />

          <FocusableInput
            focusKey="login-password-input"
            label="Senha"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />

          {feedback && (
            <p className="rounded-lg bg-red-950 px-4 py-3 text-sm text-red-200">
              {feedback}
            </p>
          )}

          <FocusableButton
            focusKey="login-submit-button"
            className="w-full rounded-lg bg-xf-red px-6 py-4 text-lg font-bold text-white disabled:opacity-60"
            disabled={isLoading}
            onEnterPress={() => {
              void handleLogin();
            }}
            onClick={() => {
              void handleLogin();
            }}
          >
            {isLoading ? 'Entrando...' : 'Entrar'}
          </FocusableButton>

          <FocusableButton
            focusKey="login-test-button"
            className="w-full rounded-lg bg-white/10 px-6 py-4 text-base font-bold text-white disabled:opacity-60"
            disabled={isLoading}
            onEnterPress={() => {
              void handleTestLogin();
            }}
            onClick={() => {
              void handleTestLogin();
            }}
          >
            Entrar como teste
          </FocusableButton>
        </form>
      </FocusableSection>
    </main>
  );
}