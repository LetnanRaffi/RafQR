'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { Logo } from '../../components/Logo';

const ArrowLeftIcon = () => (
  <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
  </svg>
);

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
      console.log('Scanned text:', decodedText);
      try {
        const url = new URL(decodedText);
        // Only redirect if it's our site
        if (url.origin === window.location.origin) {
          scanner.clear().catch(console.error);
          router.push(url.pathname + url.search);
        } else {
          setError('Link QR tidak valid. Pastikan itu adalah QR dari RafQR.');
        }
      } catch (err) {
        setError('QR bukan merupakan link yang valid.');
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
    <div className="min-h-screen bg-transparent text-white font-sans flex flex-col p-6 sm:p-10">
      <nav className="relative z-10 flex justify-between items-center max-w-5xl mx-auto w-full mb-12">
        <button onClick={() => router.push('/')} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <Logo size={24} />
          <h1 className="text-lg font-bold tracking-tight">RafQR Pindai</h1>
        </button>
        <button onClick={() => router.push('/')} className="bg-white/5 hover:bg-white/10 p-3 rounded-full transition-colors border border-white/10"><ArrowLeftIcon /></button>
      </nav>

      <main className="max-w-xl mx-auto w-full flex-1 flex flex-col justify-center animate-fade-in pb-24">
        <div className="space-y-12">
          <div className="space-y-4 text-center">
             <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-6 mx-auto">
               <svg className="w-8 h-8 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10V5a2 2 0 012-2h5m4 0h5a2 2 0 012 2v5m0 4v5a2 2 0 01-2 2h-5m-4 0H5a2 2 0 01-2-2v-5M12 12h.01M9 12h.01M15 12h.01" /></svg>
             </div>
             <h2 className="text-4xl font-bold tracking-tight mb-2">Pindai QR Code</h2>
             <p className="text-sm text-gray-400 font-medium">Arahkan kamera ke arah QR Code yang digenerate oleh perangkat pengirim untuk menghubungkan sesi.</p>
          </div>

          <div className="glass-panel p-2 rounded-[2rem] relative group border border-white/10 overflow-hidden shadow-2xl">
            <div id="qr-reader" className="w-full !border-none !bg-white/5 rounded-[1.5rem] overflow-hidden" />
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-xs font-semibold text-red-400 text-center">
               KESALAHAN: {error}
            </div>
          )}
        </div>
      </main>

      {/* Override html5-qrcode styles to match branding */}
      <style jsx global>{`
        #qr-reader {
          border: none !important;
        }
        #qr-reader__dashboard {
          padding: 24px !important;
          background: transparent !important;
        }
        #qr-reader__dashboard_section_csr span button,
        #qr-reader__dashboard_section_csr button {
          background: rgba(79,70,229,1) !important;
          color: white !important;
          font-weight: 600 !important;
          font-size: 13px !important;
          padding: 10px 20px !important;
          border: none !important;
          border-radius: 12px !important;
          transition: background 0.2s !important;
        }
        #qr-reader__dashboard_section_csr button:hover {
          background: rgba(79,70,229,0.8) !important;
        }
        #qr-reader__camera_selection {
          background: rgba(255,255,255,0.05) !important;
          color: white !important;
          border: 1px solid rgba(255,255,255,0.1) !important;
          border-radius: 10px !important;
          font-size: 13px !important;
          padding: 10px !important;
          margin-bottom: 12px !important;
          outline: none;
        }
        #qr-reader__status_span {
           font-size: 12px !important;
           color: rgba(255,255,255,0.5) !important;
        }
        #qr-reader__dashboard_section_swaplink {
           display: none !important;
        }
      `}</style>
    </div>
  );
}
