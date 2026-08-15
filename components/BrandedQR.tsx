'use client';

import { useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from './toast';

type QRThemeKey = 'ink' | 'slate' | 'forest' | 'cobalt';

const QR_THEMES: Record<QRThemeKey, { fg: string; swatch: string }> = {
  ink: { fg: '#141414', swatch: 'bg-ink' },
  slate: { fg: '#334155', swatch: 'bg-[#334155]' },
  forest: { fg: '#166534', swatch: 'bg-[#166534]' },
  cobalt: { fg: '#1E3A8A', swatch: 'bg-[#1E3A8A]' },
};

interface BrandedQRProps {
  value: string;
  size?: number;
  caption?: string;
  showCustomize?: boolean;
  showDownload?: boolean;
  rotate?: string;
  className?: string;
}

export default function BrandedQR({
  value,
  size = 240,
  caption = 'Pindai untuk membuka',
  showCustomize = true,
  showDownload = true,
  rotate = 'rotate-1',
  className = '',
}: BrandedQRProps) {
  const [themeKey, setThemeKey] = useState<QRThemeKey>('ink');
  const theme = QR_THEMES[themeKey];
  const qrRef = useRef<HTMLDivElement>(null);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast('Tautan tersalin.', 'success');
    } catch {
      toast('Gagal menyalin tautan.', 'error');
    }
  };

  const downloadPng = () => {
    const svg = qrRef.current?.querySelector('svg');
    if (!svg) return;
    try {
      const svgData = new XMLSerializer().serializeToString(svg);
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);
      const img = new Image();
      img.onload = () => {
        const scale = 4;
        const canvas = document.createElement('canvas');
        canvas.width = size * scale;
        canvas.height = size * scale;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        }
        const a = document.createElement('a');
        a.download = `rafqr-${Date.now()}.png`;
        a.href = canvas.toDataURL('image/png');
        a.click();
        URL.revokeObjectURL(url);
        toast('QR berhasil diunduh.', 'success');
      };
      img.onerror = () => toast('Gagal mengunduh QR.', 'error');
      img.src = url;
    } catch {
      toast('Gagal mengunduh QR.', 'error');
    }
  };

  return (
    <div className={`neo-card p-5 flex flex-col items-center gap-4 ${rotate} ${className}`}>
      {/* QR Frame */}
      <div
        ref={qrRef}
        onClick={copyLink}
        title="Klik untuk menyalin tautan"
        className="relative cursor-pointer border-2 border-ink rounded-md shadow-neo p-4 bg-white hover:-translate-y-0.5 hover:shadow-neo-lg transition-all"
      >
        {/* Corner brackets */}
        <div className="absolute -top-2 -left-2 w-5 h-5 border-t-3 border-l-3 border-ink" />
        <div className="absolute -top-2 -right-2 w-5 h-5 border-t-3 border-r-3 border-accent" />
        <div className="absolute -bottom-2 -left-2 w-5 h-5 border-b-3 border-l-3 border-accent" />
        <div className="absolute -bottom-2 -right-2 w-5 h-5 border-b-3 border-r-3 border-ink" />

        <QRCodeSVG
          value={value}
          size={size}
          level="H"
          bgColor="#FFFFFF"
          fgColor={theme.fg}
          marginSize={1}
          imageSettings={{
            src: '/logo.svg',
            height: Math.round(size * 0.2),
            width: Math.round(size * 0.2),
            excavate: true,
            crossOrigin: 'anonymous',
          }}
        />
      </div>

      {/* Caption */}
      {caption && (
        <div className="neo-tag bg-ink text-white">{caption}</div>
      )}

      {/* Customize / Download */}
      {(showCustomize || showDownload) && (
        <div className="flex items-center gap-2.5 flex-wrap justify-center">
          {showCustomize &&
            (Object.keys(QR_THEMES) as QRThemeKey[]).map((key) => (
              <button
                key={key}
                aria-label={`Warna QR ${key}`}
                title={`Warna: ${key}`}
                onClick={() => setThemeKey(key)}
                className={`w-6 h-6 rounded border-2 transition-all ${QR_THEMES[key].swatch} ${
                  themeKey === key
                    ? 'border-ink shadow-neo-hover scale-110'
                    : 'border-ink/30 hover:scale-110'
                }`}
              />
            ))}
          {showDownload && (
            <button
              onClick={downloadPng}
              className="ml-1 neo-btn bg-white text-[11px] px-3 py-1.5 hover:bg-accent"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.4}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Unduh QR
            </button>
          )}
        </div>
      )}
    </div>
  );
}
