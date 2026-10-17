'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import P2PSender, { type SenderFile } from '../../../../components/P2PSender';
import LivePhotoHint from '../../../../components/LivePhotoHint';
import { AppShell, Btn, TopBar } from '../../../../components/ui';
import { formatSize } from '../../../../lib/format';
import { MAX_FILE_BYTES } from '../../../../lib/session';
import { CloudProvider } from '../../../../lib/transfer/cloud-provider';

export default function InvitedSenderPage() {
  const router = useRouter();
  const { code } = useParams<{ code: string }>();
  const [token, setToken] = useState<string | null>(null);
  const [files, setFiles] = useState<SenderFile[]>([]);
  const [text, setText] = useState('');
  const [started, setStarted] = useState(false);
  const [fallback, setFallback] = useState<'idle' | 'uploading' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [cloudUrl, setCloudUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cloud = useRef<CloudProvider | null>(null);

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const value = fragment.get('token');
    setToken(value && /^[A-Za-z0-9_-]{40,60}$/.test(value) ? value : '');
    return () => cloud.current?.cancel();
  }, []);

  const addFiles = (selected: File[]) => {
    setFiles((current) => [...current, ...selected.map((file) => ({ key: crypto.randomUUID(), file }))]);
    setError(null);
  };

  const start = () => {
    if (!files.length && !text.trim()) { setError('Pilih file atau tulis pesan dulu.'); return; }
    const oversized = files.find(({ file }) => file.size > MAX_FILE_BYTES);
    if (oversized) { setError(`${oversized.file.name} melebihi batas ukuran file.`); return; }
    if (new TextEncoder().encode(text.trim()).byteLength > 16 * 1024) { setError('Pesan P2P maksimal 16 KB.'); return; }
    setError(null);
    setStarted(true);
  };

  const sendCloud = async () => {
    setFallback('uploading');
    setError(null);
    const provider = new CloudProvider();
    cloud.current = provider;
    try {
      const result = await provider.send({ files, textContent: text }, (event) => {
        if (event.type === 'file-progress') setProgress(event.percent);
      });
      setCloudUrl(`${window.location.origin}/d/${encodeURIComponent(result.id)}`);
    } catch (next) {
      setError((next as Error).message || 'Gagal mengirim lewat Cloud.');
      setFallback('error');
    } finally {
      cloud.current = null;
    }
  };

  if (started && fallback === 'idle' && token) return <P2PSender
    files={files}
    text={text}
    invitation={{ code, token }}
    onAddFiles={addFiles}
    onRemoveFile={(key) => setFiles((current) => current.filter((item) => item.key !== key))}
    onCloudFallback={() => { void sendCloud(); }}
    onClose={() => router.push('/')}
  />;

  return <AppShell>
    <TopBar onLogoClick={() => router.push('/')} right={<span className="p2p-mode-label">Undangan P2P</span>} />
    <main className="page narrow stack p2p-invited-send">
      <header className="stack tight"><span className="p2p-eyebrow">QRDATA / KIRIM LANGSUNG</span><h1 className="big">Kirim ke sesi penerima.</h1><p className="lead">Pilih file, tulis pesan, atau keduanya. Kiriman langsung menuju perangkat yang membagikan undangan.</p></header>
      {token === '' && <p className="err" role="alert">Tautan undangan tidak lengkap. Minta penerima membagikan ulang tautan atau QR.</p>}
      {cloudUrl && <section className="card pad stack"><h2 className="sml">Kiriman Cloud siap</h2><p className="hint">Bagikan tautan ini ke penerima. Sesi P2P sebelumnya sudah ditutup.</p><div className="linkrow"><span className="u">{cloudUrl}</span><Btn size="sm" onClick={() => navigator.clipboard.writeText(cloudUrl).catch(() => setError('Tautan tidak bisa disalin.'))}>Salin tautan</Btn></div></section>}
      {token && !cloudUrl && <section className="card pad stack">
        <label className="stack tight"><span className="sml">Pilih file</span><input type="file" multiple onChange={(event) => { addFiles(Array.from(event.target.files || [])); event.target.value = ''; }} disabled={fallback === 'uploading'} /></label>
        {files.length > 0 && <div className="p2p-preview-file-list">{files.map(({ key, file }) => <div className="p2p-preview-file" key={key}><span className="p2p-preview-file-copy"><strong>{file.name}</strong><small>{formatSize(file.size)}</small></span><Btn size="sm" variant="ghost" onClick={() => setFiles((current) => current.filter((item) => item.key !== key))} disabled={fallback === 'uploading'}>Hapus</Btn></div>)}</div>}
        <LivePhotoHint files={files.map(({ file }) => file)} onAddFiles={addFiles} />
        <label className="stack tight"><span className="sml">Pesan teks (opsional)</span><textarea className="inp" value={text} onChange={(event) => setText(event.target.value)} placeholder="Tulis pesan untuk penerima…" rows={4} disabled={fallback === 'uploading'} /></label>
        {error && <p className="err" role="alert">{error}</p>}
        {fallback === 'uploading' ? <p role="status">Mengirim lewat Cloud… {progress}%</p> : fallback === 'error' ? <Btn block onClick={() => { void sendCloud(); }}>Coba lagi lewat Cloud</Btn> : <Btn block size="lg" onClick={start}>Kirim langsung (P2P)</Btn>}
      </section>}
    </main>
  </AppShell>;
}
