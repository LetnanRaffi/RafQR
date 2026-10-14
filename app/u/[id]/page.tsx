'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { uploadFileToR2 } from '../../../lib/r2-client';
import SiteFooter from '../../../components/Footer';
import { toast } from '../../../components/toast';
import { formatSize } from '../../../lib/format';
import { MAX_FILE_BYTES, purgeUploads, trackTransfer } from '../../../lib/session';
import { formatLimit } from '../../../lib/limits';
import { AppShell, TopBar, Btn, Dropzone, FileRow, FileRow as Row } from '../../../components/ui';
import { ClockIcon, ScanIcon, ShareIcon, DownloadIcon, XIcon, ArrowUpIcon } from '../../../components/icons';

interface UploadedFile { fileName: string; fileSize: number; fileType: string; firebaseUrl: string; storageRef: string; }

export default function MobileUploadPage() {
  const { id } = useParams();
  const router = useRouter();

  const [files, setFiles] = useState<File[]>([]);
  const [text, setText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [current, setCurrent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [alive, setAlive] = useState<boolean | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const totalSize = files.reduce((s, f) => s + f.size, 0);

  // Preflight before any interaction is enabled — never let someone upload a
  // large file into a session that already expired.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/session?id=${id}`)
      .then((res) => { if (!cancelled) setAlive(res.ok); })
      .catch(() => { if (!cancelled) setAlive(false); });
    return () => { cancelled = true; };
  }, [id]);

  const addFiles = useCallback((incoming: File[]) => {
    setError(null);
    setFiles((prev) => [...prev, ...incoming]);
  }, []);

  const send = async () => {
    setError(null);
    if (files.length === 0 && !text.trim()) { setError('Pilih file atau isi teks dulu.'); return; }
    const oversize = files.find((f) => f.size > MAX_FILE_BYTES);
    if (oversize) { setError(`"${oversize.name}" melebihi batas ${formatLimit(MAX_FILE_BYTES)}.`); return; }

    setUploading(true);
    setProgress(0);
    const uploaded: UploadedFile[] = [];
    const abort = new AbortController();
    abortRef.current = abort;

    try {
      for (let i = 0; i < files.length; i++) {
        setCurrent(files[i].name);
        const { downloadURL, storagePath } = await uploadFileToR2(
          files[i],
          (p) => setProgress(Math.round(((i + p / 100) / (files.length || 1)) * 100)),
          undefined,
          abort.signal,
        );
        uploaded.push({
          fileName: files[i].name,
          fileSize: files[i].size,
          fileType: files[i].type,
          firebaseUrl: downloadURL,
          storageRef: storagePath,
        });
      }
      setProgress(90);
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          files: uploaded.length > 0 ? uploaded : undefined,
          textContent: text.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        await purgeUploads(uploaded.map((f) => f.storageRef));
        throw new Error(body.error || 'Gagal mengirim data ke server.');
      }
      setProgress(100);
      trackTransfer(String(id), uploaded.length > 0 ? uploaded : [{ fileName: 'Pesan teks', fileSize: new Blob([text]).size }]);
      router.push(`/d/${id}`);
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        await purgeUploads(uploaded.map((f) => f.storageRef));
        setProgress(0);
      } else {
        setError((err as Error).message || 'Gagal mengirim.');
      }
    } finally {
      setUploading(false);
      setCurrent('');
    }
  };

  const header = (
    <TopBar
      onLogoClick={() => router.push('/')}
      right={<span className="badge y"><ArrowUpIcon size={13} /> Kirim ke PC</span>}
    />
  );

  if (alive === false) {
    return (
      <AppShell>
        {header}
        <div className="page tight narrow">
          <div className="stack" style={{ gap: 6 }}>
            <h1 className="big" style={{ fontSize: 26 }}>Sesi sudah tidak aktif</h1>
            <p className="lead">PC-nya sudah berhenti menunggu — kemungkinan lewat 30 menit.</p>
          </div>
          <div className="alert"><ClockIcon size={16} /> Minta pengirim membuat sesi baru, lalu scan QR yang baru.</div>
          <div style={{ opacity: 0.45, pointerEvents: 'none' }}>
            <Dropzone title="Pilih file dari HP" sub="Pindai ulang dulu" disabled />
          </div>
          <Btn block size="lg" onClick={() => router.push('/scan')}><ScanIcon size={16} /> Pindai QR sesi baru</Btn>
        </div>
        <SiteFooter />
      </AppShell>
    );
  }

  return (
    <AppShell>
      {header}
      <div className="page tight narrow">
        <div className="stack" style={{ gap: 6 }}>
          <h1 className="big" style={{ fontSize: 26 }}>Kirim ke PC</h1>
          <p className="lead">Sesi <span className="mono">{String(id)}</span> · PC sedang menunggu file kamu.</p>
        </div>

        {files.length === 0 ? (
          <Dropzone
            title="Pilih file dari HP"
            sub={`Foto, video, dokumen · maks ${formatLimit(MAX_FILE_BYTES)} per file`}
            cta="Buka pilih file"
            onFiles={addFiles}
            disabled={uploading}
          />
        ) : (
          <>
            <div className="rows">
              {files.map((f, i) => (
                <Row
                  key={`${f.name}-${i}`}
                  name={f.name}
                  thumb={f.type.startsWith('image/') ? <span className="img"><img src={URL.createObjectURL(f)} alt="" /></span> : undefined}
                  meta={`${formatSize(f.size)} · ${uploading && current === f.name ? 'mengirim' : 'siap'}`}
                  actions={
                    uploading ? undefined : (
                      <Btn size="icon" onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))} aria-label={`Hapus ${f.name}`}>
                        <XIcon size={15} />
                      </Btn>
                    )
                  }
                />
              ))}
            </div>
            <Btn variant="white" block onClick={() => fileRef.current?.click()} disabled={uploading}>
              Tambah file lain
            </Btn>
          </>
        )}

        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => { addFiles(Array.from(e.target.files || [])); e.target.value = ''; }}
        />

        <textarea className="inp" value={text} onChange={(e) => setText(e.target.value)} placeholder="Tambah pesan untuk PC (opsional)…" disabled={uploading} />

        {error && <p className="err" role="alert">{error}</p>}
      </div>

      {uploading ? (
        <div className="dock">
          <div className="progcard">
            <div className="lbl"><span>{current || 'mengirim'}</span><span className="num">{progress}%</span></div>
            <div className="progline"><i style={{ width: `${progress}%` }} /></div>
          </div>
          <Btn variant="white" block onClick={() => abortRef.current?.abort()}>Batalkan</Btn>
        </div>
      ) : (
        <div className="dock">
          <div className="sum">
            <span>{files.length > 0 ? `${files.length} file · ${formatSize(totalSize)}` : 'Belum ada file'}</span>
            <span className="muted">langsung ke PC</span>
          </div>
          <Btn block size="lg" onClick={send} disabled={files.length === 0 && !text.trim()}>
            Kirim ke PC sekarang
          </Btn>
        </div>
      )}
    </AppShell>
  );
}