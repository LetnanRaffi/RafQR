'use client';

import { useEffect, useRef, useState } from 'react';
import { AppShell, Btn, Copied, TopBar } from './ui';
import { CheckCircleIcon, CopyIcon, DownloadIcon, FileIcon, WarningIcon } from './icons';
import QrBox from './BrandedQR';
import { formatSize } from '../lib/format';
import {
  P2PProvider,
  type P2PCallbacks,
  type P2PFileInfo,
  type P2PFileResult,
  type P2PPreview,
  type P2PProgress,
  type P2PStatus,
} from '../lib/p2p';

type ReceivedFile = P2PFileInfo & {
  progress?: P2PProgress;
  result?: P2PFileResult;
  accepting?: boolean;
};

const statusLabel: Record<P2PStatus, string> = {
  idle: 'Menyiapkan sambungan',
  waiting: 'Menunggu pengirim',
  connecting: 'Menghubungkan perangkat',
  connected: 'Terhubung langsung',
  transferring: 'Menerima file',
  verifying: 'Memeriksa file',
  completed: 'Kiriman selesai',
  failed: 'Sambungan terputus',
  expired: 'Sesi sudah kedaluwarsa',
};

function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return 'Menghitung…';
  if (seconds < 60) return `${Math.ceil(seconds)} dtk`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} mnt ${Math.ceil(seconds % 60)} dtk`;
}

function percent(done: number, total: number): number {
  return total === 0 ? 100 : Math.min(100, Math.max(0, Math.round((done / total) * 100)));
}

function describeError(error: Error): string {
  const message = error.message || 'Transfer gagal.';
  if (/expired|kedaluwarsa/i.test(message)) return 'Sesi sudah kedaluwarsa. Minta pengirim membuat kode baru.';
  if (/already|occupied|dipakai|receiver/i.test(message)) return 'Sesi ini sudah dipakai perangkat lain.';
  if (/not found|invalid|tidak ditemukan|tidak valid/i.test(message)) return 'Kode tidak valid atau sesi sudah tidak tersedia.';
  return message;
}

export default function P2PReceiver({ code, onClose }: { code?: string; onClose: () => void }) {
  const provider = useRef<P2PProvider | null>(null);
  const [status, setStatus] = useState<P2PStatus>(code ? 'connecting' : 'idle');
  const [files, setFiles] = useState<ReceivedFile[]>([]);
  const [preview, setPreview] = useState<P2PPreview | null>(null);
  const [invitation, setInvitation] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wakeLockUnavailable, setWakeLockUnavailable] = useState(false);

  useEffect(() => {
    let active = true;
    let client: P2PProvider | null = null;
    // Deferring avoids joining twice during React's development effect replay.
    const timer = window.setTimeout(() => {
      if (!active) return;
      client = new P2PProvider();
      provider.current = client;
      const callbacks: P2PCallbacks = {
        onSession(session: { url: string }) { if (active) setInvitation(session.url); },
        onPreview(next: P2PPreview) { if (active) setPreview(next); },
        onStatus(next) {
          if (!active) return;
          setStatus(next);
          if (next === 'expired') setError('Sesi sudah kedaluwarsa. Minta pengirim membuat kode baru.');
          if (next === 'failed') setError((old) => old || 'Koneksi terputus. Minta pengirim mencoba lagi atau memakai Cloud.');
        },
        onFile(file) {
          if (!active) return;
          setFiles((current) => [...current.filter((item) => item.id !== file.id), file].sort((a, b) => a.index - b.index));
        },
        onProgress(progress) {
          if (!active) return;
          setFiles((current) => current.map((file) => file.id === progress.fileId ? { ...file, progress } : file));
        },
        onFileResult(result) {
          if (!active) return;
          setFiles((current) => current.map((file) => file.id === result.fileId ? { ...file, accepting: false, result } : file));
        },
        onError(next) {
          if (!active) return;
          setError(describeError(next));
        },
      };
      void (code ? client.connectReceiver(code, callbacks) : client.startReceiver(callbacks)).catch((next: Error) => {
        if (!active) return;
        setError(describeError(next));
        setStatus('failed');
      });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
      client?.cancel();
      if (provider.current === client) provider.current = null;
    };
  }, [code]);

  const copyInvitation = async () => {
    if (!invitation) return;
    try {
      await navigator.clipboard.writeText(invitation);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch { setError('Tautan tidak bisa disalin. Salin manual dari kotak tautan.'); }
  };

  useEffect(() => {
    if (!['connecting', 'connected', 'transferring', 'verifying'].includes(status)) return;
    let lock: WakeLockSentinel | null = null;
    let active = true;
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
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', request);
      void lock?.release();
    };
  }, [status]);

  const accept = (id: string) => {
    const current = provider.current;
    if (!current) return;
    setFiles((items) => items.map((file) => file.id === id ? { ...file, accepting: true } : file));
    setError(null);
    // Keep this call in the click stack so showSaveFilePicker retains user activation.
    void current.acceptFile(id).catch((next: Error) => {
      setFiles((items) => items.map((file) => file.id === id ? { ...file, accepting: false } : file));
      if (next.name !== 'AbortError') setError(describeError(next));
    });
  };

  const overall = files.reduce((max, file) => Math.max(max, file.progress?.overallBytes || 0), 0);
  const overallDone = files.reduce((max, file) => Math.max(max, file.progress?.overallTransferredBytes || 0), 0);
  const isTerminal = status === 'failed' || status === 'expired';

  return (
    <AppShell>
      <TopBar onLogoClick={onClose} right={<span className="p2p-mode-label">Transfer langsung</span>} />
      <main className="page narrow p2p-receive">
        <header className="p2p-receive-head">
          <span className="p2p-eyebrow">QRDATA / P2P</span>
          <h1 className="big">Terima file dan teks langsung</h1>
          <p className="lead">File dan teks dikirim antarperangkat. Biarkan halaman ini tetap terbuka sampai transfer selesai.</p>
        </header>

        <section className={`card p2p-state-card${isTerminal ? ' is-error' : ''}${status === 'completed' ? ' is-complete' : ''}`} aria-live="polite">
          <span className="p2p-state-icon" aria-hidden="true">{status === 'completed' ? <CheckCircleIcon size={23} /> : isTerminal ? <WarningIcon size={23} /> : <span className="p2p-pulse" />}</span>
          <div className="p2p-state-copy">
            <h2>{statusLabel[status]}</h2>
            <p>{error || (status === 'connecting' ? 'Mencari perangkat pengirim…' : status === 'connected' ? 'Menunggu kiriman dari pengirim.' : status === 'completed' ? 'Pesan sudah diterima dan file yang selesai diverifikasi sudah tersimpan.' : 'Jangan tutup tab atau kunci layar saat transfer berlangsung.')}</p>
          </div>
        </section>

        {invitation && ['waiting', 'connecting'].includes(status) && <section className="card pad stack p2p-invitation" aria-label="Undangan pengirim">
          <div className="stack tight"><h2 className="sml">Undang pengirim</h2><p className="hint">Kirim tautan atau QR ini ke perangkat yang akan mengirim. Sesi menunggu hingga 10 menit.</p></div>
          <div className="linkrow"><span className="u">{invitation}</span><Copied show={copied} />{!copied && <Btn size="sm" onClick={copyInvitation}><CopyIcon size={14} /> Salin</Btn>}</div>
          <QrBox value={invitation} size={212} caption="Pindai untuk mengirim" />
        </section>}

        {preview && <section className="card pad stack p2p-preview" aria-label="Pratinjau kiriman">
          <div className="stack tight"><h2 className="sml">Pratinjau kiriman</h2><p className="hint">Lihat isi pesan dan daftar file sebelum menyimpan. Pratinjau gambar dikirim langsung dari perangkat pengirim.</p></div>
          {preview.text && <div className="p2p-preview-text"><span className="tiny muted">PESAN TEKS</span><p>{preview.text}</p><Btn size="sm" variant="white" onClick={() => navigator.clipboard.writeText(preview.text).catch(() => setError('Pesan tidak bisa disalin.'))}><CopyIcon size={14} /> Salin teks</Btn></div>}
          {preview.files.map((file, index) => <div className="p2p-preview-file" key={`${index}-${file.name}`}>
            {file.thumbnail ? <img src={file.thumbnail} alt={`Pratinjau ${file.name}`} /> : <span className="p2p-file-glyph"><FileIcon size={20} /></span>}
            <span className="p2p-preview-file-copy"><strong>{file.name}</strong><small>{formatSize(file.size)}{file.type ? ` · ${file.type}` : ''}</small></span>
          </div>)}
          {preview.totalFiles > preview.files.length && <p className="hint">{preview.totalFiles - preview.files.length} file lain akan dikirim.</p>}
        </section>}

        {files.length > 0 && (
          <section className="p2p-file-section" aria-label="Daftar file">
            <div className="p2p-section-heading"><h2>File masuk</h2><span className="mono">{files.length}{files[0]?.total ? ` / ${files[0].total}` : ''}</span></div>
            {overall > 0 && <div className="p2p-overall"><span>Total diterima</span><strong className="num">{percent(overallDone, overall)}%</strong><div className="progline"><i style={{ width: `${percent(overallDone, overall)}%` }} /></div></div>}
            <div className="p2p-file-list">
              {files.map((file) => {
                const bytes = file.progress?.transferredBytes || 0;
                const progress = percent(bytes, file.size);
                const finished = !!file.result?.ok;
                return <article className="card p2p-file-card" key={file.id}>
                  <span className="p2p-file-glyph" aria-hidden="true"><FileIcon size={20} /></span>
                  <div className="p2p-file-main">
                    <div className="p2p-file-title"><h3 title={file.name}>{file.name}</h3><span className="mono">{file.index + 1}/{file.total}</span></div>
                    <p className="p2p-file-meta">{formatSize(file.size)}{file.size === 0 ? ' · File kosong' : ''}</p>
                    {file.progress && !finished && <div className="p2p-file-progress">
                      <div className="progline" role="progressbar" aria-label={`Progress ${file.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><i style={{ width: `${progress}%` }} /></div>
                      <div className="p2p-progress-details"><strong className="num">{progress}%</strong><span>{formatSize(bytes)} / {formatSize(file.size)}</span></div>
                      <div className="p2p-progress-details"><span>{file.progress.speedBps > 0 ? `${formatSize(file.progress.speedBps)}/dtk` : 'Menghitung kecepatan…'}</span><span>Sisa {formatDuration(file.progress.etaSeconds)}</span></div>
                    </div>}
                    {file.result && <p className={`p2p-file-result${finished ? ' ok' : ' bad'}`}>{finished ? '✓ SHA-256 cocok · tersimpan' : `⚠ ${file.result.error || 'Hash tidak cocok; file mungkin korup.'}`}</p>}
                    {!file.result && !file.progress && !isTerminal && <Btn className="p2p-save-button" variant="yellow" block disabled={file.accepting} onClick={() => accept(file.id)}><DownloadIcon size={17} />{file.accepting ? 'Menyiapkan penyimpanan…' : 'Pilih tempat simpan & terima'}</Btn>}
                  </div>
                </article>;
              })}
            </div>
          </section>
        )}

        {status !== 'completed' && <aside className="p2p-receive-note">
          <WarningIcon size={17} />
          <p>{wakeLockUnavailable ? 'Layar tidak bisa dijaga tetap aktif otomatis. Jangan kunci layar atau tutup tab.' : 'Jangan tutup tab selama transfer. Jika perangkat tidur, sambungan bisa terputus.'}</p>
        </aside>}

        {isTerminal && <div className="p2p-receive-actions"><p>Pengirim dapat mencoba sesi baru atau memilih mode Cloud untuk mengirim ulang.</p><Btn variant="white" onClick={onClose}>Kembali ke beranda</Btn></div>}
      </main>
    </AppShell>
  );
}
