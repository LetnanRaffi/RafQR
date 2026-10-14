'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { AppShell, TopBarBack, Btn, Field } from '../../components/ui';
import { ScanIcon, WarningIcon } from '../../components/icons';

export default function QRScannerPage() {
  const router = useRouter();
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualId, setManualId] = useState('');

  useEffect(() => {
    if (!document.getElementById('qr-reader')) return;
    const scanner = new Html5QrcodeScanner(
      'qr-reader',
      {
        fps: 10,
        // Fixed 250px overflows small phone viewports and silently crops.
        qrbox: (w, h) => ({ width: Math.floor(Math.min(w, h) * 0.75), height: Math.floor(Math.min(w, h) * 0.75) }),
        rememberLastUsedCamera: false,
        supportedScanTypes: [0],
        videoConstraints: { facingMode: 'environment' },
      },
      false,
    );

    const onScanSuccess = (decoded: string) => {
      try {
        const url = new URL(decoded);
        if (url.origin === window.location.origin) {
          scanner.clear().catch(() => {});
          router.push(url.pathname + url.search);
        } else {
          setError('QR ini bukan dari RafQR. Pindai ulang, atau ketik kode manual di bawah.');
        }
      } catch {
        setError('QR bukan tautan yang valid. Pindai ulang atau ketik kode manual.');
      }
    };

    scanner.render(onScanSuccess, () => { /* keeps scanning */ });
    scannerRef.current = scanner;
    return () => { scannerRef.current?.clear().catch(() => {}); };
  }, [router]);

  const openManual = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = manualId.trim().replace(/[^a-zA-Z0-9-_]/g, '');
    if (!clean) { setError('Masukkan kode sesi dulu.'); return; }
    scannerRef.current?.clear().catch(() => {});
    router.push(`/d/${clean}`);
  };

  return (
    <AppShell>
      <TopBarBack onBack={() => router.push('/')} title="Pindai QR" />

      <div className="page tight narrow">
        <div className="stack" style={{ gap: 14 }}>
          <div className="card flat" style={{ padding: 0, overflow: 'hidden' }}>
            <div id="qr-reader" style={{ width: '100%' }} />
          </div>

          <div className="row" style={{ gap: 10 }}>
            <span className="badge y"><ScanIcon size={13} /> Kamera belakang</span>
          </div>

          <form onSubmit={openManual} className="stack tight">
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

          <p className="hint">Scanner tetap mencoba membaca. Kalau kamera tidak diizinkan, ketik kode sesi secara manual di atas.</p>
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
        #qr-reader video { border-radius: 12px !important; }
      `}</style>
    </AppShell>
  );
}