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
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 text-center">
       <div className="w-16 h-16 border-4 border-black border-t-neo-green animate-spin mb-4" />
       <p className="text-sm font-black uppercase tracking-widest text-black">Mendekripsi Paket...</p>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 text-center">
      <h1 className="text-9xl font-black mb-4 text-black drop-shadow-[8px_8px_0px_rgba(236,72,153,1)]">404</h1>
      <p className="text-xl font-bold text-black max-w-sm mb-8">{error}</p>
      <button onClick={() => window.location.href = '/'} className="neo-btn bg-black text-white px-8 py-4">
        Kembali ke Beranda
      </button>
    </div>
  );

  if (isLocked) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
        <form onSubmit={handleUnlock} className="neo-card max-w-sm w-full text-center p-8 flex flex-col items-center bg-neo-yellow">
           <div className="w-20 h-20 bg-white border-4 border-black shadow-neo flex items-center justify-center mb-6 rotate-3">
             <LockIcon />
           </div>
           <h2 className="text-3xl font-black uppercase mb-2">Akses Diamankan</h2>
           <p className="text-sm font-bold text-black mb-8 leading-tight">Sesi ini diproteksi oleh PIN. Masukkan PIN 4 angka untuk membuka data.</p>
           <input type="password" value={enteredPin} onChange={(e) => setEnteredPin(e.target.value)} placeholder="0 0 0 0" className="neo-input text-center text-4xl tracking-[0.5em] font-black mb-8" autoFocus />
           <button type="submit" className="w-full neo-btn bg-black text-white py-4 text-xl">Verifikasi Akses</button>
        </form>
      </div>
    );
  }

  if (isEncrypted && !isDecrypted) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
        <form onSubmit={handleDecrypt} className="neo-card max-w-sm w-full text-center p-8 flex flex-col items-center bg-neo-blue">
           <div className="mb-6"><Logo size={64} /></div>
           <h2 className="text-3xl font-black uppercase mb-2">Enkripsi E2EE</h2>
           <p className="text-sm font-bold text-black mb-8 leading-tight">Data ini dienkripsi. Masukkan kunci rahasia (Secret Key) dari pengirim untuk mendekripsi file secara lokal.</p>
           <input 
              value={secretKey} 
              onChange={(e) => setSecretKey(e.target.value)} 
              placeholder="SECRET KEY..." 
              className="neo-input text-center text-lg font-black uppercase mb-8"
              autoFocus
           />
           <button type="submit" className="w-full neo-btn bg-black text-white py-4 text-xl">Dekripsi Lokal</button>
           <p className="mt-8 text-[10px] font-black uppercase tracking-widest text-black/40">Privasi Mutlak. Kunci rahasia tidak pernah meninggalkan perangkat Anda.</p>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-black font-sans flex flex-col relative overflow-hidden">
      {/* BACKGROUND DECO */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, black 1px, transparent 0)', backgroundSize: '24px 24px' }}></div>
      
      <nav className="relative z-10 px-8 py-8 flex justify-between items-center max-w-6xl mx-auto w-full mb-8 sm:mb-12">
        <button onClick={() => window.location.href = '/'} className="flex items-center gap-4 hover:rotate-3 transition-transform">
          <Logo size={32} />
          <h1 className="text-2xl font-black uppercase tracking-tighter">RafQR Bridge</h1>
        </button>
        <div className="flex items-center gap-3 bg-black text-white px-6 py-2 border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
           {isEncrypted && <div className="w-3 h-3 bg-neo-green border border-white" title="E2EE Secured" />}
           <div className="text-xs font-black uppercase tracking-widest">{isEncrypted ? 'Secured' : 'Public'}</div>
        </div>
      </nav>

      <main className="flex-1 max-w-5xl mx-auto w-full px-6 space-y-12 animate-fade-in pb-32">
        {session?.ghost && (
           <div className="bg-neo-pink border-4 border-black p-6 mb-12 shadow-neo flex items-start gap-4 rotate-1">
              <svg className="w-10 h-10 text-white shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              <div className="text-white">
                 <h4 className="font-black text-xl uppercase mb-1">DATA AKAN SEGERA HANCUR (GHOST MODE)</h4>
                 <p className="text-sm font-bold opacity-90">Ini adalah akses terakhir. Data telah dihapus permanen dari server kami. Simpan sekarang atau hilang selamanya.</p>
              </div>
           </div>
        )}

        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-8 mb-16">
          <div className="relative">
            <div className="absolute -top-12 -left-8 text-8xl font-black text-neo-yellow/30 pointer-events-none select-none -z-10 tracking-tighter">DATA</div>
            <h2 className="text-5xl sm:text-7xl font-black uppercase tracking-tighter leading-none mb-4">Akses <span className="bg-neo-blue px-2">Terbuka</span></h2>
            <p className="text-lg font-bold text-black/60 uppercase tracking-widest italic">Paket transmisi aman diterima dengan baik.</p>
          </div>
          {session?.files && session.files.length > 0 && (
            <button onClick={downloadAllAsZip} disabled={isZipping} className={`neo-btn py-4 px-8 text-lg ${isZipping ? 'bg-gray-200 cursor-not-allowed shadow-none' : 'bg-neo-yellow text-black'}`}>
              <svg className="w-6 h-6 inline mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              {isZipping ? 'MENGOMPRES...' : 'UNDUH SEMUA (.ZIP)'}
            </button>
          )}
        </div>

        {session?.files && session.files.length > 0 && (
          <div className="space-y-6">
            <h3 className="flex items-center gap-3 text-sm font-black uppercase tracking-[0.2em] mb-4">
               <span className="w-4 h-4 bg-neo-green border-2 border-black"></span>
               Kumpulan File ({session.files.length})
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {session.files.map((file, i) => (
                <div key={i} className="neo-card p-0 flex flex-col bg-white overflow-hidden group">
                  <div className="p-6 flex-1">
                    <div className="flex justify-between items-center mb-6">
                       <div className="bg-black text-white p-2 border-2 border-black shadow-[3px_3px_0px_0px_rgba(163,230,53,1)]">
                          {getFileIcon(file.fileName.split('.').pop() || '')}
                       </div>
                       <span className="text-[10px] font-black uppercase bg-neo-yellow border-2 border-black px-2 py-0.5">{formatSize(file.fileSize)}</span>
                    </div>
                    <p className="text-lg font-black uppercase tracking-tight break-words leading-tight mb-4 group-hover:bg-neo-blue transition-colors line-clamp-2">{file.fileName}</p>
                    
                    {previews[file.fileName] ? (
                       <div className="mt-4 border-4 border-black bg-black shadow-neo-hover overflow-hidden">
                         {previews[file.fileName].type === 'image' && <img src={previews[file.fileName].url} className="w-full h-auto object-cover max-h-48" alt="Preview" />}
                         {previews[file.fileName].type === 'video' && <video src={previews[file.fileName].url} controls className="w-full max-h-48 bg-black" />}
                         {previews[file.fileName].type === 'audio' && <audio src={previews[file.fileName].url} controls className="w-full mt-2" />}
                         {previews[file.fileName].type === 'unknown' && <div className="p-8 text-center text-xs font-black text-white uppercase">Preview Tidak Didukung</div>}
                       </div>
                    ) : (
                       <div className="mt-4">
                         {['png','jpg','jpeg','gif','webp','mp4','webm','mp3','wav'].includes(file.fileName.split('.').pop()?.toLowerCase() || '') && (
                           <button onClick={() => previewFile(file.firebaseUrl, file.fileName)} disabled={loadingPreview === file.fileName} className="text-[10px] font-black uppercase bg-white border-2 border-black px-3 py-1.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-neo-blue hover:text-white transition-all flex items-center gap-2">
                              {loadingPreview === file.fileName ? (
                                <span className="animate-pulse">DECRYPTING...</span>
                              ) : 'PRATINJAU LANGSUNG'}
                           </button>
                         )}
                       </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 border-t-4 border-black">
                     <button onClick={() => downloadFile(file.firebaseUrl, file.fileName, false)} className="py-4 text-xs font-black uppercase bg-white hover:bg-neo-green transition-colors border-r-4 border-black flex items-center justify-center gap-2">
                       {currentFileDownload === file.fileName ? (
                          <span className="animate-pulse">PROCESSING...</span>
                       ) : (
                          <>
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                            SIMPAN
                          </>
                       )}
                     </button>
                     <button onClick={() => downloadFile(file.firebaseUrl, file.fileName, true)} className="py-4 text-xs font-black uppercase bg-white hover:bg-neo-pink hover:text-white transition-colors flex items-center justify-center gap-2">
                       <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                       KIRIM
                     </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {(decryptedText || session?.textContent) && (
          <div className="space-y-6 pt-12">
            <div className="flex justify-between items-end mb-4">
               <h3 className="flex items-center gap-3 text-sm font-black uppercase tracking-[0.2em]">
                  <span className="w-4 h-4 bg-neo-yellow border-2 border-black"></span>
                  Pesan Transmisi
               </h3>
               <button onClick={copyText} className="text-xs font-black uppercase bg-black text-white px-4 py-2 hover:bg-neo-blue transition-colors">
                 {copied ? 'BERHASIL' : 'SALIN TEKS'}
               </button>
            </div>
            <div className="neo-card p-8 sm:p-12 text-xl font-bold leading-relaxed bg-white border-4 border-black whitespace-pre-wrap">
              {decryptedText || session?.textContent}
            </div>
          </div>
        )}
      </main>

      <footer className="w-full relative z-10 py-12 text-center mt-auto border-t-4 border-black bg-neo-yellow/10">
         <div className="flex flex-col sm:flex-row items-center justify-center gap-8">
           <p className="flex items-center gap-3 font-black uppercase text-[10px] tracking-widest">
             <svg className="w-5 h-5 text-neo-green" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg> 
             Didekripsi Lokal
           </p>
           <button onClick={() => window.location.href = '/'} className="neo-btn bg-black text-white px-6 py-2 text-[10px] font-black uppercase">
             Tutup & Sesi Baru
           </button>
         </div>
      </footer>
    </div>
  );
}
