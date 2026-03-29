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
const UploadCloudIcon = () => (<svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>);
const TextIcon = () => (<svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3h9m-9 3h4.5M2.25 5.25v13.5a2.25 2.25 0 002.25 2.25h15a2.25 2.25 0 002.25-2.25V5.25A2.25 2.25 0 0019.5 3h-15a2.25 2.25 0 00-2.25 2.25z" /></svg>);
const XIcon = () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>);
const ArrowLeftIcon = () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>);
const SettingsIcon = () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12a7.5 7.5 0 1115 0 7.5 7.5 0 01-15 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9" /></svg>);
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

type Mode = 'none' | 'file' | 'text' | 'both' | 'receive';
type Step = 'choice' | 'input' | 'success' | 'waiting';

// ─── Component ───────────────────────────────────────────────
export default function UploadPage() {
  const [step, setStep] = useState<Step>('choice');
  const [mode, setMode] = useState<Mode>('none');
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
  
  // v3.0 Features
  const [ghostMode, setGhostMode] = useState(false);
  const [pinMode, setPinMode] = useState(false);
  const [pinCode, setPinCode] = useState('');
  const [broadcast, setBroadcast] = useState(true); 
  
  // v3.5 E2EE
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
    selectedFiles.forEach(f => {
      if (f.type.startsWith('image/')) newPs[`${f.name}-${f.lastModified}`] = URL.createObjectURL(f);
    });
    setPreviews(newPs);
    return () => Object.values(newPs).forEach(url => URL.revokeObjectURL(url));
  }, [selectedFiles]);

  useEffect(() => {
    if ((step !== 'waiting' && step !== 'success') || !uniqueId) return;
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/session?id=${uniqueId}`);
        const result = await res.json();
        if (step === 'waiting') {
           if (res.ok && result.data && (result.data.files || (result.data.textContent && result.data.textContent !== 'WAITING_FOR_UPLOAD'))) {
             window.location.href = `/d/${uniqueId}`;
           }
        }
        if (step === 'success') {
           if (res.ok && result.data && result.data.isDownloaded && !downloadedAtLeastOnce) {
             setDownloadedAtLeastOnce(true);
           }
        }
      } catch (err) {}
    }, 3000);
    return () => clearInterval(pollInterval);
  }, [step, uniqueId, downloadedAtLeastOnce]);

  const selectMode = async (m: Mode) => {
    if (m === 'receive') {
      const id = nanoid(10);
      setUniqueId(id);
      setStep('waiting');
      setMode('receive');
      try {
        await fetch('/api/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, textContent: 'WAITING_FOR_UPLOAD' }),
        });
      } catch (err) {}
      return;
    }
    setMode(m);
    setStep('input');
    setError(null);
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0 && !textContent.trim()) { setError('Masukkan data.'); return; }
    if (pinMode && (pinCode.length < 4)) { setError('PIN minimal 4 karakter.'); return; }
    if (e2eeEnabled && (encryptionKey.length < 6)) { setError('Secret E2EE minimal 6 karakter.'); return; }
    
    setIsUploading(true);
    setOverallProgress(0);
    setDownloadedAtLeastOnce(false);
    const uploadedFiles: UploadedFile[] = [];
    
    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        let finalBlob: Blob = selectedFiles[i];
        if (e2eeEnabled) finalBlob = await encryptData(selectedFiles[i], encryptionKey);
        const { downloadURL, storagePath } = await uploadFileToSupabase(finalBlob, (p) => {
          setOverallProgress(Math.round(((i + p/100) / (selectedFiles.length || 1)) * 100));
        }, selectedFiles[i].name);
        uploadedFiles.push({ fileName: selectedFiles[i].name, fileSize: finalBlob.size, fileType: selectedFiles[i].type, firebaseUrl: downloadURL, storageRef: storagePath });
      }

      let finalText = textContent.trim();
      if (e2eeEnabled && finalText) {
        const encryptedTextBlob = await encryptData(finalText, encryptionKey);
        const reader = new FileReader();
        finalText = await new Promise((resolve) => {
           reader.onloadend = () => resolve(reader.result as string);
           reader.readAsDataURL(encryptedTextBlob);
        });
      }

      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: uploadedFiles.length > 0 ? uploadedFiles : undefined, textContent: finalText || undefined, ghost: ghostMode, pin: pinMode ? pinCode : undefined, broadcast: broadcast, e2ee: e2eeEnabled }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      setUniqueId(result.uniqueId);
      setStep('success');
      try {
        uploadedFiles.forEach(f => {
          fetch('/api/analytics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'transfer', fileId: result.uniqueId, fileSize: f.fileSize, fileName: f.fileName }), });
        });
      } catch (err) {}
    } catch (err: any) { setError(err.message || 'Error.'); }
    finally { setIsUploading(false); }
  };

  const reset = () => { setStep('choice'); setMode('none'); setSelectedFiles([]); setTextContent(''); setUniqueId(null); setError(null); setDownloadedAtLeastOnce(false); };
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
      {/* ─── NAV BAR ─────────────────────────────────────────── */}
      <header className="p-6 sm:p-8 border-b border-white/10 bg-black/80 backdrop-blur sticky top-0 z-[100]">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <button onClick={reset} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <Logo size={28} />
            <h1 className="text-lg sm:text-xl font-black tracking-tighter uppercase italic">RafQR</h1>
          </button>
          
          <div className="flex items-center gap-4">
             <button 
                onClick={() => window.location.href = '/scan'} 
                className="flex items-center gap-2 bg-white text-black px-4 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-white/90 active:scale-95 transition-all"
             >
                <ScanIcon />
                <span className="hidden xs:inline">Scan QR</span>
             </button>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col">
        <div className="max-w-6xl mx-auto w-full flex-1 flex flex-col">
          
          {step === 'choice' && (
            <div className="animate-fade-in flex flex-col py-20 px-6 sm:px-0">
              
              {/* HERO */}
              <div className="text-center space-y-8 mb-24 max-w-4xl mx-auto">
                <h2 className="text-6xl sm:text-8xl lg:text-9xl font-black tracking-tighter uppercase leading-[0.8] italic">
                   Instant <br /> Data <br /> <span className="opacity-10 text-outline">Bridge</span>
                </h2>
                <p className="text-[10px] sm:text-xs font-black uppercase tracking-[0.4em] opacity-40">Kirim file & catatan antar perangkat tanpa ribet.</p>
              </div>

              {/* ACTION GRID */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
                <div onClick={() => selectMode('file')} className="p-12 border-2 border-white/5 bg-white/[0.02] hover:bg-white hover:text-black transition-all cursor-pointer group flex flex-col items-center text-center">
                  <div className="mb-8 group-hover:scale-110 transition-transform duration-300"><UploadCloudIcon /></div>
                  <h3 className="font-black text-2xl uppercase italic tracking-tighter">Share File</h3>
                  <p className="text-[9px] font-black uppercase tracking-widest opacity-30 group-hover:opacity-100 mt-2">Media & Dokumen</p>
                </div>
                
                <div onClick={() => selectMode('text')} className="p-12 border-2 border-white/5 bg-white/[0.02] hover:bg-white hover:text-black transition-all cursor-pointer group flex flex-col items-center text-center text-red-500 hover:text-black">
                  <div className="mb-8 group-hover:scale-110 transition-transform duration-300"><TextIcon /></div>
                  <h3 className="font-black text-2xl uppercase italic tracking-tighter">Copy Text</h3>
                  <p className="text-[9px] font-black uppercase tracking-widest opacity-30 group-hover:opacity-100 mt-2">Link & Catatan</p>
                </div>

                <div onClick={() => selectMode('both')} className="p-12 border-2 border-white/10 bg-white/[0.04] hover:bg-white hover:text-black transition-all cursor-pointer group flex flex-col items-center text-center">
                  <div className="mb-8 flex gap-1 group-hover:scale-110 transition-transform duration-300"><UploadCloudIcon /><TextIcon /></div>
                  <h3 className="font-black text-2xl uppercase italic tracking-tighter">Dual Pack</h3>
                   <p className="text-[9px] font-black uppercase tracking-widest opacity-30 group-hover:opacity-100 mt-2">Kombinasi Keduanya</p>
                </div>

                <div onClick={() => selectMode('receive')} className="p-12 border-2 border-dashed border-white/20 bg-white/[0.01] hover:bg-white/5 transition-all cursor-pointer group flex flex-col items-center text-center border-t-white">
                  <div className="mb-8 animate-pulse text-white/40"><svg className="w-8 h-8 rotate-180" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg></div>
                  <h3 className="font-black text-2xl uppercase italic tracking-tighter opacity-40">Receive Link</h3>
                  <p className="text-[9px] font-black uppercase tracking-widest opacity-20 mt-2 text-white">HP ke PC Ini</p>
                </div>
              </div>

              {/* MODERN FEATURES SECTION */}
              <section className="mt-48 pb-20 space-y-32">
                 <div className="max-w-4xl mx-auto text-center">
                    <h4 className="text-[10px] font-black uppercase tracking-[0.6em] mb-4 opacity-30 underline underline-offset-8">Engine Specifications</h4>
                    <p className="text-xl sm:text-3xl font-black uppercase tracking-tighter leading-tight italic">Membangun standar baru dalam <br /> privat data transfer.</p>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-20">
                    <div className="space-y-6">
                       <div className="w-12 h-1 bg-red-600" />
                       <h5 className="text-4xl font-black uppercase tracking-tighter">End-to-End <br /> Encryption (E2EE)</h5>
                       <p className="text-[11px] font-black uppercase tracking-widest opacity-40 leading-loose">Data Anda dienkripsi (AES-GCM) langsung di browser. Bahkan kami tidak bisa membaca isinya. Keamanan mutlak, tanpa terkecuali.</p>
                    </div>
                    <div className="space-y-6">
                       <div className="w-12 h-1 bg-white" />
                       <h5 className="text-4xl font-black uppercase tracking-tighter">Ghost Mode <br /> Protocol</h5>
                       <p className="text-[11px] font-black uppercase tracking-widest opacity-40 leading-loose">Aktifkan Ghost Mode untuk menghapus seluruh data dan jejak transfer segera setelah satu kali unduhan berhasil dilakukan.</p>
                    </div>
                    <div className="space-y-6">
                       <div className="w-12 h-1 bg-white" />
                       <h5 className="text-4xl font-black uppercase tracking-tighter">Archival <br /> ZIP Bundling</h5>
                       <p className="text-[11px] font-black uppercase tracking-widest opacity-40 leading-loose">Ingin kirim banyak file? RafQR otomatis membundel aset Anda menjadi file ZIP tunggal secara real-time untuk kemudahan download.</p>
                    </div>
                    <div className="space-y-6">
                       <div className="w-12 h-1 bg-white" />
                       <h5 className="text-4xl font-black uppercase tracking-tighter">Hyper Sync <br /> Scanner</h5>
                       <p className="text-[11px] font-black uppercase tracking-widest opacity-40 leading-loose">Scanner QR built-in yang sangat cepat. Mengoptimalkan kamera belakang (environment) untuk pairing instan antar perangkat.</p>
                    </div>
                 </div>
              </section>
            </div>
          )}

          {step === 'input' && (
            <div className="animate-fade-in-up space-y-8 sm:space-y-12 py-20 px-6 sm:px-0 w-full">
              <button onClick={() => setStep('choice')} className="group flex items-center gap-2 text-[10px] font-black uppercase tracking-widest opacity-40 hover:opacity-100 transition-opacity"><ArrowLeftIcon /> Back To Methods</button>
              
              <div className="space-y-10">
                {(mode === 'file' || mode === 'both') && (
                  <div className="space-y-6">
                    <div className={`p-10 sm:p-24 border-2 border-dashed transition-all cursor-pointer text-center ${isDragging ? 'border-white bg-white/5' : 'border-white/10 hover:border-white/20'}`} onDragOver={(e) => e.preventDefault()} onDragEnter={() => setIsDragging(true)} onDragLeave={() => setIsDragging(false)} onDrop={(e) => { e.preventDefault(); setIsDragging(false); setSelectedFiles(p => [...p, ...Array.from(e.dataTransfer.files)]); }} onClick={() => fileInputRef.current?.click()}>
                      <p className="font-black uppercase tracking-tighter text-xl sm:text-4xl mb-2">Drop your files</p><p className="text-[10px] font-black uppercase opacity-20 tracking-widest">or browse local storage</p>
                      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => setSelectedFiles(p => [...p, ...Array.from(e.target.files || [])])} />
                    </div>
                    {selectedFiles.length > 0 && <div className="grid grid-cols-2 xs:grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2">{selectedFiles.map((f, i) => (<div key={i} className="aspect-square border border-white/5 bg-white/5 relative group overflow-hidden">{previews[`${f.name}-${f.lastModified}`] ? <img src={previews[`${f.name}-${f.lastModified}`]} className="w-full h-full object-cover grayscale opacity-60 transition-opacity" /> : <div className="w-full h-full flex items-center justify-center text-[10px] font-black opacity-10 uppercase">{getFileExt(f.name)}</div>}<button onClick={() => setSelectedFiles(p => p.filter((_, idx) => idx !== i))} className="absolute top-1 right-1 w-6 h-6 bg-black ring-1 ring-white/10 flex items-center justify-center hover:bg-red-900 transition-all"><XIcon /></button></div>))}</div>}
                  </div>
                )}
                {(mode === 'text' || mode === 'both') && <textarea value={textContent} onChange={(e) => setTextContent(e.target.value)} placeholder="Type your data here..." className="w-full h-48 sm:h-96 bg-white/[0.01] border border-white/10 p-8 sm:p-12 text-xl sm:text-3xl font-medium focus:outline-none focus:border-white transition-all resize-none placeholder-white/5 font-sans" />}
              </div>

              {/* v3.5 TRANSFER SETTINGS */}
              <div className="p-8 sm:p-12 border border-white/5 bg-white/[0.01] space-y-10">
                 <div className="flex items-center gap-3"><SettingsIcon /><h3 className="text-[10px] font-black uppercase tracking-[0.4em] opacity-40">Privacy & Encryption</h3></div>
                 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                   <button onClick={() => setE2eeEnabled(!e2eeEnabled)} className={`p-6 border text-left transition-all ${e2eeEnabled ? 'bg-white text-black border-white ring-8 ring-white/5' : 'border-white/10 opacity-40 hover:opacity-100'}`}>
                     <div className="flex items-center gap-2 mb-1"><LockIcon /><div className="font-black text-[10px] uppercase italic">E2EE Encrypt</div></div>
                     {e2eeEnabled && (
                       <input onClick={(e) => e.stopPropagation()} value={encryptionKey} onChange={(e) => setEncryptionKey(e.target.value)} placeholder="Secret Key..." className="w-full mt-2 bg-black text-white px-2 py-1 text-[9px] font-black italic focus:outline-none ring-1 ring-black/10" />
                     )}
                   </button>
                   <button onClick={() => setGhostMode(!ghostMode)} className={`p-6 border text-left transition-all ${ghostMode ? 'bg-red-600 text-white border-red-600' : 'border-white/10 opacity-40 hover:opacity-100'}`}>
                     <div className="font-black text-[10px] uppercase italic mb-1">Ghost Mode</div>
                     <div className="text-[8px] font-black uppercase opacity-100 italic">Self-Destruct (1x Scan)</div>
                   </button>
                   <button onClick={() => setBroadcast(!broadcast)} className={`p-6 border text-left transition-all ${broadcast ? 'border-white/40' : 'bg-white/10 border-white opacity-100'}`}>
                      <div className="font-black text-[10px] uppercase italic mb-1">{broadcast ? 'Multi-Scan ON' : 'Single User'}</div>
                      <div className="text-[8px] font-black uppercase opacity-50">Izinkan banyak perangkat.</div>
                   </button>
                   <div className={`p-6 border transition-all ${pinMode ? 'border-white' : 'border-white/10 opacity-40'}`}>
                      <div className="flex justify-between items-center mb-2">
                        <label className="font-black text-[10px] uppercase italic cursor-pointer" onClick={() => setPinMode(!pinMode)}>PIN Lock</label>
                        <input type="checkbox" checked={pinMode} onChange={() => setPinMode(!pinMode)} className="accent-white" />
                      </div>
                      <input disabled={!pinMode} value={pinCode} onChange={(e) => setPinCode(e.target.value.slice(0, 6))} placeholder="PIN..." className="w-full bg-black/50 border border-white/10 px-3 py-1 text-xs uppercase font-black disabled:opacity-20 focus:outline-none" />
                   </div>
                 </div>
              </div>

              <div className="pt-10">
                {!isUploading ? <button onClick={handleUpload} className="w-full py-8 bg-white text-black font-black uppercase tracking-[0.2em] sm:text-xl hover:bg-white/90 active:scale-[0.99] transition-all">Generate QR Bridge</button> : <div className="space-y-4"><div className="h-0.5 bg-white/5 w-full"><div className="h-full bg-white transition-all duration-500" style={{ width: `${overallProgress}%` }} /></div><div className="flex justify-between items-center text-[10px] font-black tracking-widest px-1 uppercase opacity-40"><span>Processing...</span><span>{overallProgress}%</span></div></div>}
                {error && <p className="text-xs font-black text-red-600 uppercase tracking-widest mt-4">Error: {error}</p>}
              </div>
            </div>
          )}

          {(step === 'success' || step === 'waiting') && (
            <div className="animate-scale-in grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-20 items-center py-20 px-6 sm:px-0">
              <div className="space-y-10">
                <div>
                  {downloadedAtLeastOnce && (
                      <div className="bg-red-600 text-white px-4 py-2 mb-8 inline-block animate-bounce shadow-[4px_4px_0px_0px_rgba(127,29,29,1)]"><p className="text-[10px] font-black uppercase tracking-widest">Penerima Baru Saja Mengunduh!</p></div>
                  )}
                  <h2 className="text-4xl sm:text-6xl font-black uppercase tracking-tighter leading-none mb-4">{step === 'waiting' ? 'Waiting' : 'Secure'} <br /><span className="opacity-20 underline italic">{step === 'waiting' ? 'For Push' : 'Bridge'}</span></h2>
                  <p className="text-[11px] font-black uppercase tracking-widest opacity-40 leading-relaxed max-w-sm">{e2eeEnabled ? '⚠️ FILE ENCRYPTED: Share the secret key to allow decryption.' : 'Scan via phone to access the data. Valid for 30 minutes.'}</p>
                </div>
                <div className="space-y-4">
                  <div className="flex bg-white/5 border border-white/10 p-4 sm:p-6 overflow-hidden">
                    <span className="text-[10px] opacity-40 flex-1 truncate font-mono">{step === 'waiting' ? getReceiveURL() : getShareURL()}</span>
                    <button onClick={() => copyLink(step === 'waiting' ? getReceiveURL() : getShareURL())} className="text-xs font-black uppercase hover:underline ml-6 underline-offset-4">{copied ? 'Copied' : 'Copy Link'}</button>
                  </div>
                </div>
                {e2eeEnabled && step === 'success' && (
                  <div className="p-6 border border-white/10 bg-white/5"><p className="text-[8px] font-black uppercase tracking-widest opacity-40 mb-2">Secret Key</p><p className="text-2xl font-black italic tracking-widest">{encryptionKey}</p></div>
                )}
                <button onClick={reset} className="w-full py-6 border border-white/10 text-xs font-black uppercase tracking-widest hover:bg-white/5 transition-all">Cancel Transfer</button>
              </div>
              <div className="flex flex-col items-center lg:items-end">
                <div className="p-8 sm:p-12 bg-white ring-[16px] ring-white/5"><QRCodeSVG value={step === 'waiting' ? getReceiveURL() : getShareURL()} size={qrSize} level="H" bgColor="#FFFFFF" fgColor="#000000" marginSize={0} /></div>
                <div className="mt-8 text-center sm:text-right space-y-1"><div className="text-[10px] font-black uppercase tracking-[0.3em] bg-red-600 text-white px-4 py-1 inline-block">{step === 'waiting' ? 'Scan to Upload' : 'Scan to Access'}</div></div>
              </div>
            </div>
          )}

        </div>
      </main>

      {/* ─── FOOTER ──────────────────────────────────────────── */}
      <footer className="w-full p-8 sm:p-12 border-t border-white/5 flex flex-col sm:flex-row justify-between items-center gap-6 mt-40">
        <p className="text-[9px] opacity-20 font-black uppercase tracking-widest leading-none">© 2026 / RAFQR / RAFFITECH SOLUTIONS / v3.5 PREMIUM </p>
        <div className="flex gap-10 opacity-20">
           <p className="text-[9px] font-black uppercase tracking-widest cursor-pointer hover:opacity-100" onClick={() => window.location.href = '/admin'}>System Admin</p>
        </div>
      </footer>
    </div>
  );
}
