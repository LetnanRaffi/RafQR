'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { decryptData } from '../../../lib/crypto';
import { toast } from '../../../components/toast';
import { formatSize } from '../../../lib/format';
import { MAX_ZIP_BYTES, formatLimit } from '../../../lib/limits';
import {
  AppShell, TopBar, Btn, FileRow, Field, PinBoxes, Countdown, useCountdown, Copied, Disclosure,
} from '../../../components/ui';
import {
  DownloadIcon, ShareIcon, LockIcon, ShieldIcon, CheckIcon, EyeIcon, EditIcon, CopyIcon,
  PrevIcon, NextIcon, XIcon, BackIcon, ClockIcon, CopyIcon as CopyGlyph,
} from '../../../components/icons';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { canShareFiles, shareFile } from '../../../lib/download';
import { streamSaveCloudFile } from '../../../lib/transfer/save-cloud-file';

interface SessionFile { fileName: string; fileSize: number; fileType: string; firebaseUrl: string; storageRef?: string; }
interface FileSession {
  files?: SessionFile[];
  textContent?: string;
  createdAt: number;
  totalSize: number;
  fileCount: number;
  pin?: string;
  e2ee?: boolean;
}

/** Indices to render as dots, centred on `active` and capped for narrow bars. */
function dotWindow(total: number, active: number, max = 9): number[] {
  if (total <= max) return Array.from({ length: total }, (_, i) => i);
  const half = Math.floor((max - 1) / 2);
  const start = Math.min(Math.max(0, active - half), total - max);
  return Array.from({ length: max }, (_, i) => start + i);
}

