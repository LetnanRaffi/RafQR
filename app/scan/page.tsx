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
        supportedScanTypes: [0] // Camera only
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
    <div className="min-h-screen bg-black text-white selection:bg-white selection:text-black font-sans flex flex-col p-6 sm:p-10">
      <header className="flex justify-between items-center mb-16">
        <button onClick={() => router.push('/')} className="flex items-center gap-3">
          <Logo size={32} />
          <h1 className="text-xl font-black tracking-tighter uppercase italic">RafQR Scan</h1>
        </button>
        <button onClick={() => router.push('/')} className="opacity-40 hover:opacity-100 transition-opacity"><ArrowLeftIcon /></button>
      </header>

      <main className="max-w-xl mx-auto w-full flex-1 flex flex-col justify-center">
        <div className="space-y-12">
          <div className="space-y-4">
             <h2 className="text-4xl sm:text-6xl font-black uppercase tracking-tighter leading-none">Instant <br /><span className="opacity-20">QR Scanner</span></h2>
             <p className="text-[10px] font-black uppercase tracking-widest opacity-40 leading-relaxed max-w-sm">Arahkan kamera ke QR Code di layar PC untuk melanjutkan proses transfer.</p>
          </div>

          <div className="relative group overflow-hidden border border-white/10 p-4 bg-white/[0.02]">
            <div id="qr-reader" className="w-full !border-none !bg-transparent" />
            <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-white/20" />
            <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-white/20" />
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-white/20" />
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-white/20" />
          </div>

          {error && (
            <div className="bg-red-950/20 border border-red-900/40 p-6 text-[10px] font-black uppercase tracking-widest text-red-500 animate-pulse">
               ERROR: {error}
            </div>
          )}
          
          <div className="p-8 border border-white/5 opacity-10 flex flex-col gap-2">
             <p className="text-[8px] font-black uppercase tracking-widest">Scanner V1.0 - RaffiTech Labs</p>
             <p className="text-[8px] font-black uppercase tracking-widest">Supports: /d/ /u/</p>
          </div>
        </div>
      </main>

      {/* Override html5-qrcode styles to match branding */}
      <style jsx global>{`
        #qr-reader__dashboard {
          padding: 20px 0 !important;
          background: transparent !important;
        }
        #qr-reader__dashboard_section_csr button {
          background: white !important;
          color: black !important;
          font-weight: 900 !important;
          text-transform: uppercase !important;
          letter-spacing: 0.2em !important;
          font-size: 10px !important;
          padding: 12px 24px !important;
          border: none !important;
          border-radius: 0 !important;
        }
        #qr-reader__camera_selection {
          background: #111 !important;
          color: white !important;
          border: 1px solid rgba(255,255,255,0.1) !important;
          font-size: 10px !important;
          padding: 8px !important;
          text-transform: uppercase !important;
          letter-spacing: 0.1em !important;
        }
        #qr-reader__status_span {
           font-size: 10px !important;
           text-transform: uppercase !important;
           opacity: 0.4 !important;
        }
      `}</style>
    </div>
  );
}
