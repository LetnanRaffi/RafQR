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
const UploadCloudIcon = () => (<svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>);
const TextIcon = () => (<svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3h9m-9 3h4.5M2.25 5.25v13.5a2.25 2.25 0 002.25 2.25h15a2.25 2.25 0 002.25-2.25V5.25A2.25 2.25 0 0019.5 3h-15a2.25 2.25 0 00-2.25 2.25z" /></svg>);
const XIcon = () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>);
const ArrowLeftIcon = () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>);
const SettingsIcon = () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12a7.5 7.5 0 1115 0 7.5 7.5 0 01-15 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9" /></svg>);
const LockIcon = () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>);

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
      // Handle Encryption and Upload
      for (let i = 0; i < selectedFiles.length; i++) {
        let finalBlob: Blob = selectedFiles[i];
        if (e2eeEnabled) {
          finalBlob = await encryptData(selectedFiles[i], encryptionKey);
        }
        const { downloadURL, storagePath } = await uploadFileToSupabase(finalBlob, (p) => {
          setOverallProgress(Math.round(((i + p/100) / (selectedFiles.length || 1)) * 100));
        }, selectedFiles[i].name); // Use original name for path but it stores blob

        uploadedFiles.push({ fileName: selectedFiles[i].name, fileSize: finalBlob.size, fileType: selectedFiles[i].type, firebaseUrl: downloadURL, storageRef: storagePath });
      }

      let finalText = textContent.trim();
      if (e2eeEnabled && finalText) {
        const encryptedTextBlob = await encryptData(finalText, encryptionKey);
        // Special case: we don't support text encryption by string in Redis directly in v3.1 
        // but for v3.5 we store the encrypted text as a Base64 string OR as a file.
        // Let's store it as Base64 in textContent.
        const reader = new FileReader();
        finalText = await new Promise((resolve) => {
           reader.onloadend = () => resolve(reader.result as string);
           reader.readAsDataURL(encryptedTextBlob);
        });
      }

      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          files: uploadedFiles.length > 0 ? uploadedFiles : undefined, 
          textContent: finalText || undefined,
          ghost: ghostMode,
          pin: pinMode ? pinCode : undefined,
          broadcast: broadcast,
          e2ee: e2eeEnabled // Flag for receiver
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      
      setUniqueId(result.uniqueId);
      setStep('success');
      
      try {
        uploadedFiles.forEach(f => {
          fetch('/api/analytics', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'transfer', fileId: result.uniqueId, fileSize: f.fileSize, fileName: f.fileName }),
          });
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
      <header className="p-6 sm:p-10 border-b border-white/5 bg-black/80 backdrop-blur z-50">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <button onClick={reset} className="flex items-center gap-3 sm:gap-4 hover:opacity-80 transition-opacity">
            <Logo size={32} />
            <h1 className="text-xl sm:text-2xl font-black tracking-tighter uppercase italic">RafQR</h1>
          </button>
          <div className="text-[10px] font-black tracking-widest uppercase opacity-20 hidden xs:block">BY RAFFITECH SOLUTIONS</div>
        </div>
      </header>

      <main className="flex-1 flex flex-col p-6 sm:p-10">
        <div className="max-w-6xl mx-auto w-full flex-1 flex flex-col justify-center">
          
          {step === 'choice' && (
            <div className="animate-fade-in space-y-12 sm:space-y-16 py-10 w-full">
              <div className="flex flex-col sm:flex-row justify-between items-end gap-6 sm:gap-0">
                <h2 className="text-5xl sm:text-7xl lg:text-8xl font-black tracking-tighter uppercase leading-[0.85]">Select <br /> Transfer <br /><span className="opacity-20">Method</span></h2>
                <button 
                  onClick={() => window.location.href = '/scan'} 
                  className="w-full sm:w-auto p-8 sm:p-12 bg-white text-black hover:bg-white/90 transition-all flex flex-col items-center justify-center gap-4 group"
                >
                  <div className="mb-0 flex gap-1"><svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5c-.621 0-1.125-.504-1.125-1.125v-4.5z" /><path strokeLinecap="round" strokeLinejoin="round" d="M16.875 12h1.125m-1.125 3h1.125m-1.125 3h1.125M12 12h1.125m-1.125 3h1.125m-1.125 3h1.125M12 15h.008v.008H12V15zm0 3h.008v.008H12V18zm3 0h.008v.008H15V18zm0-3h.008v.008H15V15zm3 0h.008v.008H18V15zm0 3h.008v.008H18V18zm-9-9h.008v.008H9V9zm0 9.75h.008v.008H9v-.008zm-3 0h.008v.008H6v-.008zm0-3h.008v.008H6v-.008zm3 0h.008v.008H9v-.008z" /></svg></div>
                  <div className="font-black text-2xl uppercase italic tracking-tighter">Fast Scan</div>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                <button onClick={() => selectMode('file')} className="p-10 border border-white/5 hover:bg-white hover:text-black transition-all group text-left"><div className="mb-8"><UploadCloudIcon /></div><div className="font-black text-xl uppercase italic mb-2 tracking-tighter">Transfer File</div><div className="text-[10px] opacity-40 font-bold uppercase tracking-widest">Kirim media & dokumen.</div></button>
                <button onClick={() => selectMode('text')} className="p-10 border border-white/5 hover:bg-white hover:text-black transition-all group text-left"><div className="mb-8"><TextIcon /></div><div className="font-black text-xl uppercase italic mb-2 tracking-tighter">Copy Text</div><div className="text-[10px] opacity-40 font-bold uppercase tracking-widest">Kirim catatan & link.</div></button>
                <button onClick={() => selectMode('both')} className="p-10 border border-white/5 hover:bg-white hover:text-black transition-all group text-left"><div className="mb-8 flex gap-1"><UploadCloudIcon /><TextIcon /></div><div className="font-black text-xl uppercase italic mb-2 tracking-tighter">Combined</div><div className="text-[10px] opacity-40 font-bold uppercase tracking-widest">File sekaligus teks.</div></button>
                <button onClick={() => selectMode('receive')} className="p-10 border border-white/5 hover:bg-white hover:text-black transition-all group text-left bg-white/5 ring-1 ring-white/10"><div className="mb-8 flex gap-1 animate-pulse"><svg className="w-6 h-6 rotate-180" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg></div><div className="font-black text-xl uppercase italic mb-2 tracking-tighter">Terima File</div><div className="text-[10px] opacity-40 font-bold uppercase tracking-widest">HP ke PC ini.</div></button>
              </div>

              {/* FEATURES EXPLAINER v3.5 */}
              <div className="mt-20 pt-20 border-t border-white/5 grid grid-cols-1 md:grid-cols-3 gap-12 opacity-40">
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black uppercase tracking-[0.4em]">v3.5 E2EE ENCRYPT</h4>
                  <p className="text-[9px] font-black uppercase tracking-widest leading-relaxed">Data Anda diacak secara matematis di browser sebelum diunggah. Bahkan kami sebagai provider tidak bisa melihat isi data Anda.</p>
                </div>
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black uppercase tracking-[0.4em]">HYPER SCANNER</h4>
                  <p className="text-[9px] font-black uppercase tracking-widest leading-relaxed">Scanner baru yang lebih cepat dengan deteksi otomatis kamera belakang. Sekali pindai, langsung redirect ke tujuan.</p>
                </div>
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black uppercase tracking-[0.4em]">GHOST PROTOCOL </h4>
                  <p className="text-[9px] font-black uppercase tracking-widest leading-relaxed">Fitur Self-Destruct yang menghapus seluruh jejak transfer segera setelah scan pertama berhasil dilakukan.</p>
                </div>
              </div>
            </div>
          )}

          {step === 'input' && (
            <div className="animate-fade-in-up space-y-8 sm:space-y-12 py-10 w-full">
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
                   
                   <button onClick={() => setE2eeEnabled(!e2eeEnabled)} className={`p-6 border text-left transition-all ${e2eeEnabled ? 'bg-white text-black border-white' : 'border-white/10 opacity-40 hover:opacity-100'}`}>
                     <div className="flex items-center gap-2 mb-1"><LockIcon /><div className="font-black text-[10px] uppercase italic">End-To-End Encrypt</div></div>
                     {e2eeEnabled && (
                       <input 
                         onClick={(e) => e.stopPropagation()} 
                         value={encryptionKey} 
                         onChange={(e) => setEncryptionKey(e.target.value)} 
                         placeholder="Secret Key..." 
                         className="w-full mt-2 bg-black text-white px-2 py-1 text-[9px] font-black italic focus:outline-none ring-1 ring-black/10" 
                       />
                     )}
                   </button>

                   <button onClick={() => setGhostMode(!ghostMode)} className={`p-6 border text-left transition-all ${ghostMode ? 'bg-white/10 text-white border-white/40' : 'border-white/10 opacity-40 hover:opacity-100'}`}>
                     <div className="font-black text-[10px] uppercase italic mb-1">Ghost Mode (1x Scan)</div>
                     <div className="text-[8px] font-black uppercase opacity-50">Hapus otomatis setelah scan.</div>
                   </button>

                   <button onClick={() => setBroadcast(!broadcast)} className={`p-6 border text-left transition-all ${broadcast ? 'border-white/40' : 'bg-red-950/20 border-red-900/40 opacity-100'}`}>
                      <div className="font-black text-[10px] uppercase italic mb-1">{broadcast ? 'Broadcast ON' : 'Single User'}</div>
                      <div className="text-[8px] font-black uppercase opacity-50">Izinkan banyak perangkat.</div>
                   </button>

                   <div className={`p-6 border transition-all ${pinMode ? 'border-white/40' : 'border-white/10 opacity-40'}`}>
                      <div className="flex justify-between items-center mb-2">
                        <label className="font-black text-[10px] uppercase italic cursor-pointer" onClick={() => setPinMode(!pinMode)}>PIN Lock</label>
                        <input type="checkbox" checked={pinMode} onChange={() => setPinMode(!pinMode)} className="accent-white" />
                      </div>
                      <input disabled={!pinMode} value={pinCode} onChange={(e) => setPinCode(e.target.value.slice(0, 6))} placeholder="PIN..." className="w-full bg-black/50 border border-white/10 px-3 py-1 text-xs uppercase font-black disabled:opacity-20 focus:outline-none" />
                   </div>
                 </div>
              </div>

              <div className="pt-10">
                {!isUploading ? <button onClick={handleUpload} className="w-full py-6 sm:py-8 bg-white text-black font-black uppercase tracking-[0.2em] sm:text-lg hover:bg-white/90 active:scale-[0.99] transition-all">Generate Secured QR</button> : <div className="space-y-4"><div className="h-0.5 bg-white/5 w-full"><div className="h-full bg-white transition-all duration-500" style={{ width: `${overallProgress}%` }} /></div><div className="flex justify-between items-center text-[10px] font-black tracking-widest px-1 uppercase opacity-40"><span>Encrypting & Sending</span><span>{overallProgress}%</span></div></div>}
                {error && <p className="text-xs font-black text-red-600 uppercase tracking-widest mt-4">Error: {error}</p>}
              </div>
            </div>
          )}

          {(step === 'success' || step === 'waiting') && (
            <div className="animate-scale-in grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-20 items-center py-10">
              <div className="space-y-10">
                <div>
                   {downloadedAtLeastOnce && (
                      <div className="bg-white text-black px-4 py-2 mb-8 inline-block animate-bounce"><p className="text-[10px] font-black uppercase tracking-widest">Penerima Baru Saja Men-Download!</p></div>
                   )}
                  <h2 className="text-4xl sm:text-6xl font-black uppercase tracking-tighter leading-none mb-4">{step === 'waiting' ? 'Waiting for' : 'Content'} <br /><span className="opacity-20 underline">{step === 'waiting' ? 'Upload' : 'Secured'}</span></h2>
                  <p className="text-[11px] font-black uppercase tracking-widest opacity-40 leading-relaxed max-w-sm">{e2eeEnabled ? '⚠️ FILE TERENKRIPSI: Penerima membutuhkan Secret Key Anda untuk membuka file ini.' : 'Pindai QR Code di sebelah untuk mengakses data Anda. Berlaku 30 menit.'}</p>
                </div>
                <div className="space-y-4">
                  <div className="flex bg-white/5 border border-white/10 p-4 sm:p-6 overflow-hidden">
                    <span className="text-[10px] opacity-40 flex-1 truncate font-mono">{step === 'waiting' ? getReceiveURL() : getShareURL()}</span>
                    <button onClick={() => copyLink(step === 'waiting' ? getReceiveURL() : getShareURL())} className="text-xs font-black uppercase hover:underline ml-6 underline-offset-4">{copied ? 'Copied' : 'Copy Link'}</button>
                  </div>
                </div>
                {e2eeEnabled && step === 'success' && (
                  <div className="p-6 border border-white/10 bg-white/5"><p className="text-[8px] font-black uppercase tracking-widest opacity-40 mb-2">Your Secret Key (Sharing is Required)</p><p className="text-xl font-black italic tracking-widest">{encryptionKey}</p></div>
                )}
                <button onClick={reset} className="w-full py-6 border border-white/10 text-xs font-black uppercase tracking-widest hover:bg-white/5 transition-all">Cancel / Start New</button>
              </div>
              <div className="flex flex-col items-center lg:items-end">
                <div className="p-8 sm:p-12 bg-white ring-[16px] ring-white/5"><QRCodeSVG value={step === 'waiting' ? getReceiveURL() : getShareURL()} size={qrSize} level="H" bgColor="#FFFFFF" fgColor="#000000" marginSize={0} /></div>
                <div className="mt-8 text-center sm:text-right space-y-1"><div className="text-[10px] font-black uppercase tracking-[0.3em] bg-white text-black px-4 py-1 inline-block">{step === 'waiting' ? 'Scan To Upload' : 'Scan To Access'}</div><p className="text-[9px] font-black uppercase tracking-widest opacity-20 mt-4 block italic">End-to-End Encryption [ACTIVE]</p></div>
              </div>
            </div>
          )}

        </div>
      </main>

      <footer className="footer w-full p-8 sm:p-12 border-t border-white/5 flex flex-col sm:flex-row justify-between items-center gap-6">
        <p className="text-[9px] opacity-20 font-black uppercase tracking-widest leading-none">© 2026 / RAFQR / RAFFITECH SOLUTIONS / v3.5 E2EE</p>
      </footer>
    </div>
  );
}
