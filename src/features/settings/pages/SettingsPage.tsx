import { useEffect, useMemo, useState } from 'react';
import { setFocus } from '@noriginmedia/norigin-spatial-navigation';

import { AppShell } from '@/components/layout/AppShell';
import { FocusableButton } from '@/components/tv/FocusableButton';
import { FocusableSection } from '@/components/tv/FocusableSection';
import { FocusableInput } from '@/components/tv/FocusableInput';
import { TvKeyboardModal } from '@/components/tv/keyboard/TvKeyboardModal';
import { useAuth } from '@/app/providers/AuthProvider';
import { getStoredLicenseActivation, saveStoredLicenseActivation } from '@/features/licensing/lib/licenseActivationStorage';
import { activateLicense } from '@/features/licensing/services/licenseActivation.service';
import { getOrCreateDeviceIdentifier } from '@/features/playlists/lib/deviceIdentifier';
import { maskStreamUrl } from '@/lib/security/maskStreamUrl';

export default function SettingsPage() {
  const { signOut } = useAuth();

  const [deviceIdentifier, setDeviceIdentifier] = useState('');
  const [licenseCode, setLicenseCode] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [activationStatus, setActivationStatus] = useState<string | null>(null);
  const [activationError, setActivationError] = useState<string | null>(null);
  const [isActivating, setIsActivating] = useState(false);
  const [keyboardTarget, setKeyboardTarget] = useState<'license' | 'source' | null>(null);

  const maskedSourceUrl = useMemo(() => maskStreamUrl(sourceUrl), [sourceUrl]);

  useEffect(() => {
    const nextDeviceIdentifier = getOrCreateDeviceIdentifier();
    const storedActivation = getStoredLicenseActivation();

    setDeviceIdentifier(nextDeviceIdentifier);

    if (storedActivation?.licenseCode) {
      setLicenseCode(storedActivation.licenseCode);

      if (storedActivation.deviceIdentifier === nextDeviceIdentifier) {
        setActivationStatus('Licença já ativada neste dispositivo.');
      } else {
        setActivationStatus('Licença encontrada. Reative para vincular este dispositivo.');
      }
    }
  }, []);

  function handleActivateLicense() {
    setActivationStatus(null);
    setActivationError(null);
    setIsActivating(true);

    void (async () => {
      try {
        const nextDeviceIdentifier = getOrCreateDeviceIdentifier();

        const activation = await activateLicense({
          licenseCode,
          deviceIdentifier: nextDeviceIdentifier,
          deviceName: 'Xandeflix App',
          platform: 'web',
        });

        saveStoredLicenseActivation({
          licenseCode: activation.license.code ?? licenseCode.trim().toUpperCase(),
          deviceIdentifier: activation.device.deviceIdentifier,
          licenseId: activation.license.id,
          licenseDeviceId: activation.device.id,
          activatedAt: new Date().toISOString(),
        });

        setDeviceIdentifier(activation.device.deviceIdentifier);
        setLicenseCode(activation.license.code ?? '');
        setActivationStatus('Licença ativada com sucesso. A lista autorizada será carregada ao abrir Canais ao Vivo. Aguarde alguns instantes se a grade ainda estiver sendo montada.');
      } catch (error) {
        setActivationError(
          error instanceof Error ? error.message : 'Não foi possível ativar a licença.',
        );
      } finally {
        setIsActivating(false);
      }
    })();
  }

  return (
    <AppShell onSignOut={() => void signOut()} hideHeaderOnTv>
      <section
        className="xf-settings-page mx-auto max-w-5xl text-white"
        data-settings-page-root="true"
      >
        <p className="text-xs font-black uppercase tracking-[0.35em] text-xf-red">
          Configurações
        </p>

        <h1 className="mt-4 text-4xl font-black">
          Ativação do aparelho
        </h1>

        <p className="mt-4 max-w-3xl text-base text-xf-muted">
          Use esta tela para liberar o acesso aos canais, filmes e séries neste aparelho.
        </p>

        <FocusableSection
          focusKey="settings-device-id-card"
          className="mt-6 rounded-2xl border border-xf-red/40 bg-xf-red/10 p-5"
        >
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-xf-red">
            Código do aparelho
          </p>

          <h2 className="mt-3 text-2xl font-black">
            Informe este ID ao provedor
          </h2>

          <p className="mt-3 break-all rounded-xl border border-white/10 bg-black/50 px-4 py-3 font-mono text-lg font-bold">
            {deviceIdentifier || 'Gerando ID...'}
          </p>

          <p className="mt-3 max-w-3xl text-sm text-xf-muted">
            O provedor pode usar este código no painel gestor para vincular uma fonte IPTV autorizada a este aparelho.
          </p>
        </FocusableSection>

        <section className="mt-6 rounded-2xl border border-white/10 bg-black/60 p-6">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-xf-red">
            Ativação por código
          </p>

          <h2 className="mt-3 text-2xl font-black">
            Código fornecido pelo provedor
          </h2>

          <p className="mt-3 max-w-3xl text-sm text-xf-muted">
            Ao ativar, o aplicativo salva a licença neste aparelho e passa a carregar a fonte autorizada automaticamente na tela Canais.
          </p>

          <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <div className="min-w-72 flex-1">
              <FocusableInput
                focusKey="settings-license-code-input"
                label="Código de ativação"
                placeholder="Ex.: XFLX-TEST-001"
                value={licenseCode}
                readOnly
                onEnterPress={() => setKeyboardTarget('license')}
                onClick={() => setKeyboardTarget('license')}
                onChange={(event) => setLicenseCode(event.target.value.toUpperCase())}
                onArrowPress={(direction) => {
                  if (direction === 'up') {
                    setFocus('settings-device-id-card');

                    requestAnimationFrame(() => {
                      document
                        .querySelector('[data-settings-page-root="true"]')
                        ?.scrollIntoView({
                          behavior: 'smooth',
                          block: 'start',
                        });
                    });

                    return false;
                  }

                  return true;
                }}
                selectTextOnEnter
              />
            </div>

            <FocusableButton
              focusKey="settings-activate-license-button"
              className="rounded-xl bg-xf-red px-6 py-4 text-lg font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isActivating || !licenseCode.trim()}
              onEnterPress={handleActivateLicense}
              onClick={handleActivateLicense}
            >
              {isActivating ? 'Ativando...' : 'Ativar'}
            </FocusableButton>
          </div>

          {activationStatus ? (
            <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-200">
              {activationStatus}
            </div>
          ) : null}

          {activationError ? (
            <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
              <p className="font-bold">Falha na ativação</p>
              <p className="mt-1">{activationError}</p>
            </div>
          ) : null}
        </section>

        {isActivating ? (
          <div className="mt-4 rounded-xl border border-xf-red/30 bg-xf-red/10 p-4 text-sm font-bold text-red-100">
            Ativando licença e carregando conteúdo autorizado. Aguarde alguns instantes...
          </div>
        ) : null}

        {isActivating ? (
          <div className="mt-4 rounded-xl border border-xf-red/30 bg-xf-red/10 p-4 text-sm font-bold text-red-100">
            Ativando licença e carregando conteúdo autorizado. Aguarde alguns instantes...
          </div>
        ) : null}

        <section className="mt-6 rounded-2xl border border-white/10 bg-black/60 p-6">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-xf-red">
            URL manual
          </p>

          <h2 className="mt-3 text-2xl font-black">
            Lista IPTV direta
          </h2>

          <p className="mt-3 max-w-3xl text-sm text-xf-muted">
            Campo reservado para ativação manual por URL. Nesta etapa, a tela apenas protege visualmente a URL informada; o carregamento final continuará centralizado na tela Canais.
          </p>

          <div className="mt-5">
            <FocusableInput
              focusKey="settings-source-url-input"
              label="URL da lista IPTV"
              placeholder="Cole aqui a URL M3U/M3U Plus..."
              value={sourceUrl}
              readOnly
              onEnterPress={() => setKeyboardTarget('source')}
              onClick={() => setKeyboardTarget('source')}
              onChange={(event) => setSourceUrl(event.target.value)}
              selectTextOnEnter
            />
          </div>

          {maskedSourceUrl ? (
            <p className="mt-3 break-all font-mono text-xs text-xf-muted">
              URL protegida: {maskedSourceUrl}
            </p>
          ) : null}
        </section>
      </section>

      <TvKeyboardModal
        isOpen={keyboardTarget === 'license'}
        title="Código de ativação"
        initialValue={licenseCode}
        mode="text"
        returnFocusKey="settings-license-code-input"
        onCancel={() => setKeyboardTarget(null)}
        onConfirm={(nextValue) => {
          setLicenseCode(nextValue.toUpperCase());
          setKeyboardTarget(null);
        }}
      />

      <TvKeyboardModal
        isOpen={keyboardTarget === 'source'}
        title="URL da lista IPTV"
        initialValue={sourceUrl}
        mode="url"
        returnFocusKey="settings-source-url-input"
        onCancel={() => setKeyboardTarget(null)}
        onConfirm={(nextValue) => {
          setSourceUrl(nextValue);
          setKeyboardTarget(null);
        }}
      />
    </AppShell>
  );
}
