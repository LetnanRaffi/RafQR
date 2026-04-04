'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Logo } from '../../../components/Logo';
import { decryptData } from '../../../lib/crypto';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

const getFileIcon = (ext: string) => {
  const ex = ext.toLowerCase();
  if (['png','jpg','jpeg','gif','svg','webp'].includes(ex)) return <svg className="w-5 h-5 text-pink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>;
  if (['mp3','wav','ogg','webm'].includes(ex)) return <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg>;
  if (['mp4','mov','avi','mkv'].includes(ex)) return <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>;
  if (['zip','rar','tar','gz','7z'].includes(ex)) return <svg className="w-5 h-5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>;
  if (['pdf','doc','docx','txt'].includes(ex)) return <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>;
  return <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>;
};

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

const formatSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const LockIcon = () => (<svg className="w-12 h-12 opacity-20 mb-6" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>);

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
        if (!res.ok) throw new Error('Data tidak ditemukan atau sudah kadaluarsa.');
        return res.json();
      })
      .then((result) => {
        setSession(result.data);
        if (result.data.pin) setIsLocked(true);
        if (result.data.e2ee) setIsEncrypted(true);
        setLoading(false);
        if (!result.data.pin && !result.data.e2ee) notifyPC();
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [id]);

  const notifyPC = async () => {
    if (isNotified) return;
    try {
      await fetch(`/api/session?id=${id}`, { method: 'PATCH' });
      setIsNotified(true);
    } catch (e) {}
  };

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (enteredPin === session?.pin) {
      setIsLocked(false);
      if (!session?.e2ee) notifyPC();
    } else {
      alert('PIN Salah!');
    }
  };

  const handleDecrypt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (secretKey.length < 6) return alert('Secret key minimal 6 karakter.');
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
    } catch (err: any) {
      alert(err.message || "Gagal mendekripsi data. Password salah?");
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
               text: 'Menerima file terenkripsi dari RafQR Bridge'
             });
             return;
          }
       }
       saveAs(blob, name);
    } catch (err) {
       alert("Gagal mengolah file. Pastikan Secret Key benar atau izin membagikan dibatalkan.");
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
       alert("Gagal memuat preview data.");
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
      saveAs(content, `rafqr_decrypted_${id}.zip`);
    } catch (err) {
      alert('Gagal mendekripsi atau memaketkan ZIP.');
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
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  if (loading) return (
    <div className="min-h-screen bg-transparent text-white flex items-center justify-center font-semibold text-sm tracking-widest uppercase animate-pulse">
      Mendekripsi Paket...
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-transparent text-white flex flex-col items-center justify-center p-6 text-center animate-fade-in">
      <h1 className="text-8xl font-bold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-pink-500">404</h1>
      <p className="text-sm font-medium text-gray-400 max-w-sm mb-8">{error}</p>
      <button onClick={() => window.location.href = '/'} className="px-6 py-3 bg-white/5 hover:bg-white/10 rounded-xl font-medium transition-colors border border-white/10">
        Kembali ke Beranda
      </button>
    </div>
  );

  if (isLocked) {
    return (
      <div className="min-h-screen bg-transparent text-white flex flex-col items-center justify-center p-6">
        <form onSubmit={handleUnlock} className="glass-panel max-w-sm w-full text-center animate-slide-down p-8 flex flex-col items-center">
           <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-6">
             <LockIcon />
           </div>
           <h2 className="text-2xl font-bold mb-2">Akses Diamankan</h2>
           <p className="text-sm text-gray-400 mb-8">Sesi ini diproteksi oleh PIN. Masukkan PIN 4 angka untuk membuka data.</p>
           <input type="password" value={enteredPin} onChange={(e) => setEnteredPin(e.target.value)} placeholder="0 0 0 0" className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-center text-3xl font-mono tracking-[0.5em] focus:outline-none focus:border-indigo-500/50 transition-all mb-6" autoFocus />
           <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-xl shadow-[0_0_30px_-10px_rgba(79,70,229,0.5)] transition-all">Verifikasi Akses</button>
        </form>
      </div>
    );
  }

  if (isEncrypted && !isDecrypted) {
    return (
      <div className="min-h-screen bg-transparent text-white flex flex-col items-center justify-center p-6">
        <form onSubmit={handleDecrypt} className="glass-panel max-w-sm w-full text-center animate-slide-down p-8 flex flex-col items-center">
           <div className="mb-6"><Logo size={48} /></div>
           <h2 className="text-2xl font-bold mb-2">Enkripsi End-to-End</h2>
           <p className="text-sm text-gray-400 mb-8">Data ini dienkripsi. Masukkan kunci rahasia (Secret Key) dari pengirim untuk mendekripsi file secara lokal.</p>
           <input 
              value={secretKey} 
              onChange={(e) => setSecretKey(e.target.value)} 
              placeholder="Kata Sandi / Kunci Rahasia..." 
              className="w-full bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-4 text-center text-lg font-mono focus:outline-none focus:border-indigo-500 transition-all mb-6"
              autoFocus
           />
           <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-xl shadow-[0_0_30px_-10px_rgba(79,70,229,0.5)] transition-all">Dekripsi Lokal</button>
           <p className="mt-6 text-xs text-indigo-400/60 font-medium tracking-wide">Privasi terjamin. Kami tidak pernah menerima atau menyimpan kunci Anda di server.</p>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent text-white selection:bg-indigo-500/30 selection:text-white font-sans flex flex-col">
      <nav className="relative z-10 px-8 py-6 flex justify-between items-center max-w-5xl mx-auto w-full animate-slide-down mb-8 sm:mb-16">
        <button onClick={() => window.location.href = '/'} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <Logo size={24} />
          <h1 className="text-lg font-bold tracking-tight">RafQR</h1>
        </button>
        <div className="flex items-center gap-3 bg-white/5 rounded-full px-4 py-1.5 border border-white/10">
           {isEncrypted && <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="E2EE Secured" />}
           <div className="text-xs font-semibold text-gray-400 tracking-wider">v3.5</div>
        </div>
      </nav>

      <main className="flex-1 max-w-5xl mx-auto w-full px-6 space-y-12 animate-fade-in pb-32">
        {session?.ghost && (
           <div className="bg-red-500/10 border-2 border-red-500/30 rounded-2xl p-6 mb-8 text-red-200 animate-pulse shadow-[0_0_40px_rgba(239,68,68,0.2)] flex items-start gap-4">
              <svg className="w-8 h-8 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              <div>
                 <h4 className="font-bold text-lg text-red-400 mb-1">MODE GHOST AKTIF (SELF-DESTRUCT)</h4>
                 <p className="text-sm">Server mendeteksi bahwa ini adalah akses pertama sekaligus terakhir. Bukti dan jejak data ini sudah <strong>dibakar dan dihapus sepenuhnya dari server pusat</strong> secara otomatis. Simpan data ini sekarang sebelum Anda menutup halaman.</p>
              </div>
           </div>
        )}

        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-12">
          <div>
            <h2 className="text-4xl sm:text-6xl font-bold tracking-tight mb-4">Akses <span className="text-indigo-400">Terbuka</span></h2>
            <p className="text-sm text-gray-400">Transmisi aman Anda telah berhasil diterima.</p>
          </div>
          {session?.files && session.files.length > 0 && (
            <button onClick={downloadAllAsZip} disabled={isZipping} className={`whitespace-nowrap px-6 py-3 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${isZipping ? 'bg-white/10 text-gray-400 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-[0_0_40px_-10px_rgba(79,70,229,0.5)]'}`}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              {isZipping ? 'Proses Zip...' : 'Download Semua (.ZIP)'}
            </button>
          )}
        </div>

        {session?.files && session.files.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest pl-2">Kumpulan File Tersimpan ({session.files.length})</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {session.files.map((file, i) => (
                <div key={i} className="p-6 glass-panel flex flex-col justify-between group rounded-2xl hover:bg-white/[0.05] transition-colors">
                  <div className="mb-4">
                    <div className="flex justify-between items-center mb-4 text-xs font-mono text-gray-400">
                       <div className="flex items-center gap-2 bg-white/5 py-1 px-3 rounded-lg border border-white/10">
                          {getFileIcon(file.fileName.split('.').pop() || '')}
                          <span className="uppercase font-bold tracking-wider">{file.fileName.split('.').pop()}</span>
                       </div>
                       <span className="font-semibold">{formatSize(file.fileSize)}</span>
                    </div>
                    <p className="text-base font-semibold group-hover:text-indigo-300 transition-colors break-words leading-snug">{file.fileName}</p>
                    
                    {previews[file.fileName] ? (
                       <div className="mt-4 rounded-xl overflow-hidden bg-black/40 border border-white/10">
                         {previews[file.fileName].type === 'image' && <img src={previews[file.fileName].url} className="w-full h-auto object-cover max-h-48" alt="Preview" />}
                         {previews[file.fileName].type === 'video' && <video src={previews[file.fileName].url} controls className="w-full max-h-48 bg-black" />}
                         {previews[file.fileName].type === 'audio' && <audio src={previews[file.fileName].url} controls className="w-full mt-2" />}
                         {previews[file.fileName].type === 'unknown' && <div className="p-4 text-center text-xs text-gray-500">Preview format tidak didukung browser.</div>}
                       </div>
                    ) : (
                       <div className="mt-4">
                         {['png','jpg','jpeg','gif','webp','mp4','webm','mp3','wav'].includes(file.fileName.split('.').pop()?.toLowerCase() || '') && (
                           <button onClick={() => previewFile(file.firebaseUrl, file.fileName)} disabled={loadingPreview === file.fileName} className="text-xs bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 px-3 py-1.5 rounded-lg border border-indigo-500/20 transition-all font-semibold flex items-center gap-1.5">
                              {loadingPreview === file.fileName ? (
                                <>
                                  <svg className="animate-spin w-3 h-3 text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                  Mendekripsi...
                                </>
                              ) : 'Pratinjau Langsung'}
                           </button>
                         )}
                       </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 w-full">
                     <button onClick={() => downloadFile(file.firebaseUrl, file.fileName, false)} className="w-full py-3 rounded-xl text-xs sm:text-sm font-bold bg-white/5 hover:bg-indigo-600 border border-white/10 hover:border-indigo-500 transition-all flex items-center justify-center gap-2">
                       {currentFileDownload === file.fileName ? (
                          <span className="animate-pulse">Memproses...</span>
                       ) : (
                          <>
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                            Simpan Ke Diska
                          </>
                       )}
                     </button>
                     <button onClick={() => downloadFile(file.firebaseUrl, file.fileName, true)} title="Bagikan langsung ke WA/Telegram" className="w-full py-3 rounded-xl text-xs sm:text-sm font-bold bg-emerald-500/10 hover:bg-emerald-600 text-emerald-400 hover:text-white border border-emerald-500/20 transition-all flex items-center justify-center gap-2">
                       <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                       Bagikan ke Aplikasi
                     </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {(decryptedText || session?.textContent) && (
          <div className="space-y-4 pt-4">
            <div className="flex justify-between items-end pl-2 pr-2">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Pesan Teks / Teks Rahasia</h3>
              <button onClick={copyText} className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1">
                {copied ? 'Berhasil Dicuplik' : 'Salin Teks'}
              </button>
            </div>
            <div className="glass-panel p-6 sm:p-10 text-base sm:text-lg font-medium leading-relaxed font-sans whitespace-pre-wrap rounded-2xl text-gray-200">
              {decryptedText || session?.textContent}
            </div>
          </div>
        )}
      </main>

      <footer className="w-full relative z-10 py-8 text-center text-xs font-medium text-gray-500 mt-auto">
         <div className="flex items-center justify-center gap-6">
           <p className="flex items-center gap-2"><svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg> Didekripsi Secara Lokal di Perangkat Anda</p>
           <span className="w-1 h-1 bg-gray-600 rounded-full" />
           <p onClick={() => window.location.href = '/'} className="cursor-pointer hover:text-gray-300 transition-colors">Tutup & Mulai Sesi Baru</p>
         </div>
      </footer>
    </div>
  );
}
