import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Play } from 'lucide-react';

import { FocusableButton } from '../../../components/tv/FocusableButton';
import { FocusableInput } from '../../../components/tv/FocusableInput';
import { FocusableSection } from '../../../components/tv/FocusableSection';
import { TvKeyboardModal } from '../../../components/tv/keyboard/TvKeyboardModal';
import { useRouteInitialFocus } from '../../../hooks/useRouteInitialFocus';
import { FOCUS_KEYS } from '../../../lib/spatial/focusKeys';
import {
  getStoredLicenseActivation,
  saveStoredLicenseActivation,
} from '@/features/licensing/lib/licenseActivationStorage';
import { activateLicense } from '@/features/licensing/services/licenseActivation.service';
import { getOrCreateDeviceIdentifier } from '@/features/playlists/lib/deviceIdentifier';

export function LoginPage() {
  const [deviceIdentifier, setDeviceIdentifier] = useState('');
  const [licenseCode, setLicenseCode] = useState('');
  const [isActivating, setIsActivating] = useState(false);
  const [shouldContinue, setShouldContinue] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  useRouteInitialFocus();

  useEffect(() => {
    const nextDeviceIdentifier = getOrCreateDeviceIdentifier();
    const storedActivation = getStoredLicenseActivation();

    setDeviceIdentifier(nextDeviceIdentifier);

    if (
      storedActivation?.licenseCode &&
      storedActivation.deviceIdentifier === nextDeviceIdentifier
    ) {
      setLicenseCode(storedActivation.licenseCode);
      setFeedback('Aparelho já ativado. Continuando...');
      setShouldContinue(true);
    }
  }, []);

  if (shouldContinue) {
    return <Navigate to="/preparing-home" replace />;
  }

  async function handleActivateDevice() {
    const nextDeviceIdentifier = deviceIdentifier || getOrCreateDeviceIdentifier();

    setFeedback(null);
    setIsActivating(true);

    try {
      const activation = await activateLicense({
        licenseCode,
        deviceIdentifier: nextDeviceIdentifier,
        deviceName: 'Xandeflix App',
      });

      saveStoredLicenseActivation({
        licenseCode:
          activation.license.code ?? licenseCode.trim().toUpperCase(),
        deviceIdentifier: activation.device.deviceIdentifier,
        licenseId: activation.license.id,
        licenseDeviceId: activation.device.id,
        activatedAt: new Date().toISOString(),
      });

      setDeviceIdentifier(activation.device.deviceIdentifier);
      setLicenseCode(activation.license.code ?? licenseCode.trim().toUpperCase());
      setFeedback('Aparelho ativado com sucesso. Preparando sua Home...');
      setShouldContinue(true);
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : 'Não foi possível ativar este aparelho.',
      );
    } finally {
      setIsActivating(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await handleActivateDevice();
  }

  return (
    <>
      <main className="xf-app flex min-h-screen items-start justify-center overflow-y-auto px-4 py-5 md:items-center">
      <FocusableSection
        focusKey={FOCUS_KEYS.LOGIN_SECTION}
        className="w-full max-w-md rounded-2xl bg-xf-surface p-5 md:p-6"
      >
        <div className="mb-5 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-xf-red">
            <Play size={20} fill="white" />
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-xf-red">
              Xandeflix
            </p>
            <h1 className="text-2xl font-black">Ativar aparelho</h1>
          </div>
        </div>

        <div className="mb-5 rounded-2xl border border-white/10 bg-black/30 p-3">
          <p className="text-[0.65rem] font-black uppercase tracking-[0.25em] text-xf-red">
            ID do aparelho
          </p>

          <p className="mt-2 break-all rounded-xl bg-black/40 px-3 py-2 text-xs font-bold text-white">
            {deviceIdentifier || 'Gerando ID...'}
          </p>

          <p className="mt-2 text-[0.7rem] font-semibold leading-relaxed text-xf-muted">
            Libere este ID no painel admin e informe abaixo o código de ativação.
          </p>
        </div>

        <form className="space-y-3" onSubmit={handleSubmit}>
          <FocusableInput
            focusKey="login-license-code-input"
            label="Código de ativação"
            type="text"
            autoComplete="off"
            value={licenseCode}
            onChange={(event) => setLicenseCode(event.target.value.toUpperCase())}
            placeholder="Digite o código do painel admin"
            readOnly
            onEnterPress={() => setIsKeyboardOpen(true)}
            onClick={() => setIsKeyboardOpen(true)}
          />

          {feedback && (
            <p className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white">
              {feedback}
            </p>
          )}

          <FocusableButton
            focusKey={FOCUS_KEYS.LOGIN_SUBMIT_BUTTON}
            className="w-full rounded-lg bg-xf-red px-5 py-3 text-base font-bold text-white disabled:opacity-60"
            disabled={isActivating || !licenseCode.trim()}
            onEnterPress={() => {
              void handleActivateDevice();
            }}
            onClick={() => {
              void handleActivateDevice();
            }}
          >
            {isActivating ? 'Ativando...' : 'Ativar e entrar'}
          </FocusableButton>
        </form>
      </FocusableSection>
    </main>

      <TvKeyboardModal
        isOpen={isKeyboardOpen}
        title="Código de ativação"
        initialValue={licenseCode}
        returnFocusKey="login-license-code-input"
        onCancel={() => setIsKeyboardOpen(false)}
        onConfirm={(nextLicenseCode) => {
          setLicenseCode(nextLicenseCode.trim().toUpperCase());
          setIsKeyboardOpen(false);
        }}
      />
    </>
  );
}
