import { useEffect, useState } from 'react';
import { useIsPhone } from '../hooks/useIsPhone';
import {
  isIosHomeScreenCandidate,
  isStandaloneDisplay,
  readInstallDismissed,
  writeInstallDismissed,
  type BeforeInstallPromptEvent,
} from '../lib/pwaInstall';
import { color, font, radius } from '../theme/tokens';
import { LogoMark } from './Logo';

export function usePwaInstall() {
  const [standalone, setStandalone] = useState(isStandaloneDisplay);
  const [ios, setIos] = useState(isIosHomeScreenCandidate);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(readInstallDismissed);

  useEffect(() => {
    setStandalone(isStandaloneDisplay());
    setIos(isIosHomeScreenCandidate());
    const media = window.matchMedia('(display-mode: standalone)');
    const sync = () => setStandalone(isStandaloneDisplay());
    media.addEventListener('change', sync);
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      setStandalone(true);
      writeInstallDismissed();
      setDismissed(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      media.removeEventListener('change', sync);
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const available = !standalone && (ios || deferred !== null);

  return { standalone, ios, deferred, dismissed, available, setDismissed, setDeferred, setStandalone };
}

export function InstallPrompt({
  reopenNonce,
  install,
}: {
  reopenNonce: number;
  install: ReturnType<typeof usePwaInstall>;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const { standalone, ios, deferred, dismissed, setDismissed, setDeferred, setStandalone } = install;

  useEffect(() => {
    if (standalone || dismissed) return;
    if (!ios && !deferred) return;
    const timer = window.setTimeout(() => setSheetOpen(true), 1200);
    return () => window.clearTimeout(timer);
  }, [standalone, dismissed, ios, deferred]);

  useEffect(() => {
    if (reopenNonce === 0 || standalone) return;
    if (!ios && !deferred) return;
    setSheetOpen(true);
  }, [reopenNonce, standalone, ios, deferred]);

  const closeAndRemember = () => {
    writeInstallDismissed();
    setDismissed(true);
    setSheetOpen(false);
  };

  const promptInstall = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    setDeferred(null);
    writeInstallDismissed();
    setDismissed(true);
    setSheetOpen(false);
    if (choice.outcome === 'accepted') setStandalone(true);
  };

  if (standalone) return null;

  return (
    <SheetPwaInstall
      open={sheetOpen}
      mode={ios ? 'ios' : 'android'}
      onDismiss={closeAndRemember}
      onInstall={ios ? closeAndRemember : () => void promptInstall()}
    />
  );
}

export function SheetPwaInstall({
  open,
  mode,
  onDismiss,
  onInstall,
}: {
  open: boolean;
  mode: 'android' | 'ios';
  onDismiss: () => void;
  onInstall: () => void;
}) {
  const isPhone = useIsPhone();
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onDismiss]);

  if (!open) return null;

  const body = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <LogoMark size={40} />
        <span>
          <span style={{ display: 'block', fontFamily: font.display, fontSize: 16, fontWeight: 600, letterSpacing: '-0.02em' }}>
            Install BornTask
          </span>
          <span style={{ fontSize: 13, color: color.muted }}>Home screen, your workspace</span>
        </span>
      </div>
      {mode === 'ios' ? (
        <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14, lineHeight: 1.45, color: color.ink3 }}>
          <li>Tap Share in the Safari toolbar.</li>
          <li>Tap Add to Home Screen.</li>
          <li>Tap Add.</li>
        </ol>
      ) : (
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45, color: color.ink3 }}>
          Add BornTask to your home screen. It opens in its own window, like an app.
        </p>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" onClick={onDismiss} style={isPhone ? ghostBtnPhone : ghostBtn}>
          Not now
        </button>
        <button type="button" onClick={onInstall} style={isPhone ? primaryBtnPhone : primaryBtn}>
          {mode === 'ios' ? 'Got it' : 'Install'}
        </button>
      </div>
    </>
  );

  if (isPhone) {
    return (
      <div role="presentation" className="bt-phone-sheet" style={{ zIndex: 80, bottom: 0 }} onClick={onDismiss}>
        <div
          role="dialog"
          aria-label="Install BornTask"
          onClick={(event) => event.stopPropagation()}
          style={{
            marginTop: 'auto',
            background: color.surface,
            borderTop: `1px solid ${color.border}`,
            borderRadius: '16px 16px 0 0',
            padding: '18px 16px calc(16px + env(safe-area-inset-bottom, 0px))',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          {body}
        </div>
      </div>
    );
  }

  return (
    <div
      role="presentation"
      onClick={onDismiss}
      style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'color-mix(in srgb, var(--bt-ink) 22%, transparent)' }}
    >
      <div
        role="dialog"
        aria-label="Install BornTask"
        onClick={(event) => event.stopPropagation()}
        style={{
          position: 'absolute',
          top: 72,
          right: 24,
          width: 340,
          padding: '16px 16px 14px',
          background: color.surface,
          border: `1px solid ${color.border}`,
          borderRadius: radius.lg,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {body}
      </div>
    </div>
  );
}

const ghostBtn = {
  height: 36,
  minWidth: 36,
  padding: '0 12px',
  border: `1px solid ${color.border}`,
  borderRadius: radius.md,
  background: color.surface,
  font: 'inherit',
  fontSize: 13,
  color: color.ink,
  cursor: 'pointer',
} as const;

const primaryBtn = {
  height: 36,
  minWidth: 36,
  padding: '0 14px',
  border: 0,
  borderRadius: radius.md,
  background: color.brandFill,
  font: 'inherit',
  fontSize: 13,
  fontWeight: 600,
  color: color.brandOn,
  cursor: 'pointer',
} as const;

const ghostBtnPhone = { ...ghostBtn, height: 44, minWidth: 44 } as const;
const primaryBtnPhone = { ...primaryBtn, height: 44, minWidth: 44 } as const;
