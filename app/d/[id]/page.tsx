'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Logo } from '../../../components/Logo';
import { decryptData } from '../../../lib/crypto';
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

  const downloadFile = async (url: string, name: string) => {
    setCurrentFileDownload(name);
    try {
       const res = await fetch(url);
       let blob = await res.blob();
       
       if (session?.e2ee) {
          const dec = await decryptData(blob, secretKey);
          blob = dec as Blob;
       }
       
       saveAs(blob, name);
    } catch (err) {
       alert("Gagal mengolah file. Pastikan Secret Key benar.");
    } finally {
       setCurrentFileDownload(null);
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

  if (loading) return <div className="min-h-screen bg-black text-white flex items-center justify-center font-black animate-pulse uppercase tracking-[0.2em]">DECRYPTING_PACKET...</div>;
  if (error) return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 text-center">
      <h1 className="text-6xl font-black mb-4">404</h1>
      <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-40">{error}</p>
      <button onClick={() => window.location.href = '/'} className="mt-12 text-[10px] font-black uppercase underline underline-offset-8 transition-opacity hover:opacity-100 italic">Back To Home</button>
    </div>
  );

  if (isLocked) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.05)_0,transparent_100%)]">
        <form onSubmit={handleUnlock} className="max-w-xs w-full text-center animate-fade-in-up">
           <div className="flex justify-center"><LockIcon /></div>
           <h2 className="text-xl font-black uppercase tracking-widest mb-2 italic">Secure Entry</h2>
           <p className="text-[10px] font-black uppercase tracking-widest opacity-20 mb-10">Masukkan PIN untuk membuka sesi.</p>
           <input type="password" value={enteredPin} onChange={(e) => setEnteredPin(e.target.value)} placeholder="_ _ _ _" className="w-full bg-white/5 border border-white/10 p-6 text-center text-4xl font-black tracking-widest focus:outline-none focus:border-white transition-all mb-4" autoFocus />
           <button type="submit" className="w-full bg-white text-black font-black uppercase py-4 tracking-widest hover:bg-white/90">Verify Identity</button>
        </form>
      </div>
    );
  }

  if (isEncrypted && !isDecrypted) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6">
        <form onSubmit={handleDecrypt} className="max-w-sm w-full text-center animate-fade-in-up">
           <div className="flex justify-center mb-8"><Logo size={48} /></div>
           <h2 className="text-2xl font-black uppercase tracking-tighter mb-2 italic">E2EE Locked</h2>
           <p className="text-[10px] font-black uppercase tracking-widest opacity-20 mb-12">Data ini dienkripsi. Masukkan Secret Key dari pengirim untuk mendekripsi data secara lokal.</p>
           <input 
              value={secretKey} 
              onChange={(e) => setSecretKey(e.target.value)} 
              placeholder="Enter Secret Key..." 
              className="w-full bg-white/5 border border-white/10 p-6 text-center text-xl font-black tracking-widest focus:outline-none focus:border-white transition-all mb-4 uppercase"
              autoFocus
           />
           <button type="submit" className="w-full bg-red-950 text-white border border-red-900 font-black uppercase py-5 tracking-widest hover:bg-red-900 transition-colors">Decrypt Data Locally</button>
           <p className="mt-4 text-[8px] font-black uppercase tracking-widest opacity-20 italic">Data tidak didekripsi di server kami. Keamanan terjamin.</p>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white selection:bg-white selection:text-black font-sans p-6 sm:p-12">
      <header className="flex justify-between items-center mb-16 max-w-5xl mx-auto">
        <div className="flex items-center gap-3">
          <Logo size={32} />
          <h1 className="text-xl font-black tracking-tighter uppercase italic">RafQR Data</h1>
        </div>
        <div className="flex items-center gap-4">
           {isEncrypted && <div className="px-3 py-1 bg-red-950 text-white text-[8px] font-black uppercase tracking-widest animate-pulse border border-red-900">E2EE Secured</div>}
           <div className="text-[9px] font-black uppercase tracking-[0.4em] opacity-30 pt-2 border-t border-white/5 italic">RAFQR_v3.5</div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto space-y-16 animate-fade-in">
        <div>
          <h2 className="text-5xl sm:text-7xl font-black uppercase tracking-tighter leading-[0.85] mb-6">Archive <br /><span className="opacity-20 italic">Unlocked</span></h2>
          <div className="h-0.5 w-12 bg-white/20" />
        </div>

        {session?.files && session.files.length > 0 && (
          <div className="space-y-6">
            <div className="flex justify-between items-end border-b border-white/5 pb-4">
              <h3 className="text-[10px] font-black uppercase tracking-[0.4em] opacity-40">Stored Files ({session.files.length})</h3>
              <button onClick={downloadAllAsZip} disabled={isZipping} className={`text-[10px] font-black uppercase tracking-widest px-6 py-3 transition-all ${isZipping ? 'bg-white/10 opacity-50' : 'bg-white text-black hover:bg-white/90'}`}>
                {isZipping ? 'Decrypting & Zipping...' : 'Download All (.ZIP)'}
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {session.files.map((file, i) => (
                <div key={i} className="p-8 border border-white/5 bg-white/[0.02] flex flex-col justify-between group">
                  <div>
                    <div className="flex justify-between items-start mb-4 opacity-20">
                       <p className="text-[8px] font-black uppercase tracking-widest">Type: {file.fileName.split('.').pop()}</p>
                       <p className="text-[8px] font-black uppercase tracking-widest">{formatSize(file.fileSize)}</p>
                    </div>
                    <p className="text-lg font-black uppercase truncate group-hover:text-white transition-colors tracking-tight">{file.fileName}</p>
                  </div>
                  <button onClick={() => downloadFile(file.firebaseUrl, file.fileName)} className="mt-12 text-[9px] font-black uppercase border border-white/10 py-4 text-center tracking-[0.3em] hover:bg-white hover:text-black transition-all">
                    {currentFileDownload === file.fileName ? 'Processing...' : 'Direct Download'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {(decryptedText || session?.textContent) && (
          <div className="space-y-6">
            <div className="flex justify-between items-end border-b border-white/5 pb-4">
              <h3 className="text-[10px] font-black uppercase tracking-[0.4em] opacity-40">Note Content</h3>
              <button onClick={copyText} className="text-[10px] font-black uppercase tracking-widest border border-white/10 px-4 py-2 hover:bg-white/5">{copied ? 'Copied' : 'Copy Content'}</button>
            </div>
            <div className="p-8 sm:p-12 border border-white/5 bg-white/[0.01] text-lg sm:text-2xl font-medium leading-relaxed font-sans whitespace-pre-wrap">
              {decryptedText || session?.textContent}
            </div>
          </div>
        )}

        <div className="pt-20 border-t border-white/5 flex flex-col sm:flex-row justify-between items-center gap-6">
           <p className="text-[10px] font-black uppercase tracking-widest opacity-20 italic">Sesi didekripsi secara lokal. Server tidak mengetahui isi data Anda.</p>
           <button onClick={() => window.location.href = '/'} className="text-[10px] font-black uppercase tracking-widest hover:underline underline-offset-8">Return To Home</button>
        </div>
      </main>
    </div>
  );
}
