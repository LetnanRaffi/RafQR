'use client';

import { useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { DownloadIcon } from './icons';

/**
 * QR presentation. No rotation (a tilted code is the single most important
 * thing on this app and tilt costs first-scan success) and no colour picker —
 * one ink tone, yellow corner brackets.
 */
export default function QrBox({
  value,
  size = 212,
  caption,
  className = '',
}: {
  value: string;
  size?: number;
  caption?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const downloadPng = () => {
    const svg = ref.current?.querySelector('svg');
    if (!svg) return;
    try {
      const svgData = new XMLSerializer().serializeToString(svg);
      const url = URL.createObjectURL(new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' }));
      const img = new Image();
      img.onload = () => {
        const scale = 4;
        const canvas = document.createElement('canvas');
        canvas.width = size * scale;
        canvas.height = size * scale;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        }
        const a = document.createElement('a');
        a.download = `rafqr-${Date.now()}.png`;
        a.href = canvas.toDataURL('image/png');
        a.click();
        URL.revokeObjectURL(url);
      };
      img.src = url;
    } catch {
      // download is a convenience; nothing to recover from here
    }
  };

  return (
    <div className={`stack ${className}`} style={{ justifyItems: 'center', gap: 12 }}>
      <div className="qrbox">
        <i className="brk tl" /><i className="brk tr" /><i className="brk bl" /><i className="brk br" />
        <div ref={ref}>
          <QRCodeSVG
            value={value}
            size={size}
            level="M"
            bgColor="#FFFFFF"
            fgColor="#111113"
            marginSize={2}
            imageSettings={{
              src: '/logo.svg',
              height: Math.round(size * 0.16),
              width: Math.round(size * 0.16),
              excavate: true,
              crossOrigin: 'anonymous',
            }}
          />
        </div>
      </div>
      {caption && <span className="badge n">{caption}</span>}
      <div className="qrtools">
        <button type="button" className="btn white sm" onClick={downloadPng}>
          <DownloadIcon size={14} /> Simpan QR
        </button>
      </div>
    </div>
  );
}