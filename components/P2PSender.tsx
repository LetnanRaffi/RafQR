'use client';

import { useEffect, useRef, useState } from 'react';
import QrBox from './BrandedQR';
import { AppShell, Btn, Copied, TopBar } from './ui';
import { CopyIcon } from './icons';
import { formatSize } from '../lib/format';
import { trackP2PMetric } from '../lib/session';
import { P2PProvider, type P2PProgress, type P2PSessionInfo, type P2PStatus } from '../lib/p2p';

export interface SenderFile {
  key: string;
  file: File;
}

const labels: Record<P2PStatus, string> = {
  idle: 'Menyiapkan sesi',
  waiting: 'Menunggu perangkat lain',
  connecting: 'Menghubungkan perangkat',
  connected: 'Terhubung langsung',
  transferring: 'Mengirim file',
  verifying: 'Menyiapkan & memeriksa file',
  completed: 'Semua file terkirim',
  failed: 'Koneksi langsung gagal',
  expired: 'Sesi kedaluwarsa',
};

function duration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return 'Menghitung…';
  if (seconds < 60) return `${Math.ceil(seconds)} dtk`;
  return `${Math.floor(seconds / 60)} mnt ${Math.ceil(seconds % 60)} dtk`;
}

export default function P2PSender({ files, onAddFiles, onRemoveFile, onCloudFallback, onClose }: {
  files: SenderFile[];
  onAddFiles: (files: File[]) => void;
  onRemoveFile: (key: string) => void;
  onCloudFallback: () => void;
  onClose: () => void;
}) {
  const provider = useRef<P2PProvider | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const idToIndex = useRef(new Map<string, number>());
  const [session, setSession] = useState<P2PSessionInfo | null>(null);
  const [status, setStatus] = useState<P2PStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<P2PProgress | null>(null);
  const [perFile, setPerFile] = useState<Record<number, number>>({});
  const [results, setResults] = useState<Record<number, boolean>>({});
  const [copied, setCopied] = useState(false);
  const [wakeLockUnavailable, setWakeLockUnavailable] = useState(false);

  useEffect(() => {
    let active = true;
    let client: P2PProvider | null = null;
    // React development replays effects; defer session creation so replay does
    // not leave a second, abandoned session on the signaling Worker.
    const timer = window.setTimeout(() => {
      if (!active) return;
      client = new P2PProvider();
      provider.current = client;
      void client.startSender(files.map(({ file }) => file), {
      onSession: (next) => { if (active) { setSession(next); trackP2PMetric('session_created'); } },
      onStatus: (next) => {
        if (!active) return;
        setStatus(next);
        if (next === 'connected') trackP2PMetric('connected');
        if (next === 'completed') trackP2PMetric('verified');
        if (next === 'failed') trackP2PMetric('connect_failed');
      },
      onFile: (file) => { idToIndex.current.set(file.id, file.index); },
      onProgress: (next) => {
        if (!active) return;
        setProgress(next);
        const index = idToIndex.current.get(next.fileId);
        if (index !== undefined) setPerFile((current) => ({ ...current, [index]: next.totalBytes === 0 ? 100 : Math.round(next.transferredBytes / next.totalBytes * 100) }));
      },
      onFileResult: (result) => {
        if (!active) return;
        const index = idToIndex.current.get(result.fileId);
        if (index !== undefined) setResults((current) => ({ ...current, [index]: result.ok }));
        if (!result.ok) setError(result.error || 'Penerima mendeteksi file korup.');
      },
      onError: (next) => { if (active) setError(next.message); },
      }).then((next) => { if (active) setSession(next); }).catch((next: Error) => {
        if (!active) return;
        setError(next.message || 'Gagal membuat sesi P2P.');
        setStatus('failed');
      });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
      client?.cancel();
      if (provider.current === client) provider.current = null;
    };
    // A session is created once. File changes are sent through updateSenderFiles below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (status !== 'waiting') return;
    const client = provider.current;
    if (!client || client.currentStatus !== 'waiting') return;
    try {
      client.updateSenderFiles(files.map(({ file }) => file));
    } catch (next) {
      setError((next as Error).message);
    }
  }, [files, status]);

  useEffect(() => {
    if (!['connecting', 'connected', 'transferring', 'verifying'].includes(status)) return;
    let active = true;
    let lock: WakeLockSentinel | null = null;
    const request = async () => {
      if (!active || document.visibilityState !== 'visible') return;
      if (!('wakeLock' in navigator)) { setWakeLockUnavailable(true); return; }
      try {
        lock = await navigator.wakeLock.request('screen');
        if (!active) await lock.release();
        else setWakeLockUnavailable(false);
      } catch {
        if (active) setWakeLockUnavailable(true);
      }
    };
    void request();
    document.addEventListener('visibilitychange', request);
    return () => { active = false; document.removeEventListener('visibilitychange', request); void lock?.release(); };
  }, [status]);

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { setError('Tidak bisa menyalin tautan. Salin dari kotak tautan.'); }
  };

  const url = session ? `${typeof window !== 'undefined' ? window.location.origin : ''}/p/${session.code}` : '';
  const totalBytes = files.reduce((sum, item) => sum + item.file.size, 0);
  const overallPercent = status === 'completed' ? 100 : totalBytes === 0
    ? 0 : Math.min(100, Math.round((progress?.overallTransferredBytes || 0) / totalBytes * 100));
  const editable = status === 'waiting';
  const failed = status === 'failed' || status === 'expired';

  return <AppShell>
    <TopBar onLogoClick={onClose} right={<span className="badge y">Langsung (P2P)</span>} />
    <main className="page narrow stack p2p-sender">
      <header className="stack tight">
        <span className="p2p-eyebrow">RAFQR / TRANSFER LANGSUNG</span>
        <h1 className="big">{labels[status]}.</h1>
        <p className="lead">File bergerak antarperangkat melalui koneksi WebRTC. Biarkan kedua tab tetap terbuka sampai verifikasi selesai.</p>
      </header>

      {session && <section className="card pad stack" aria-label="Tautan penerima">
        <div className="p2p-sender-code"><span>Kode sesi</span><strong className="mono">p2p:{session.code}</strong></div>
        <div className="linkrow"><span className="u">{url}</span><Copied show={copied} />{!copied && <Btn size="sm" onClick={() => copy(url)}><CopyIcon size={14} /> Salin</Btn>}</div>
        <QrBox value={url} size={212} caption="Pindai untuk menerima" />
      </section>}

      <section className="card pad stack" aria-live="polite">
        <div className="p2p-section-heading"><h2>Status transfer</h2><strong>{overallPercent}%</strong></div>
        <div className="progline" role="progressbar" aria-label="Progress P2P total" aria-valuenow={overallPercent} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${overallPercent}%` }} /></div>
        {progress && <p className="hint">{formatSize(progress.speedBps)}/dtk · sisa {duration(progress.etaSeconds)}</p>}
        <div className="rows">
          {files.map(({ key, file }, index) => <div className="p2p-sender-file" key={key}>
            <span className="p2p-sender-file-name" title={file.name}>{file.name}</span>
            <span className="muted tiny">{formatSize(file.size)} · {results[index] ? 'SHA-256 cocok' : `${perFile[index] || 0}%`}</span>
            {editable && files.length > 1 && <Btn size="sm" variant="ghost" onClick={() => onRemoveFile(key)} aria-label={`Hapus ${file.name}`}>Hapus</Btn>}
          </div>)}
        </div>
        {editable && <Btn variant="white" block onClick={() => picker.current?.click()}>Tambah file lain</Btn>}
        <input ref={picker} type="file" multiple className="sr-only" aria-label="Tambah file P2P" onChange={(event) => { onAddFiles(Array.from(event.target.files || [])); event.target.value = ''; }} />
      </section>

      {error && <p className="err" role="alert">{error}</p>}
      <p className="hint">{wakeLockUnavailable ? 'Layar tidak bisa dijaga tetap aktif otomatis. ' : ''}Jangan tutup tab atau kunci layar selama transfer.</p>
      {failed && <p className="hint">Gagal tersambung langsung. Kirim lewat Cloud? File yang dipilih tetap tersedia.</p>}
      <div className="p2p-sender-actions">
        {status !== 'completed' && <Btn variant={failed ? 'yellow' : 'white'} block onClick={() => { trackP2PMetric('fallback_chosen'); provider.current?.cancel(); onCloudFallback(); }}>Kirim lewat Cloud</Btn>}
        <Btn variant="white" block onClick={onClose}>{status === 'completed' ? 'Selesai — kirim lagi' : 'Batalkan'}</Btn>
      </div>
    </main>
  </AppShell>;
}
