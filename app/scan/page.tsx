'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { startScanner, stopScanner, pauseScanner, resumeScanner } from '../../lib/scanner';
import { AppShell, TopBarBack, Btn, Field } from '../../components/ui';
import { ScanIcon, WarningIcon, ImageIcon } from '../../components/icons';

export default function QRScannerPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [manualId, setManualId] = useState('');
  const navigating = useRef(false);

  useEffect(() => {
    const onSuccess = (decoded: string) => {
      // html5-qrcode fires this on every frame that decodes; without a latch the
      // route push and the teardown race each other.
      if (navigating.current) return;
      let target: string;
      try {
        const url = new URL(decoded);
        if (url.origin !== window.location.origin) {
          setError('QR ini bukan dari QRData. Pindai ulang, atau ketik kode manual di bawah.');
          return;
        }
        target = url.pathname + url.search + url.hash;
      } catch {
        setError('QR bukan tautan yang valid. Pindai ulang atau ketik kode manual.');
        return;
      }
      navigating.current = true;
      void stopScanner().finally(() => router.push(target));
    };

    void startScanner('qr-reader', onSuccess, () => { /* keep scanning */ });

    const onVisibility = () => (document.hidden ? pauseScanner() : resumeScanner());
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      void stopScanner();
    };
  }, [router]);

  const openManual = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = manualId.trim().replace(/[^a-zA-Z0-9-_]/g, '');
    if (!clean) { setError('Masukkan kode sesi dulu.'); return; }
    navigating.current = true;
    void stopScanner().finally(() => router.push(`/d/${clean}`));
  };

  return (
    <AppShell>
      <TopBarBack onBack={() => router.push('/')} title="Pindai QR" />

      <div className="page tight">
        <div className="camwrap">
          <div className="card flat" style={{ padding: 0, overflow: 'hidden' }}>
            <div id="qr-reader" style={{ width: '100%' }} />
          </div>

          <div className="stack" style={{ gap: 12 }}>
            <span className="badge y"><ScanIcon size={13} /> Kamera belakang</span>

            <form onSubmit={openManual}>
              <Field label="Atau ketik kode sesi" htmlFor="sid">
                <div className="row" style={{ gap: 8 }}>
                  <input
                    id="sid"
                    className="inp m"
                    value={manualId}
                    onChange={(e) => setManualId(e.target.value.toUpperCase())}
                    placeholder="K4X9PL"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <Btn type="submit">Buka</Btn>
                </div>
              </Field>
            </form>

            {error && (
              <div className="alert" role="alert">
                <WarningIcon size={16} style={{ flex: 'none', marginTop: 1 }} />
                <span>{error}</span>
              </div>
            )}

            <p className="hint">
              Kamera dimatikan otomatis saat tab tidak terlihat, lalu dinyalakan lagi tanpa meminta izin ulang.
            </p>
          </div>
        </div>
      </div>

      <style jsx global>{`
        #qr-reader { border: none !important; background: transparent !important; }
        #qr-reader__dashboard_section_csr span button,
        #qr-reader__dashboard_section_csr button {
          background: #111113 !important; color: #fff !important;
          font-weight: 600 !important; font-size: 13.5px !important;
          padding: 10px 18px !important; border: 0 !important;
          border-radius: 12px !important; box-shadow: 0 1px 2px rgba(17,17,19,.05) !important;
          min-height: 44px !important;
        }
        #qr-reader__camera_selection {
          background: #fff !important; color: #111113 !important;
          border: 1px solid #D9D6D1 !important; border-radius: 12px !important;
          font-size: 14px !important; padding: 10px !important; margin-bottom: 16px !important;
        }
        #qr-reader__status_span { font-size: 12px !important; font-weight: 600 !important; color: #71717A !important; }
        #qr-reader__dashboard_section_swaplink { display: none !important; }
        #qr-reader video { border-radius: 12px !important; display: block !important; }
      `}</style>
    </AppShell>
  );
}
