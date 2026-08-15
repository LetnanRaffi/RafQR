'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Logo } from '../../../components/Logo';
import { decryptData } from '../../../lib/crypto';
import { toast } from '../../../components/toast';
import { formatSize } from '../../../lib/format';
import { PageShell, SiteHeader } from '../../../components/ui';
import {
  getFileIcon, DownloadIcon, ShareIcon, WarningIcon, CheckShieldIcon,
} from '../../../components/icons';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

interface SessionFile {
  fileName: string;
  fileSize: number;
  fileType: string;
  firebaseUrl: string;
}

interface FileSession {
  files?: SessionFile[];
  textContent?: string;
  createdAt: number;
  totalSize: number;
  fileCount: number;
  pin?: string;
  ghost?: boolean;
  e2ee?: boolean; // v3.5 flag
}

const LockIcon = () => (<svg className="w-10 h-10" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>);

export default function DownloadPage() {
  const { id } = useParams();
  const [session, setSession] = useState<FileSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [enteredPin, setEnteredPin] = useState('');

  // v3.5 E2EE
  const [isEncrypted, setIsEncrypted] = useState(false);
  const [secretKey, setSecretKey] = useState('');
  const [isDecrypted, setIsDecrypted] = useState(false);

  // v3.6 Preview
  const [previews, setPreviews] = useState<Record<string, { url: string, type: string }>>({});
  const [loadingPreview, setLoadingPreview] = useState<string | null>(null);
  const [decryptedText, setDecryptedText] = useState<string | null>(null);
  const [decryptedFiles, setDecryptedFiles] = useState<Record<string, Blob>>({});

  const [isNotified, setIsNotified] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [currentFileDownload, setCurrentFileDownload] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/session?id=${id}`)
      .then((res) => {
        if (!res.ok) throw new Error('Data tidak ditemukan atau sudah kedaluwarsa.');
        return res.json();
      })
      .then((result) => {
        setSession(result.data);
        if (result.data.locked) setIsLocked(true);
        if (result.data.e2ee) setIsEncrypted(true);
        setLoading(false);
        if (!result.data.locked && !result.data.e2ee) notifyPC();
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [id]);

  useEffect(() => {
    if (session?.files && !isLocked && (!isEncrypted || isDecrypted)) {
       session.files.forEach(file => {
          const ext = file.fileName.split('.').pop()?.toLowerCase() || '';
          if (['png','jpg','jpeg','gif','webp','svg'].includes(ext) && !previews[file.fileName]) {
             previewFile(file.firebaseUrl, file.fileName);
          }
       });
    }
  }, [session, isLocked, isEncrypted, isDecrypted]);

  const notifyPC = async () => {
    if (isNotified) return;
    try {
      await fetch(`/api/session?id=${id}`, { method: 'PATCH' });
      setIsNotified(true);
    } catch (e) {}
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/session/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, pin: enteredPin }),
      });
      if (!res.ok) {
        toast('PIN salah, coba lagi.', 'error');
        return;
      }
      const result = await res.json();
      // Merge the now-unlocked payload (files/text) into session.
      setSession((prev) => ({ ...(prev as FileSession), ...result.data }));
      setIsLocked(false);
      if (result.data.e2ee) setIsEncrypted(true);
      else notifyPC();
    } catch {
      toast('Gagal memverifikasi PIN.', 'error');
    }
  };

  const handleDecrypt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (secretKey.length < 8) {
      toast('Kunci minimal 8 karakter.', 'error');
      return;
    }
    setLoading(true);
    try {
      // Decrypt Text
      if (session?.textContent) {
        // Encypted text was a Data URL (Blob base64)
        const textRes = await fetch(session.textContent);
        const textBlob = await textRes.blob();
        const dec = await decryptData(textBlob, secretKey);
        // dec is a blob
        const reader = new FileReader();
        const dText = await new Promise<string>((resolve) => {
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsText(dec as Blob);
        });
        setDecryptedText(dText);
      }
      setIsDecrypted(true);
      notifyPC();
      toast('Dekripsi berhasil.', 'success');
    } catch (err: any) {
      toast(err.message || 'Gagal mendekripsi. Kunci salah?', 'error');
    } finally {
      setLoading(false);
    }
  };

  const downloadFile = async (url: string, name: string, shareMode: boolean = false) => {
    setCurrentFileDownload(name);
    try {
       const res = await fetch(url);
       let blob = await res.blob();

       if (session?.e2ee) {
          const dec = await decryptData(blob, secretKey);
          blob = dec as Blob;
       }

       if (shareMode && navigator.canShare) {
          const file = new File([blob], name, { type: blob.type || 'application/octet-stream' });
          if (navigator.canShare({ files: [file] })) {
             await navigator.share({
               files: [file],
               title: name,
               text: 'File dari RafQR'
             });
             return;
          }
       }
       saveAs(blob, name);
       toast(`"${name}" berhasil diunduh.`, 'success');
    } catch (err) {
       toast('Gagal memproses file. Pastikan kunci benar atau berbagi tidak dibatalkan.', 'error');
    } finally {
       setCurrentFileDownload(null);
    }
  };

  const previewFile = async (url: string, name: string) => {
    setLoadingPreview(name);
    try {
       const res = await fetch(url);
       let blob = await res.blob();
       if (session?.e2ee) {
          const dec = await decryptData(blob, secretKey);
          blob = dec as Blob;
       }
       const blobUrl = URL.createObjectURL(blob);

       const ex = name.split('.').pop()?.toLowerCase();
       let type = 'unknown';
       if (['png','jpg','jpeg','gif','webp','svg'].includes(ex || '')) type = 'image';
       else if (['mp4','webm','mov'].includes(ex || '')) type = 'video';
       else if (['mp3','wav','ogg'].includes(ex || '')) type = 'audio';

       setPreviews(p => ({ ...p, [name]: { url: blobUrl, type } }));
    } catch (err) {
       toast('Gagal memuat pratinjau.', 'error');
    } finally {
       setLoadingPreview(null);
    }
  };

  const downloadAllAsZip = async () => {
    if (!session?.files || session.files.length === 0) return;
    setIsZipping(true);
    const zip = new JSZip();
    try {
      for (const f of session.files) {
        const res = await fetch(f.firebaseUrl);
        let blob = await res.blob();
        if (session.e2ee) {
           const dec = await decryptData(blob, secretKey);
           blob = dec as Blob;
        }
        zip.file(f.fileName, blob);
      }
      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, `rafqr_${id}.zip`);
      toast('Paket ZIP berhasil diunduh.', 'success');
    } catch (err) {
      toast('Gagal memaketkan ZIP.', 'error');
    } finally {
      setIsZipping(false);
    }
  };

  const copyText = async () => {
    const text = decryptedText || session?.textContent;
    if (!text) return;
    try { await navigator.clipboard.writeText(text); } catch (err) {
      const t = document.createElement("textarea"); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); document.body.removeChild(t);
    }
    setCopied(true);
    toast('Teks berhasil disalin.', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) return (
    <div className="min-h-screen bg-paper flex flex-col items-center justify-center p-6 text-center">
       <div className="w-12 h-12 border-3 border-ink border-t-accent animate-spin rounded-full mb-4" />
       <p className="text-sm font-bold neo-mono text-muted">Memuat paket…</p>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-paper flex flex-col items-center justify-center p-6 text-center">
      <h1 className="text-7xl sm:text-8xl font-extrabold mb-4 tracking-tight">404</h1>
      <p className="text-lg font-medium text-muted max-w-sm mb-8">{error}</p>
      <button onClick={() => window.location.href = '/'} className="neo-btn bg-ink text-white px-8 py-3.5">
        Kembali ke beranda
      </button>
    </div>
  );

  if (isLocked) {
    return (
      <div className="min-h-screen bg-paper flex flex-col items-center justify-center p-6">
        <form onSubmit={handleUnlock} className="neo-card max-w-sm w-full text-center p-8 flex flex-col items-center">
           <span className="w-16 h-16 bg-accent border-2 border-ink rounded-lg shadow-neo flex items-center justify-center mb-5"><LockIcon /></span>
           <h2 className="text-2xl font-extrabold tracking-tight mb-2">Terkunci PIN</h2>
           <p className="text-sm font-medium text-muted mb-6">Masukkan PIN 4 angka untuk membuka data.</p>
           <input type="password" value={enteredPin} onChange={(e) => setEnteredPin(e.target.value)} placeholder="••••" className="neo-input neo-mono text-center text-3xl tracking-[0.4em] mb-6" autoFocus />
           <button type="submit" className="w-full neo-btn bg-ink text-white py-3.5 text-base hover:bg-accent hover:text-ink">Buka</button>
        </form>
      </div>
    );
  }

  if (isEncrypted && !isDecrypted) {
    return (
      <div className="min-h-screen bg-paper flex flex-col items-center justify-center p-6">
        <form onSubmit={handleDecrypt} className="neo-card max-w-sm w-full text-center p-8 flex flex-col items-center">
           <span className="mb-5"><Logo size={56} /></span>
           <h2 className="text-2xl font-extrabold tracking-tight mb-2">Terenkripsi E2EE</h2>
           <p className="text-sm font-medium text-muted mb-6">Masukkan kunci rahasia dari pengirim. Dekripsi berjalan lokal di perangkat ini.</p>
           <input
              value={secretKey}
              onChange={(e) => setSecretKey(e.target.value)}
              placeholder="Kunci rahasia…"
              className="neo-input neo-mono text-center text-base mb-6"
              autoFocus
           />
           <button type="submit" className="w-full neo-btn bg-ink text-white py-3.5 text-base hover:bg-accent hover:text-ink">Dekripsi</button>
           <p className="mt-5 text-[11px] font-medium text-muted">Kunci tidak pernah meninggalkan perangkat Anda.</p>
        </form>
      </div>
    );
  }

  return (
    <PageShell>
      <SiteHeader
        onLogoClick={() => (window.location.href = '/')}
        label="RafQR"
        right={
          <span className="flex items-center gap-2 bg-ink text-white px-4 py-2 rounded-md text-xs font-bold neo-mono">
            {isEncrypted && <span className="w-2 h-2 bg-accent rounded-full" title="E2EE" />}
            {isEncrypted ? 'Secured' : 'Public'}
          </span>
        }
      />

      <main className="flex-1 max-w-4xl mx-auto w-full px-5 py-10 space-y-10 animate-fade-in pb-24">
        {session?.ghost && (
           <div className="bg-danger border-2 border-ink rounded-lg p-5 flex items-start gap-3 text-white shadow-neo">
              <WarningIcon className="w-8 h-8 shrink-0" />
              <div>
                 <h4 className="font-bold text-base mb-0.5">Akses terakhir (mode auto-hapus)</h4>
                 <p className="text-sm font-medium opacity-90">Data telah dihapus dari server. Simpan sekarang atau hilang selamanya.</p>
              </div>
           </div>
        )}

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
          <div>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Paket diterima</h2>
            <p className="text-sm font-medium text-muted mt-1">Transmisi aman diterima dengan baik.</p>
          </div>
          {session?.files && session.files.length > 0 && (
            <button onClick={downloadAllAsZip} disabled={isZipping} className={`neo-btn py-3 px-6 ${isZipping ? 'bg-paper cursor-not-allowed shadow-none' : 'bg-accent'}`}>
              <DownloadIcon className="w-4 h-4" />
              {isZipping ? 'Mengompres…' : 'Unduh semua (.zip)'}
            </button>
          )}
        </div>

        {session?.files && session.files.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-muted uppercase tracking-widest">
               File ({session.files.length})
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {session.files.map((file, i) => (
                <div key={i} className="neo-card p-0 flex flex-col overflow-hidden">
                  <div className="p-5 flex-1">
                    <div className="flex justify-between items-center mb-4">
                       <span className="bg-ink text-accent p-2 rounded-md">
                          {getFileIcon(file.fileName.split('.').pop() || '')}
                       </span>
                       <span className="neo-mono text-[11px] font-bold bg-accent/30 rounded px-2 py-0.5">{formatSize(file.fileSize)}</span>
                    </div>
                    <p className="text-sm font-bold break-words leading-tight mb-3 line-clamp-2">{file.fileName}</p>

                    {previews[file.fileName] ? (
                       <div className="mt-3 border-2 border-ink rounded-md bg-ink overflow-hidden">
                         {previews[file.fileName].type === 'image' && <img src={previews[file.fileName].url} className="w-full h-auto object-cover max-h-48" alt="Pratinjau" />}
                         {previews[file.fileName].type === 'video' && <video src={previews[file.fileName].url} controls className="w-full max-h-48 bg-black" />}
                         {previews[file.fileName].type === 'audio' && <audio src={previews[file.fileName].url} controls className="w-full" />}
                         {previews[file.fileName].type === 'unknown' && <div className="p-6 text-center text-xs font-bold text-white">Pratinjau tidak didukung</div>}
                       </div>
                    ) : (
                       <div className="mt-3">
                         {['png','jpg','jpeg','gif','webp','mp4','webm','mp3','wav'].includes(file.fileName.split('.').pop()?.toLowerCase() || '') && (
                           <button onClick={() => previewFile(file.firebaseUrl, file.fileName)} disabled={loadingPreview === file.fileName} className="text-[11px] font-bold bg-white border-2 border-ink rounded px-3 py-1.5 shadow-neo-hover hover:bg-accent transition-all">
                              {loadingPreview === file.fileName ? 'Memuat…' : 'Pratinjau'}
                           </button>
                         )}
                       </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 border-t-2 border-ink">
                     <button onClick={() => downloadFile(file.firebaseUrl, file.fileName, false)} className="py-3.5 text-xs font-bold bg-white hover:bg-accent transition-colors border-r-2 border-ink flex items-center justify-center gap-2">
                       {currentFileDownload === file.fileName ? 'Memproses…' : (<><DownloadIcon className="w-4 h-4" /> Simpan</>)}
                     </button>
                     <button onClick={() => downloadFile(file.firebaseUrl, file.fileName, true)} className="py-3.5 text-xs font-bold bg-white hover:bg-accent transition-colors flex items-center justify-center gap-2">
                       <ShareIcon className="w-4 h-4" /> Bagikan
                     </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {(decryptedText || session?.textContent) && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
               <h3 className="text-xs font-bold text-muted uppercase tracking-widest">Pesan</h3>
               <button onClick={copyText} className="text-xs font-bold bg-ink text-white rounded px-4 py-2 hover:bg-accent hover:text-ink transition-colors">
                 {copied ? 'Tersalin' : 'Salin teks'}
               </button>
            </div>
            <div className="neo-card p-6 sm:p-8 text-base font-medium leading-relaxed whitespace-pre-wrap">
              {decryptedText || session?.textContent}
            </div>
          </div>
        )}
      </main>

      <footer className="w-full relative z-10 py-8 border-t-2 border-ink bg-white mt-auto">
         <div className="max-w-4xl mx-auto px-5 flex flex-col sm:flex-row items-center justify-between gap-4">
           <p className="flex items-center gap-2 text-xs font-medium text-muted">
             <CheckShieldIcon className="w-4 h-4 text-ok" /> Didekripsi lokal
           </p>
           <button onClick={() => window.location.href = '/'} className="neo-btn bg-ink text-white px-5 py-2 text-xs">
             Sesi baru
           </button>
         </div>
      </footer>
    </PageShell>
  );
}
