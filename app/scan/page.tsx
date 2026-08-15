'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { PageShell, SiteHeader } from '../../components/ui';
import { ArrowLeftIcon, ScanIcon } from '../../components/icons';

export default function QRScannerPage() {
  const router = useRouter();
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Initializing scanner
    const scanner = new Html5QrcodeScanner(
      "qr-reader",
      {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        rememberLastUsedCamera: true,
        supportedScanTypes: [0], // Camera only
        videoConstraints: { facingMode: "environment" } // Prefer back camera
      },
      /* verbose= */ false
    );

    const onScanSuccess = (decodedText: string) => {
      try {
        const url = new URL(decodedText);
        // Only redirect if it's our site
        if (url.origin === window.location.origin) {
          scanner.clear().catch(console.error);
          router.push(url.pathname + url.search);
        } else {
          setError('Link QR tidak valid. Pastikan QR berasal dari RafQR.');
        }
      } catch (err) {
        setError('QR bukan tautan yang valid.');
      }
    };

    const onScanFailure = (error: string) => {
      // Just keep scanning
    };

    scanner.render(onScanSuccess, onScanFailure);
    scannerRef.current = scanner;

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(err => console.error("Failed to clear scanner", err));
      }
    };
  }, [router]);

  return (
    <PageShell>
      <SiteHeader
        label="RafQR Scan"
        onLogoClick={() => router.push('/')}
        right={
          <button onClick={() => router.push('/')} aria-label="Kembali" className="neo-btn bg-ink text-white p-2.5">
            <ArrowLeftIcon />
          </button>
        }
      />

      <main className="max-w-xl mx-auto w-full flex-1 flex flex-col justify-center px-5 py-10 animate-fade-in pb-20">
        <div className="space-y-8">
          <div className="space-y-3 text-center">
             <span className="w-16 h-16 bg-accent border-2 border-ink rounded-lg shadow-neo flex items-center justify-center mx-auto text-ink"><ScanIcon className="w-8 h-8" /></span>
             <h2 className="text-3xl font-extrabold tracking-tight">Pindai QR</h2>
             <p className="text-sm font-medium text-muted">Arahkan kamera ke QR Code untuk terhubung otomatis.</p>
          </div>

          <div className="neo-card p-2 overflow-hidden">
            <div id="qr-reader" className="w-full !border-none overflow-hidden rounded-md" />
          </div>

          {error && (
            <div className="bg-danger border-2 border-ink rounded-md p-4 text-sm font-bold text-white text-center shadow-neo">
               {error}
            </div>
          )}
        </div>
      </main>

      {/* Override html5-qrcode styles to match branding */}
      <style jsx global>{`
        #qr-reader { border: none !important; }
        #qr-reader__dashboard { padding: 20px !important; background: transparent !important; }
        #qr-reader__dashboard_section_csr span button,
        #qr-reader__dashboard_section_csr button {
          background: #141414 !important;
          color: #fff !important;
          font-weight: 700 !important;
          font-size: 14px !important;
          padding: 10px 20px !important;
          border: 2px solid #141414 !important;
          border-radius: 8px !important;
          box-shadow: 3px 3px 0px 0px #141414 !important;
          transition: all 0.2s !important;
        }
        #qr-reader__dashboard_section_csr button:hover {
          box-shadow: none !important;
          transform: translate(3px, 3px) !important;
          background: #FFD100 !important;
          color: #141414 !important;
        }
        #qr-reader__camera_selection {
          background: #fff !important;
          color: #141414 !important;
          border: 2px solid #141414 !important;
          border-radius: 8px !important;
          font-size: 14px !important;
          font-weight: 600 !important;
          padding: 10px !important;
          margin-bottom: 16px !important;
          outline: none;
          box-shadow: 3px 3px 0px 0px #141414 !important;
        }
        #qr-reader__status_span {
           font-size: 12px !important;
           font-weight: 600 !important;
           color: #6B6B66 !important;
        }
        #qr-reader__dashboard_section_swaplink { display: none !important; }
      `}</style>
    </PageShell>
  );
}