export default function ReceivePage() {
  const { id } = useParams();
  const [session, setSession] = useState<FileSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ttl, setTtl] = useState<number | null>(null);
  const secondsLeft = useCountdown(ttl);

  const [isLocked, setIsLocked] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);

  const [isEncrypted, setIsEncrypted] = useState(false);
  const [secretKey, setSecretKey] = useState('');
  const [isDecrypted, setIsDecrypted] = useState(false);
  const [decryptError, setDecryptError] = useState<string | null>(null);

  const [previews, setPreviews] = useState<Record<string, string>>({});
  const blobUrls = useRef<string[]>([]);
  const [lightbox, setLightbox] = useState<number | null>(null);

  const [decryptedText, setDecryptedText] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [copied, setCopied] = useState(false);

  const [isZipping, setIsZipping] = useState(false);
  const [busyFile, setBusyFile] = useState<string | null>(null);
  const [shareCapable, setShareCapable] = useState(false);

  useEffect(() => setShareCapable(canShareFiles()), []);

  const textKey = `rafqr_text_${id}`;

  /* ── load ─────────────────────────────────────────────────────── */
  useEffect(() => {
    fetch(`/api/session?id=${id}`)
      .then((res) => {
        if (!res.ok) throw new Error('Data tidak ditemukan atau sudah kedaluwarsa.');
        return res.json();
      })
      .then((result) => {
        setSession(result.data);
        setTtl(typeof result.ttl === 'number' ? result.ttl : null);
        if (result.data.locked) setIsLocked(true);
        if (result.data.e2ee) setIsEncrypted(true);
        setLoading(false);
        if (!result.data.locked && !result.data.e2ee) notify();
      })
      .catch((err) => { setError(err.message); setLoading(false); });
  }, [id]);

  // Restore a locally edited message (PRD §6.7 — never sent back to server).
  useEffect(() => {
    const saved = localStorage.getItem(textKey);
    if (saved) { setDraft(saved); setDecryptedText(saved); }
  }, [textKey]);

  // Object URLs must be released on unmount or a long session leaks memory.
  // A ref, not state: a dependency-based cleanup would revoke URLs that are
  // still on screen in the row that just re-rendered.
  useEffect(() => () => {
    blobUrls.current.forEach((u) => URL.revokeObjectURL(u));
    blobUrls.current = [];
  }, []);

  // Desktop: Esc closes the lightbox, arrows page through the package.
  useEffect(() => {
    if (lightbox === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null);
      if (e.key === 'ArrowLeft') setLightbox((v) => Math.max(0, (v ?? 0) - 1));
      if (e.key === 'ArrowRight') setLightbox((v) => Math.min((session?.files?.length ?? 1) - 1, (v ?? 0) + 1));
    };
    // Lock the page behind: on touch, the sheet otherwise scrolls with it.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [lightbox, session?.files?.length]);

  const notify = useCallback(async () => {
    try { await fetch(`/api/session?id=${id}`, { method: 'PATCH' }); } catch { /* advisory only */ }
  }, [id]);

  const keyOf = (f: SessionFile) => f.storageRef || f.fileName;

  /**
   * Single choke point for every byte out of storage. Guards the HTTP status —
   * a purged/expired presigned URL otherwise yields a 404 XML body that
   * saveAs() would happily write to disk under the real filename.
   */
  const fetchBlob = async (url: string): Promise<Blob> => {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Berkas sudah kedaluwarsa atau dibatalkan.');
    const blob = await res.blob();
    if (session?.e2ee) return (await decryptData(blob, secretKey)) as Blob;
    return blob;
  };

  // Previews resolve on their own — the format is recognised, no button (PRD §6.7).
  useEffect(() => {
    if (!session?.files || isLocked || isEncrypted !== isDecrypted) return;
    session.files.forEach((f) => {
      // A preview must never fetch a multi-gigabyte file into browser memory.
      if (f.fileSize > 25 * 1024 * 1024 || !/^(image|video|audio)\//.test(f.fileType)) return;
      const key = keyOf(f);
      if (previews[key]) return;
      fetchBlob(f.firebaseUrl)
        .then((blob) => {
          const url = URL.createObjectURL(blob);
          blobUrls.current.push(url);
          setPreviews((prev) => (prev[key] ? prev : { ...prev, [key]: url }));
        })
        .catch(() => { /* a broken preview must not break the list */ });
    });
  }, [session, isLocked, isEncrypted, isDecrypted]);

  /* ── actions ──────────────────────────────────────────────────── */
  const unlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError(null);
    const res = await fetch('/api/session/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, pin }),
    });
    if (!res.ok) { setPinError('PIN salah, coba lagi.'); setPin(''); return; }
    const result = await res.json();
    setSession((prev) => ({ ...(prev as FileSession), ...result.data }));
    setIsLocked(false);
    if (result.data.e2ee) setIsEncrypted(true);
    else notify();
  };

  const decrypt = async (e: React.FormEvent) => {
    e.preventDefault();
    setDecryptError(null);
    setLoading(true);
    try {
      if (session?.textContent) {
        const dec = await (await fetch(session.textContent)).blob();
        const plain = (await decryptData(dec, secretKey)) as Blob;
        setDecryptedText(await plain.text());
      }
      setIsDecrypted(true);
      notify();
    } catch {
      setDecryptError('Kunci tidak cocok dengan file ini.');
    } finally {
      setLoading(false);
    }
  };

  const download = async (f: SessionFile, action: 'download' | 'share' = 'download') => {
    setBusyFile(f.fileName);
    try {
      if (action === 'download' && !session?.e2ee && f.fileSize > 100 * 1024 * 1024) {
        await streamSaveCloudFile(f.firebaseUrl, f.fileName);
        toast('File tersimpan.', 'success');
        return;
      }
      const blob = await fetchBlob(f.firebaseUrl);
      if (action === 'share') {
        await shareFile(blob, f.fileName);
      } else {
        saveAs(blob, f.fileName);
        toast('Unduhan dimulai.', 'success');
      }
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return; // user dismissed the sheet
      toast((err as Error).message || 'Gagal menyimpan berkas.', 'error');
    } finally {
      setBusyFile(null);
    }
  };

  const downloadZip = async () => {
    if (!session?.files?.length) return;
    if ((session.totalSize || 0) > MAX_ZIP_BYTES) {
      toast(`Total ${formatLimit(session.totalSize)} terlalu besar untuk dipaketkan. Unduh per file.`, 'error');
      return;
    }
    setIsZipping(true);
    try {
      const zip = new JSZip();
      for (const f of session.files) zip.file(f.fileName, await fetchBlob(f.firebaseUrl));
      const blob = await zip.generateAsync({ type: 'blob' });
      const name = `qrdata-${id}.zip`;
      saveAs(blob, name);
      toast('Unduhan ZIP dimulai.', 'success');
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return;
      toast((err as Error).message || 'Gagal memaketkan ZIP.', 'error');
    } finally {
      setIsZipping(false);
    }
  };

  const copyText = async () => {
    const text = draft || decryptedText || session?.textContent;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const t = document.createElement('textarea');
      t.value = text;
      document.body.appendChild(t);
      t.select();
      document.execCommand('copy');
      document.body.removeChild(t);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareText = async () => {
    const text = draft || decryptedText || session?.textContent;
    if (!text) return;
    const file = new File([text], `qrdata-pesan-${id}.txt`, { type: 'text/plain' });
    try {
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'Pesan dari QRData' });
      else copyText();
    } catch { /* user dismissed the share sheet */ }
  };

  const saveDraft = () => {
    localStorage.setItem(textKey, draft);
    setDecryptedText(draft);
    setEditing(false);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2500);
  };

  /* ── states ───────────────────────────────────────────────────── */
  if (loading && !session) {
    return (
      <AppShell center>
        <div className="stack" style={{ justifyItems: 'center', gap: 12 }}>
          <span className="count num" aria-live="polite"><s /> Memuat paket…</span>
        </div>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell center>
        <div className="stack" style={{ justifyItems: 'center', maxWidth: 340 }}>
          <span className="big404">404</span>
          <h2 className="mid">Sesi sudah habis</h2>
          <p className="lead" style={{ textAlign: 'center' }}>
            Semua sesi dihapus otomatis 30 menit setelah dibuat, supaya tidak ada jejak yang tertinggal.
          </p>
          <div className="info" style={{ width: '100%' }}><ClockIcon size={15} /> {error}</div>
          <a className="btn lg" style={{ padding: '0 26px' }} href="/">Minta sesi baru ke pengirim</a>
          <a className="btn ghost" href="/">Buka beranda</a>
        </div>
      </AppShell>
    );
  }

  if (isLocked) {
    return (
      <AppShell center>
        <form onSubmit={unlock} className="card pad stack" style={{ width: '100%', maxWidth: 340, justifyItems: 'center' }}>
          <span className="tile y" style={{ width: 48, height: 48, borderRadius: 15 }}><LockIcon size={22} /></span>
          <h2 className="mid">Sesi terkunci</h2>
          <p className="lead" style={{ textAlign: 'center', fontSize: 13.5 }}>
            Minta PIN 4 angka dari pengirim. Tidak ada batas percobaan — datamu sendiri, bukan bank.
          </p>
          <PinBoxes value={pin} onChange={setPin} onComplete={() => document.getElementById('unlock-submit')?.click()} />
          {pinError && <p className="err" role="alert">{pinError}</p>}
          <Btn id="unlock-submit" type="submit" block size="lg">Buka isi sesi</Btn>
          <p className="hint">Sesi <span className="mono">{String(id)}</span> · {secondsLeft !== null ? `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}` : '—'} tersisa</p>
        </form>
      </AppShell>
    );
  }

  if (isEncrypted && !isDecrypted) {
    return (
      <AppShell center>
        <form onSubmit={decrypt} className="card pad stack" style={{ width: '100%', maxWidth: 360, justifyItems: 'center' }}>
          <span className="tile y" style={{ width: 48, height: 48, borderRadius: 15 }}><ShieldIcon size={22} /></span>
          <h2 className="mid">File terenkripsi</h2>
          <p className="lead" style={{ textAlign: 'center', fontSize: 13.5 }}>
            Pengirim mengirim kuncinya lewat chat terpisah. Isi di bawah untuk membuka file di perangkat ini.
          </p>
          <div className="field" style={{ width: '100%' }}>
            <label htmlFor="dk">Kunci rahasia</label>
            <input id="dk" className="inp m" style={{ textAlign: 'center' }} value={secretKey} onChange={(e) => setSecretKey(e.target.value)} placeholder="minimal 8 karakter" />
          </div>
          {decryptError && <p className="err" role="alert">{decryptError}</p>}
          <Btn type="submit" block size="lg">Dekripsi di perangkat ini</Btn>
          <p className="hint">Kunci tidak pernah dikirim ke server mana pun.</p>
        </form>
      </AppShell>
    );
  }

  /* ── main ─────────────────────────────────────────────────────── */
  const files = session?.files ?? [];
  const zipAllowed = (session?.totalSize || 0) <= MAX_ZIP_BYTES;
  const lbFile = lightbox !== null ? files[lightbox] : null;
  const canPreview = (f: SessionFile) => !!previews[keyOf(f)] && !!f.fileType?.startsWith('image/');

  return (
    <AppShell>
      <TopBar
        onLogoClick={() => { window.location.href = '/'; }}
        right={<span className="badge n">{isEncrypted ? 'E2EE' : 'Publik'}</span>}
      />

      <main className="page tight">
        <div className="row wrapr" style={{ alignItems: 'flex-end', gap: 10 }}>
          <div>
            <h1 className="big" style={{ fontSize: 26 }}>
              {files.length > 0 ? `${files.length} file masuk` : 'Pesan masuk'}
            </h1>
            <p className="tiny muted" style={{ marginTop: 3 }}>
              Total {formatSize(session?.totalSize || 0)}
              {session?.createdAt ? ` · dibuat ${Math.max(1, Math.round((Date.now() - session.createdAt) / 60000))} menit lalu` : ''}
            </p>
          </div>
          <span className="spacer" />
          {files.length > 0 && (
            zipAllowed ? (
              <Btn size="sm" variant="white" onClick={downloadZip} disabled={isZipping}>
                <DownloadIcon size={14} /> {isZipping ? 'Mengompres…' : 'Unduh semua'}
              </Btn>
            ) : (
              <span className="tiny muted">ZIP dilewati · total {formatLimit(session!.totalSize)}</span>
            )
          )}
        </div>

        {files.length > 0 && (
          <div className="rows">
            {files.map((f, i) => {
              const key = keyOf(f);
              const preview = previews[key];
              const thumb = f.fileType?.startsWith('image/') && preview
                ? <span className="img lg"><img src={preview} alt="" loading="lazy" decoding="async" /></span>
                : undefined;
              return (
                <FileRow
                  key={key}
                  name={f.fileName}
                  meta={`${formatSize(f.fileSize)} · ${(f.fileName.split('.').pop() || '').toUpperCase()}`}
                  thumb={thumb}
                  onOpen={canPreview(f) ? () => setLightbox(i) : undefined}
                  actions={
                    <>
                      {shareCapable && (
                        <Btn size="icon" onClick={() => download(f, 'share')} aria-label={`Bagikan ${f.fileName}`} disabled={busyFile !== null}>
                          <ShareIcon size={16} />
                        </Btn>
                      )}
                      <Btn size="icon" onClick={() => download(f)} aria-label={`Unduh ${f.fileName}`} disabled={busyFile !== null}>
                        {busyFile === f.fileName ? <span className="spin" style={{ width: 15, height: 15, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%' }} /> : <DownloadIcon size={16} />}
                      </Btn>
                    </>
                  }
                />
              );
            })}
          </div>
        )}

        {(draft || decryptedText || session?.textContent) && (
          <>
            <div className="sechead">
              <h4 className="sech">Pesan</h4>
              <div className="row" style={{ gap: 6 }}>
                {!editing && <Btn size="sm" variant="white" onClick={() => { setDraft(draft || decryptedText || session?.textContent || ''); setEditing(true); }}><EditIcon size={13} /> Edit</Btn>}
                <Copied show={copied} />
                {!copied && !editing && <Btn size="sm" variant="white" onClick={copyText}><CopyGlyph size={13} /> Salin</Btn>}
              </div>
            </div>

            {editing ? (
              <div className="card pad editor">
                <div className="sechead">
                  <span className="row" style={{ gap: 8 }}>
                    <span style={{ fontWeight: 650, fontSize: 16 }}>Pesan dari pengirim</span>
                    <span className="badge n">bisa diedit</span>
                  </span>
                  {savedFlash && <span className="saveflash"><CheckIcon size={13} /> Tersimpan</span>}
                </div>
                <textarea className="inp" value={draft} onChange={(e) => setDraft(e.target.value)} />
                <div className="ednote"><LockIcon size={14} /> Disimpan di perangkat ini saja · tidak dikirim balik ke server</div>
                <div className="row" style={{ gap: 8 }}>
                  <Btn size="sm" variant="white" style={{ flex: 1 }} onClick={() => setEditing(false)}>Batal</Btn>
                  <Btn size="sm" style={{ flex: 1 }} onClick={saveDraft}><CheckIcon size={14} /> Simpan perubahan</Btn>
                </div>
              </div>
            ) : (
              <div className="msg">{draft || decryptedText || session?.textContent}</div>
            )}
          </>
        )}
      </main>

      <div className="dock">
        <div className="sum">
          <span>Sesi berakhir dalam <b className="num">{secondsLeft === null ? '—' : `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`}</b></span>
          <span className="muted">otomatis dihapus</span>
        </div>
        <Btn variant="white" block onClick={() => { window.location.href = '/'; }}>
          <ShieldIcon size={16} /> File tetap di perangkat saya
        </Btn>
      </div>

      {lbFile && (
        <div className="lb" role="dialog" aria-modal="true" aria-label={lbFile.fileName}>
          <div className="lb-top">
            <Btn size="icon" onClick={() => setLightbox(null)} aria-label="Tutup pratinjau"><BackIcon size={17} /></Btn>
            <span className="t">{lbFile.fileName}</span>
            <span className="spacer" />
            <span className="badge n">{formatSize(lbFile.fileSize)}</span>
          </div>
          <div className="lb-stage">
            <img src={previews[keyOf(lbFile)]} alt={lbFile.fileName} />
          </div>
          <div className="lb-nav">
            <Btn size="icon" variant="ghost" onClick={() => setLightbox((v) => Math.max(0, (v ?? 0) - 1))} disabled={lightbox === 0} aria-label="File sebelumnya"><PrevIcon size={16} /></Btn>
            {/* Long lists would overflow a 390px nav bar, so window the dots. */}
            <span className="dots" aria-hidden="true">
              {dotWindow(files.length, lightbox ?? 0).map((i) => (
                <i key={i} className={i === lightbox ? 'on' : ''} />
              ))}
            </span>
            <Btn size="icon" variant="ghost" onClick={() => setLightbox((v) => Math.min(files.length - 1, (v ?? 0) + 1))} disabled={lightbox === files.length - 1} aria-label="File berikutnya"><NextIcon size={16} /></Btn>
            <span className="num">{(lightbox ?? 0) + 1} / {files.length}</span>
          </div>
          <div className="lb-foot">
            <p className="tiny" style={{ color: 'rgba(255,255,255,.6)', textAlign: 'center', margin: 0 }}>
              Cubit-ganda untuk zoom · geser untuk pindah area
            </p>
            <div className="row" style={{ gap: 8 }}>
              {shareCapable && <Btn variant="white" style={{ flex: 1 }} onClick={() => download(lbFile, 'share')}><ShareIcon size={15} /> Bagikan</Btn>}
              <Btn variant="yellow" style={{ flex: 1 }} onClick={() => { download(lbFile); setLightbox(null); }}><DownloadIcon size={15} /> Unduh</Btn>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
