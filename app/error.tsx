'use client';

import { useEffect } from 'react';
import { AppShell, Btn } from '../components/ui';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);

  return (
    <AppShell center>
      <div className="stack" style={{ justifyItems: 'center', maxWidth: 340 }}>
        <span className="badge r">Terjadi kesalahan</span>
        <h1 className="mid">Ada yang tidak beres</h1>
        <p className="lead" style={{ textAlign: 'center' }}>
          Sesi mungkin sudah kedaluwarsa, atau ada gangguan sesaat.
        </p>
        <div className="row" style={{ gap: 8 }}>
          <Btn onClick={reset}>Coba lagi</Btn>
          <a className="btn white" href="/">Beranda</a>
        </div>
      </div>
    </AppShell>
  );
}