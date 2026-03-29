'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { uploadFileToSupabase } from '../lib/supabase-storage';
import { encryptData } from '../lib/crypto';
import { QRCodeSVG } from 'qrcode.react';
import { Logo } from '../components/Logo';
import { nanoid } from 'nanoid';

// ─── Utilities ───────────────────────────────────────────────
const formatSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const getFileExt = (name: string): string => {
  const parts = name.split('.');
  return parts.length > 1 ? parts.pop()!.toUpperCase() : 'FILE';
};

// ─── Icons ───────────────────────────────────────────────────
const XIcon = () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>);
const ArrowLeftIcon = () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>);
const LockIcon = () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>);
const ScanIcon = () => (<svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5c-.621 0-1.125-.504-1.125-1.125v-4.5z" /><path strokeLinecap="round" strokeLinejoin="round" d="M16.875 12h1.125m-1.125 3h1.125m-1.125 3h1.125M12 12h1.125m-1.125 3h1.125m-1.125 3h1.125" /></svg>);

// ─── Types ───────────────────────────────────────────────────
interface UploadedFile {
  fileName: string;
  fileSize: number;
  fileType: string;
  firebaseUrl: string;
  storageRef: string;
}

type Mode = 'send' | 'receive';
type Step = 'input' | 'success' | 'waiting';

// ─── Component ───────────────────────────────────────────────
export default function UploadPage() {
  const [step, setStep] = useState<Step>('input');
  const [activeMode, setActiveMode] = useState<Mode>('send');
  
  // Data State
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [textContent, setTextContent] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [overallProgress, setOverallProgress] = useState(0);
  const [uniqueId, setUniqueId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [qrSize, setQrSize] = useState(240);
  const [downloadedAtLeastOnce, setDownloadedAtLeastOnce] = useState(false);
  
  // Settings Toggles
  const [ghostMode, setGhostMode] = useState(false);
  const [pinMode, setPinMode] = useState(false);
  const [pinCode, setPinCode] = useState('');
  const [broadcast, setBroadcast] = useState(true); 
  const [e2eeEnabled, setE2eeEnabled] = useState(false);
  const [encryptionKey, setEncryptionKey] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleResize = () => setQrSize(window.innerWidth < 640 ? 200 : 300);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const newPs: Record<string, string> = {};
    selectedFiles.forEach(f => { if (f.type.startsWith('image/')) newPs[`${f.name}-${f.lastModified}`] = URL.createObjectURL(f); });
    setPreviews(newPs);
    return () => Object.values(newPs).forEach(url => URL.revokeObjectURL(url));
  }, [selectedFiles]);

  useEffect(() => {
    if ((step !== 'waiting' && step !== 'success') || !uniqueId) return;
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/session?id=${uniqueId}`);
        const result = await res.json();
        if (step === 'waiting') { if (res.ok && result.data && (result.data.files || (result.data.textContent && result.data.textContent !== 'WAITING_FOR_UPLOAD'))) window.location.href = `/d/${uniqueId}`; }
        if (step === 'success') { if (res.ok && result.data && result.data.isDownloaded && !downloadedAtLeastOnce) setDownloadedAtLeastOnce(true); }
      } catch (err) {}
    }, 3000);
    return () => clearInterval(pollInterval);
  }, [step, uniqueId, downloadedAtLeastOnce]);

  const handleReceive = async () => {
      const id = nanoid(10); setUniqueId(id); setIsUploading(true);
      try {
        await fetch('/api/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, textContent: 'WAITING_FOR_UPLOAD' }),
        });
        setStep('waiting');
      } catch (err) {}
      setIsUploading(false);
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0 && !textContent.trim()) { setError('Berikan data (File atau Teks) untuk dikirim.'); return; }
    if (pinMode && (pinCode.length < 4)) { setError('PIN minimal 4 karakter.'); return; }
    if (e2eeEnabled && (encryptionKey.length < 6)) { setError('Secret E2EE minimal 6 karakter.'); return; }
    
    // Check total file size (Max 50MB common limit)
    const totalBytes = selectedFiles.reduce((acc, f) => acc + f.size, 0);
    if (totalBytes > 50 * 1024 * 1024) { setError('Total file melebihi batas 50MB (Batas Supabase Free Tier).'); return; }

    setIsUploading(true); setOverallProgress(0); setDownloadedAtLeastOnce(false);
    const uploadedFiles: UploadedFile[] = [];
    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        let finalBlob: Blob = selectedFiles[i];
        if (e2eeEnabled) finalBlob = await encryptData(selectedFiles[i], encryptionKey);
        const { downloadURL, storagePath } = await uploadFileToSupabase(finalBlob, (p) => { setOverallProgress(Math.round(((i + p/100) / (selectedFiles.length || 1)) * 100)); }, selectedFiles[i].name);
        uploadedFiles.push({ fileName: selectedFiles[i].name, fileSize: finalBlob.size, fileType: selectedFiles[i].type, firebaseUrl: downloadURL, storageRef: storagePath });
      }

      let finalText = textContent.trim();
      if (e2eeEnabled && finalText) {
        const encryptedTextBlob = await encryptData(finalText, encryptionKey);
        const reader = new FileReader();
        finalText = await new Promise((resolve) => { reader.onloadend = () => resolve(reader.result as string); reader.readAsDataURL(encryptedTextBlob); });
      }

      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: uploadedFiles.length > 0 ? uploadedFiles : undefined, textContent: finalText || undefined, ghost: ghostMode, pin: pinMode ? pinCode : undefined, broadcast: broadcast, e2ee: e2eeEnabled }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      setUniqueId(result.uniqueId); setStep('success');
      try {
        uploadedFiles.forEach(f => {
          fetch('/api/analytics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'transfer', fileId: result.uniqueId, fileSize: f.fileSize, fileName: f.fileName }), });
        });
      } catch (err) {}
    } catch (err: any) { setError(err.message || 'Gagal mengirim data.'); }
    finally { setIsUploading(false); }
  };

  const reset = () => { setStep('input'); setSelectedFiles([]); setTextContent(''); setUniqueId(null); setError(null); setDownloadedAtLeastOnce(false); };
  const getShareURL = () => (typeof window !== 'undefined' ? `${window.location.origin}/d/${uniqueId}` : '');
  const getReceiveURL = () => (typeof window !== 'undefined' ? `${window.location.origin}/u/${uniqueId}` : '');
  const copyLink = async (url: string) => {
    try { await navigator.clipboard.writeText(url); } catch (err) {
      const t = document.createElement("textarea"); t.value = url; document.body.appendChild(t); t.select(); document.execCommand('copy'); document.body.removeChild(t);
    }
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-black text-white selection:bg-white selection:text-black font-sans flex flex-col">
      {/* ─── NAVBAR ─────────────────────────────────────────── */}
      <nav className="p-6 sm:p-10 border-b border-white/5 bg-black/80 backdrop-blur sticky top-0 z-[100] flex justify-between items-center">
        <button onClick={reset} className="flex items-center gap-3">
          <Logo size={28} />
          <h1 className="text-xl font-black tracking-tighter uppercase italic">RafQR</h1>
        </button>
        <button onClick={() => window.location.href = '/scan'} className="bg-white text-black px-6 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-white/90 active:scale-95 transition-all shadow-[6px_6px_0px_0px_rgba(255,255,255,0.1)]">
           Pindai QR
        </button>
      </nav>

      <main className="flex-1 flex flex-col">
        {/* HERO BRANDING */}
        <section className="pt-24 pb-12 px-6 text-center max-w-5xl mx-auto space-y-8">
           <div className="inline-block px-4 py-1.5 bg-red-600 text-[8px] font-black tracking-[0.4em] uppercase mb-4 animate-pulse">Sistem Transfer Instan v5.2</div>
           <h2 className="text-7xl sm:text-9xl font-black tracking-tighter uppercase leading-[0.8] italic">
              Kirim Data <br /> Tanpa <br /> <span className="text-outline">Jejak</span>
           </h2>
           <p className="text-xs sm:text-sm font-black uppercase tracking-[0.3em] opacity-40 max-w-3xl mx-auto leading-loose italic">
              Pindahkan file dan catatan antar perangkat secara privat. Aman, cepat, dan otomatis terhapus dalam 30 menit.
           </p>
        </section>

        <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col px-6">
          {step === 'input' && ( activeMode === 'send' || activeMode === 'receive' ) && (
            <div className="animate-fade-in space-y-12 pb-40">
              
              {/* TAB TOGGLE */}
              <div className="flex bg-white/5 border border-white/10 p-1 mt-12 shadow-[10px_10px_0px_0px_rgba(255,255,255,0.02)]">
                 <button onClick={() => setActiveMode('send')} className={`flex-1 py-6 text-[11px] font-black uppercase tracking-[0.4em] transition-all ${activeMode === 'send' ? 'bg-white text-black' : 'opacity-40 hover:opacity-100'}`}>SAYA INGIN KIRIM</button>
                 <button onClick={() => setActiveMode('receive')} className={`flex-1 py-6 text-[11px] font-black uppercase tracking-[0.4em] transition-all ${activeMode === 'receive' ? 'bg-white text-black' : 'opacity-40 hover:opacity-100'}`}>SAYA INGIN TERIMA</button>
              </div>

              {activeMode === 'send' ? (
                <div className="space-y-12 animate-fade-in">
                   {/* INPUT AREA */}
                   <div className="bg-white/[0.02] border border-white/10 p-2 space-y-2">
                      <div 
                        className={`p-16 border-2 border-dashed transition-all cursor-pointer text-center ${isDragging ? 'border-white bg-white/5' : 'border-white/10 hover:border-white/15'}`} 
                        onDragOver={(e) => e.preventDefault()} onDragEnter={() => setIsDragging(true)} onDragLeave={() => setIsDragging(false)} onDrop={(e) => { e.preventDefault(); setIsDragging(false); setSelectedFiles(p => [...p, ...Array.from(e.dataTransfer.files)]); }} 
                        onClick={() => fileInputRef.current?.click()}
                      >
                         <h3 className="text-4xl font-black uppercase italic tracking-tighter mb-1">Pilih File</h3>
                         <p className="text-[10px] font-black uppercase opacity-20 tracking-widest leading-loose">
                           Klik atau tarik file ke sini <br /> 
                           <span className="text-red-500 font-black opacity-100 italic">(Maksimal Total 50MB)</span>
                         </p>
                         <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => setSelectedFiles(p => [...p, ...Array.from(e.target.files || [])])} />
                      </div>
                      
                      {selectedFiles.length > 0 && (
                        <div className="p-4 grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-3 border-b border-white/5">
                           {selectedFiles.map((f, i) => (
                             <div key={i} className="aspect-square border border-white/10 bg-black relative group">
                                {previews[`${f.name}-${f.lastModified}`] ? <img src={previews[`${f.name}-${f.lastModified}`]} className="w-full h-full object-cover grayscale opacity-50" /> : <div className="w-full h-full flex items-center justify-center text-[10px] font-black opacity-20 italic">{f.name.split('.').pop()?.toUpperCase()}</div>}
                                <button onClick={() => setSelectedFiles(p => p.filter((_, idx) => idx !== i))} className="absolute top-1 right-1 w-6 h-6 bg-black flex items-center justify-center hover:bg-red-800 transition-colors"><XIcon /></button>
                             </div>
                           ))}
                        </div>
                      )}

                      <textarea value={textContent} onChange={(e) => setTextContent(e.target.value)} placeholder="Tulis catatan, link, atau pesan rahasia di sini..." className="w-full h-48 bg-transparent border-t border-white/5 p-8 text-xl font-medium focus:outline-none placeholder-white/5 font-sans resize-none" />
                   </div>

                   {/* SETTINGS */}
                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="p-8 border border-white/5 bg-white/[0.01] flex items-center justify-between group">
                         <div><p className="text-[11px] font-black uppercase tracking-widest">Enkripsi E2EE</p><p className="text-[8px] font-black uppercase opacity-20 italic">Keamanan Matematis</p></div>
                         <div onClick={() => setE2eeEnabled(!e2eeEnabled)} className={`w-14 h-7 border-2 transition-all p-1 cursor-pointer ${e2eeEnabled ? 'border-white bg-white' : 'border-white/20'}`}><div className={`w-4 h-4 transition-all ${e2eeEnabled ? 'bg-black ml-auto' : 'bg-white/20'}`} /></div>
                      </div>
                      {e2eeEnabled && (
                        <div className="p-6 border border-white/10 bg-white/5"><input value={encryptionKey} onChange={(e) => setEncryptionKey(e.target.value)} placeholder="Kata Kunci Rahasia..." className="bg-transparent text-[11px] font-black uppercase tracking-widest focus:outline-none w-full italic" /></div>
                      )}

                      <div className="p-8 border border-white/5 bg-white/[0.01] flex items-center justify-between group">
                         <div><p className="text-[11px] font-black uppercase tracking-widest">Ghost Mode</p><p className="text-[8px] font-black uppercase opacity-20 italic">Hancur Setelah Scan</p></div>
                         <div onClick={() => setGhostMode(!ghostMode)} className={`w-14 h-7 border-2 transition-all p-1 cursor-pointer ${ghostMode ? 'border-red-600 bg-red-600' : 'border-white/20'}`}><div className={`w-4 h-4 transition-all ${ghostMode ? 'bg-white ml-auto' : 'bg-white/20'}`} /></div>
                      </div>

                      <div className="p-8 border border-white/5 bg-white/[0.01] flex items-center justify-between group">
                         <div><p className="text-[11px] font-black uppercase tracking-widest">Kunci PIN</p><p className="text-[8px] font-black uppercase opacity-20 italic">Akses 4-Digit</p></div>
                         <div onClick={() => setPinMode(!pinMode)} className={`w-14 h-7 border-2 transition-all p-1 cursor-pointer ${pinMode ? 'border-white bg-white' : 'border-white/20'}`}><div className={`w-4 h-4 transition-all ${pinMode ? 'bg-black ml-auto' : 'bg-white/20'}`} /></div>
                      </div>
                      {pinMode && (
                        <div className="p-6 border border-white/10 bg-white/5"><input value={pinCode} onChange={(e) => setPinCode(e.target.value.slice(0, 4))} placeholder="Setel PIN..." className="bg-transparent text-2xl font-black tracking-[0.5em] focus:outline-none w-full" /></div>
                      )}
                   </div>

                   <div className="pt-8">
                      {!isUploading ? (
                        <button onClick={handleUpload} className="w-full py-10 bg-white text-black font-black uppercase tracking-[0.4em] text-xl hover:shadow-[0px_0px_30px_rgba(255,255,255,0.1)] active:scale-95 transition-all italic">AKTIFKAN JEMBATAN</button>
                      ) : (
                        <div className="space-y-6"><div className="h-1 bg-white/10"><div className="h-full bg-white transition-all duration-300" style={{ width: `${overallProgress}%` }} /></div><p className="text-center text-[10px] font-black uppercase tracking-widest animate-pulse opacity-40">MENGAMANKAN DATA... {overallProgress}%</p></div>
                      )}
                      {error && <p className="text-center text-[10px] font-black uppercase text-red-600 tracking-[0.2em] mt-6 italic underline">{error}</p>}
                   </div>
                </div>
              ) : (
                <div className="space-y-12 animate-fade-in py-16">
                   <div className="space-y-4">
                      <h2 className="text-7xl font-black tracking-tighter uppercase italic leading-[0.8]">Terima <br /> Kiriman</h2>
                      <p className="text-xs font-black uppercase tracking-widest opacity-20 leading-loose">Siapkan PC ini untuk menerima data dari HP/perangkat lain secara instan.</p>
                   </div>
                   <button onClick={handleReceive} disabled={isUploading} className="w-full py-24 border-2 border-dashed border-white/10 hover:border-white/30 hover:bg-white/[0.02] transition-all flex flex-col items-center justify-center gap-6 group">
                      <div className="font-black text-4xl uppercase italic tracking-tighter group-hover:scale-105 transition-transform">Buat Terowongan</div>
                      <p className="text-[10px] font-black uppercase tracking-widest opacity-20 italic">Pairing Instan Tanpa Bluetooth.</p>
                   </button>
                </div>
              )}
            </div>
          )}

          {(step === 'success' || step === 'waiting') && (
            <div className="animate-scale-in flex flex-col lg:flex-row gap-20 items-center py-24 pb-48">
              <div className="flex-1 space-y-12">
                <div>
                  {downloadedAtLeastOnce && (
                      <div className="bg-red-600 text-white px-8 py-4 mb-10 inline-block animate-bounce shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] ring-2 ring-white/10 italic"><p className="text-[10px] font-black uppercase tracking-[0.3em]">PAKET DATA BERHASIL DITERIMA!</p></div>
                  )}
                  <h2 className="text-7xl font-black uppercase tracking-tighter leading-none italic">SESI <br /><span className="opacity-10 text-outline">AKTIF</span></h2>
                  <p className="text-[11px] font-black uppercase tracking-[0.3em] opacity-30 mt-6 leading-loose">{e2eeEnabled ? '⚠️ AMAN: Berikan kata kunci rahasia Anda ke penerima agar data dapat dibuka.' : 'Pindai QR ini untuk mengakses data. Otomatis terhapus dalam 30 menit.'}</p>
                </div>
                
                <div className="flex bg-white/5 border border-white/10 p-6 overflow-hidden">
                    <span className="text-[10px] opacity-40 flex-1 truncate font-mono uppercase tracking-widest">{step === 'waiting' ? getReceiveURL() : getShareURL()}</span>
                    <button onClick={() => copyLink(step === 'waiting' ? getReceiveURL() : getShareURL())} className="text-xs font-black uppercase hover:underline ml-10 underline-offset-8 transition-all">{copied ? 'SALIN' : 'COPY'} LINK</button>
                </div>

                {e2eeEnabled && step === 'success' && (
                  <div className="p-8 border-2 border-white/10 bg-white/5"><p className="text-[10px] font-black uppercase tracking-[0.4em] mb-4 opacity-40">Kunci Rahasia E2EE</p><p className="text-5xl font-black italic tracking-widest bg-gradient-to-r from-white to-white/20 bg-clip-text text-transparent">{encryptionKey}</p></div>
                )}

                <button onClick={reset} className="text-[10px] font-black uppercase tracking-[0.4em] opacity-20 hover:opacity-100 transition-opacity underline underline-offset-[12px]">Hapus Sesi & Mulai Lagi</button>
              </div>
              
              <div className="flex flex-col items-center order-first lg:order-last">
                 <div className="p-10 bg-white shadow-[30px_30px_0px_0px_rgba(255,255,255,0.03)] border border-white/10"><QRCodeSVG value={step === 'waiting' ? getReceiveURL() : getShareURL()} size={qrSize} level="H" bgColor="#FFFFFF" fgColor="#000000" marginSize={0} /></div>
                 <div className="mt-12 bg-white text-black px-10 py-3 shadow-[8px_8px_0px_0px_rgba(255,255,255,0.1)]"><p className="text-xs font-black uppercase tracking-[0.5em] italic">{step === 'waiting' ? 'SCAN UNTUK KIRIM' : 'SCAN UNTUK AMBIL'}</p></div>
              </div>
            </div>
          )}
        </div>

        {/* COMPREHENSIVE BRANDING (BAHASA) */}
        <div className="w-full bg-white/[0.01] border-t border-white/5 py-40">
           <div className="max-w-6xl mx-auto px-6 space-y-48">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-end">
                 <h3 className="text-5xl sm:text-7xl font-black tracking-tighter uppercase italic leading-[0.85]">Cara Kerja <br /> RafQR Bridge</h3>
                 <p className="text-sm font-black uppercase tracking-[0.3em] opacity-30 leading-loose italic underline underline-offset-8 decoration-red-600">Tercepat. Teraman. Tanpa Login.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-16 relative">
                 <div className="space-y-6">
                    <div className="text-8xl font-black opacity-5 italic">01</div>
                    <h4 className="text-3xl font-black uppercase italic tracking-tighter">Siapkan Data</h4>
                    <p className="text-[11px] font-black uppercase tracking-widest opacity-30 leading-loose">Unggah file kerja atau ketik catatan. Maksimal total file adalah **50MB** demi kestabilan sistem cloud gratis (Supabase).</p>
                 </div>
                 <div className="space-y-6">
                    <div className="text-8xl font-black opacity-5 italic">02</div>
                    <h4 className="text-3xl font-black uppercase italic tracking-tighter">Pindai QR</h4>
                    <p className="text-[11px] font-black uppercase tracking-widest opacity-30 leading-loose">Gunakan kamera HP untuk memindai kode di layar. Jembatan data langsung terhubung tanpa perlu kabel atau Bluetooth.</p>
                 </div>
                 <div className="space-y-6">
                    <div className="text-8xl font-black opacity-5 italic text-red-600">03</div>
                    <h4 className="text-3xl font-black uppercase italic tracking-tighter">Dihapus Otomatis</h4>
                    <p className="text-[11px] font-black uppercase tracking-widest opacity-30 leading-loose">Setelah 30 menit atau sekali scan (Ghost Mode), semua data akan dihapus selamanya dari jaringan kami. Tanpa sisa.</p>
                 </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                 <div className="p-12 border border-white/5 bg-white/[0.01] space-y-4">
                    <h5 className="text-[9px] font-black tracking-[0.5em] uppercase opacity-30 text-red-500">ENKRIPSI TOTAL</h5>
                    <p className="text-xs font-black uppercase tracking-widest leading-relaxed">Kami menggunakan algoritma AES-GCM 256-bit. Data dienkripsi di browser Anda, bukan di server kami.</p>
                 </div>
                 <div className="p-12 border border-white/5 bg-white/[0.01] space-y-4">
                    <h5 className="text-[9px] font-black tracking-[0.5em] uppercase opacity-30">ANTI-CLOUD</h5>
                    <p className="text-xs font-black uppercase tracking-widest leading-relaxed">Berbeda dengan Google Drive/Dropbox, RafQR tidak pernah menyimpan file Anda secara permanen. Murni untuk transfer instan.</p>
                 </div>
                 <div className="p-12 border border-white/5 bg-white/[0.01] space-y-4">
                    <h5 className="text-[9px] font-black tracking-[0.5em] uppercase opacity-30">LIMITASI SISTEM</h5>
                    <p className="text-xs font-black uppercase tracking-widest leading-relaxed italic">Karena menggunakan layanan gratis, batas upload saat ini adalah 50MB per sesi. Cocok untuk dokumen dan foto.</p>
                 </div>
              </div>
           </div>
        </div>
      </main>

      {/* FOOTER */}
      <footer className="w-full p-12 border-t border-white/5 flex flex-col sm:flex-row justify-between items-center gap-10 opacity-40">
        <div className="text-left font-black italic">
           <p className="text-[10px] uppercase tracking-widest">RafQR Data Bridge / LetnanRaffi</p>
           <p className="text-[8px] uppercase tracking-[0.4em] opacity-40 mt-1">PRODUCT OF RAFFITECH SOLUTIONS / 2026</p>
        </div>
        <div className="flex gap-16 font-black">
           <p className="text-[9px] uppercase tracking-widest cursor-pointer hover:text-red-500 transition-colors" onClick={() => window.location.href = '/admin'}>[ ADMIN ]</p>
        </div>
      </footer>
    </div>
  );
}
