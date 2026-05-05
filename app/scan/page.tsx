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
    <div className="min-h-screen bg-white text-black font-sans flex flex-col p-6 sm:p-10 relative overflow-hidden">
      {/* BACKGROUND DECO */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, black 1px, transparent 0)', backgroundSize: '24px 24px' }}></div>

      <nav className="relative z-10 flex justify-between items-center max-w-6xl mx-auto w-full mb-12">
        <button onClick={() => router.push('/')} className="flex items-center gap-4 hover:rotate-2 transition-transform">
          <Logo size={32} />
          <h1 className="text-2xl font-black uppercase tracking-tighter">RafQR Scan</h1>
        </button>
        <button onClick={() => router.push('/')} className="bg-black text-white p-3 border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-1 hover:translate-y-1 transition-all"><ArrowLeftIcon /></button>
      </nav>

      <main className="max-w-xl mx-auto w-full flex-1 flex flex-col justify-center animate-fade-in pb-24">
        <div className="space-y-12">
          <div className="space-y-6 text-center">
             <div className="w-20 h-20 bg-neo-green border-4 border-black shadow-neo flex items-center justify-center mb-6 mx-auto -rotate-3">
               <svg className="w-10 h-10 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M3 10V5a2 2 0 012-2h5m4 0h5a2 2 0 012 2v5m0 4v5a2 2 0 01-2 2h-5m-4 0H5a2 2 0 01-2-2v-5M12 12h.01M9 12h.01M15 12h.01" /></svg>
             </div>
             <h2 className="text-5xl font-black uppercase tracking-tighter mb-2">Pindai QR</h2>
             <p className="text-lg font-bold text-black/60 italic">Arahkan kamera ke QR Code untuk terhubung otomatis.</p>
          </div>

          <div className="neo-card p-2 bg-white rotate-1 overflow-hidden">
            <div id="qr-reader" className="w-full !border-none !bg-neo-blue/5 overflow-hidden" />
          </div>

          {error && (
            <div className="bg-neo-pink border-4 border-black p-4 text-sm font-black text-white uppercase text-center shadow-neo">
               !! {error} !!
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
          background: black !important;
          color: white !important;
          font-weight: 900 !important;
          text-transform: uppercase !important;
          letter-spacing: 0.1em !important;
          font-size: 14px !important;
          padding: 12px 24px !important;
          border: 4px solid black !important;
          border-radius: 0 !important;
          box-shadow: 4px 4px 0px 0px rgba(163,230,53,1) !important;
          transition: all 0.2s !important;
        }
        #qr-reader__dashboard_section_csr button:hover {
          box-shadow: none !important;
          transform: translate(2px, 2px) !important;
          background: #a3e635 !important;
          color: black !important;
        }
        #qr-reader__camera_selection {
          background: white !important;
          color: black !important;
          border: 4px solid black !important;
          border-radius: 0 !important;
          font-size: 14px !important;
          font-weight: 900 !important;
          padding: 12px !important;
          margin-bottom: 20px !important;
          outline: none;
          box-shadow: 4px 4px 0px 0px rgba(0,0,0,1) !important;
        }
        #qr-reader__status_span {
           font-size: 12px !important;
           font-weight: 900 !important;
           text-transform: uppercase !important;
           color: black !important;
           opacity: 0.5 !important;
        }
        #qr-reader__dashboard_section_swaplink {
           display: none !important;
        }
      `}</style>
    </div>
  );
}
