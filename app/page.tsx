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

  const handleReceive = async () => {
      const id = nanoid(10);
      setUniqueId(id);
      setIsUploading(true);
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
      {/* ─── NAV BAR ─────────────────────────────────────────── */}
      <header className="p-6 sm:p-8 border-b border-white/10 bg-black/80 backdrop-blur sticky top-0 z-[100]">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <button onClick={reset} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <Logo size={28} />
            <h1 className="text-xl font-black tracking-tighter uppercase italic">RafQR</h1>
          </button>
          
          <div className="flex items-center gap-4">
             <button onClick={() => window.location.href = '/scan'} className="flex items-center gap-2 bg-white text-black px-5 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-white/90 transition-all shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)]">
                <ScanIcon />
                <span className="hidden xs:inline">Scan QR</span>
             </button>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col pt-16">
        <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col px-6">
          
          {step === 'input' && (
            <div className="animate-fade-in space-y-12 pb-20">
              
              {/* MODE TOGGLE */}
              <div className="flex bg-white/5 p-1 border border-white/10">
                 <button 
                   onClick={() => setActiveMode('send')} 
                   className={`flex-1 py-4 text-[10px] font-black uppercase tracking-[0.3em] transition-all ${activeMode === 'send' ? 'bg-white text-black' : 'opacity-40 hover:opacity-100'}`}
                 >
                   I WANT TO SEND
                 </button>
                 <button 
                   onClick={() => setActiveMode('receive')} 
                   className={`flex-1 py-4 text-[10px] font-black uppercase tracking-[0.3em] transition-all ${activeMode === 'receive' ? 'bg-white text-black' : 'opacity-40 hover:opacity-100'}`}
                 >
                   I WANT TO RECEIVE
                 </button>
              </div>

              {activeMode === 'send' ? (
                <div className="space-y-10 animate-fade-in">
                   <div className="space-y-4">
                      <h2 className="text-5xl sm:text-7xl font-black tracking-tighter uppercase leading-[0.8] italic">Instant <br /> Sending</h2>
                      <p className="text-[10px] font-black uppercase tracking-widest opacity-30">Drop file atau tulis pesan rahasia Anda di bawah.</p>
                   </div>

                   {/* UNIFIED INPUT BOX */}
                   <div className="space-y-4">
                      {/* FILE AREA */}
                      <div 
                        className={`p-10 border-2 border-dashed transition-all cursor-pointer text-center ${isDragging ? 'border-white bg-white/5' : 'border-white/10 hover:border-white/20'}`} 
                        onDragOver={(e) => e.preventDefault()} onDragEnter={() => setIsDragging(true)} onDragLeave={() => setIsDragging(false)} onDrop={(e) => { e.preventDefault(); setIsDragging(false); setSelectedFiles(p => [...p, ...Array.from(e.dataTransfer.files)]); }} 
                        onClick={() => fileInputRef.current?.click()}
                      >
                         <p className="font-black uppercase tracking-tighter text-3xl mb-1">Pick Files</p>
                         <p className="text-[9px] font-black uppercase opacity-20 tracking-widest">or drop them here</p>
                         <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => setSelectedFiles(p => [...p, ...Array.from(e.target.files || [])])} />
                      </div>
                      
                      {selectedFiles.length > 0 && (
                        <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2">
                           {selectedFiles.map((f, i) => (
                             <div key={i} className="aspect-square border border-white/5 bg-white/5 relative group">
                                {previews[`${f.name}-${f.lastModified}`] ? <img src={previews[`${f.name}-${f.lastModified}`]} className="w-full h-full object-cover grayscale opacity-50" /> : <div className="w-full h-full flex items-center justify-center text-[9px] font-black opacity-10">{f.name.split('.').pop()?.toUpperCase()}</div>}
                                <button onClick={() => setSelectedFiles(p => p.filter((_, idx) => idx !== i))} className="absolute top-1 right-1 w-5 h-5 bg-black ring-1 ring-white/10 flex items-center justify-center hover:bg-red-900"><XIcon /></button>
                             </div>
                           ))}
                        </div>
                      )}

                      {/* TEXT AREA */}
                      <textarea 
                        value={textContent} 
                        onChange={(e) => setTextContent(e.target.value)} 
                        placeholder="Type a secret message or paste a link..." 
                        className="w-full h-40 bg-white/[0.02] border border-white/10 p-8 text-xl font-medium focus:outline-none focus:border-white transition-all resize-none placeholder-white/5 font-sans" 
                      />
                   </div>

                   {/* SECURITY SETTINGS (TOGGLES) */}
                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="p-6 border border-white/5 bg-white/[0.01] flex items-center justify-between group">
                         <div>
                            <p className="text-[10px] font-black uppercase tracking-widest">End-to-End Encrypt</p>
                            <p className="text-[8px] font-black uppercase opacity-20 group-hover:opacity-40 transition-opacity">Matematikally Secure</p>
                         </div>
                         <div onClick={() => setE2eeEnabled(!e2eeEnabled)} className={`w-12 h-6 border-2 transition-all p-1 cursor-pointer ${e2eeEnabled ? 'border-white bg-white' : 'border-white/20'}`}>
                            <div className={`w-3 h-3 transition-all ${e2eeEnabled ? 'bg-black ml-auto' : 'bg-white/20'}`} />
                         </div>
                      </div>
                      {e2eeEnabled && (
                        <div className="p-4 border border-white/10 flex flex-col justify-center">
                           <input value={encryptionKey} onChange={(e) => setEncryptionKey(e.target.value)} placeholder="Secret Passphrase..." className="bg-transparent text-[10px] font-black uppercase tracking-widest focus:outline-none" />
                        </div>
                      )}

                      <div className="p-6 border border-white/5 bg-white/[0.01] flex items-center justify-between group">
                         <div>
                            <p className="text-[10px] font-black uppercase tracking-widest">Ghost Mode</p>
                            <p className="text-[8px] font-black uppercase opacity-20 group-hover:opacity-40 transition-opacity">Hapus Setelah Scan</p>
                         </div>
                         <div onClick={() => setGhostMode(!ghostMode)} className={`w-12 h-6 border-2 transition-all p-1 cursor-pointer ${ghostMode ? 'border-red-600 bg-red-600' : 'border-white/20'}`}>
                            <div className={`w-3 h-3 transition-all ${ghostMode ? 'bg-white ml-auto' : 'bg-white/20'}`} />
                         </div>
                      </div>

                      <div className="p-6 border border-white/5 bg-white/[0.01] flex items-center justify-between group">
                         <div>
                            <p className="text-[10px] font-black uppercase tracking-widest">PIN Access</p>
                            <p className="text-[8px] font-black uppercase opacity-20 group-hover:opacity-40 transition-opacity">4-Digit Security</p>
                         </div>
                         <div onClick={() => setPinMode(!pinMode)} className={`w-12 h-6 border-2 transition-all p-1 cursor-pointer ${pinMode ? 'border-white bg-white' : 'border-white/20'}`}>
                            <div className={`w-3 h-3 transition-all ${pinMode ? 'bg-black ml-auto' : 'bg-white/20'}`} />
                         </div>
                      </div>
                      {pinMode && (
                        <div className="p-4 border border-white/10 flex flex-col justify-center">
                           <input value={pinCode} onChange={(e) => setPinCode(e.target.value.slice(0, 4))} placeholder="Set PIN..." className="bg-transparent text-[11px] font-black tracking-[0.5em] focus:outline-none" />
                        </div>
                      )}
                   </div>

                   {!isUploading ? (
                     <button onClick={handleUpload} className="w-full py-8 bg-white text-black font-black uppercase tracking-[0.4em] text-lg hover:shadow-[0px_0px_20px_rgba(255,255,255,0.2)] active:scale-95 transition-all">
                       GENERATE BRIDGE
                     </button>
                   ) : (
                     <div className="space-y-4">
                        <div className="h-0.5 bg-white/5"><div className="h-full bg-white transition-all" style={{ width: `${overallProgress}%` }} /></div>
                        <p className="text-[10px] text-center font-black uppercase tracking-widest opacity-40">Tunggu Sebentar... {overallProgress}%</p>
                     </div>
                   )}
                   {error && <p className="text-center text-[10px] font-black uppercase text-red-600 tracking-widest">{error}</p>}
                </div>
              ) : (
                <div className="space-y-12 animate-fade-in py-10">
                   <div className="space-y-4">
                      <h2 className="text-5xl sm:text-7xl font-black tracking-tighter uppercase leading-[0.8] italic">Instant <br /> Receiving</h2>
                      <p className="text-[10px] font-black uppercase tracking-widest opacity-30 leading-relaxed max-w-sm">Siapkan PC ini untuk menerima file dari perangkat lain. Kami akan membuatkan jalur akses khusus.</p>
                   </div>
                   
                   <button onClick={handleReceive} disabled={isUploading} className="w-full py-12 border-2 border-dashed border-white/20 hover:border-white hover:bg-white/5 transition-all group flex flex-col items-center justify-center gap-4">
                      {isUploading ? (
                         <div className="animate-spin text-white opacity-20"><ScanIcon /></div>
                      ) : (
                         <div className="font-black text-2xl uppercase italic tracking-tighter">Open Receive Tunnel</div>
                      )}
                      <p className="text-[9px] font-black uppercase tracking-widest opacity-20">Generate Unique ID & QR</p>
                   </button>
                </div>
              )}
            </div>
          )}

          {(step === 'success' || step === 'waiting') && (
            <div className="animate-scale-in flex flex-col lg:flex-row gap-10 lg:gap-20 items-center py-20">
              <div className="flex-1 space-y-10">
                <div>
                  {downloadedAtLeastOnce && (
                      <div className="bg-red-600 text-white px-5 py-3 mb-8 inline-block animate-bounce shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] ring-1 ring-white/10"><p className="text-[10px] font-black uppercase tracking-widest italic">Penerima Baru Saja Mengunduh Data!</p></div>
                  )}
                  <h2 className="text-5xl sm:text-7xl font-black uppercase tracking-tighter leading-none mb-4">{activeMode === 'send' ? 'Bridge' : 'Tunnel'} <br /><span className="opacity-20 underline italic">Active</span></h2>
                  <p className="text-[11px] font-black uppercase tracking-widest opacity-40 leading-loose max-w-sm">{e2eeEnabled ? '⚠️ SECURED: Anda wajib membagikan Secret Key agar penerima bisa melihat isinya.' : 'Scan QR di samping untuk memindahkan data. Berlaku 30 menit.'}</p>
                </div>
                
                <div className="flex bg-white/5 border border-white/10 p-5 overflow-hidden">
                    <span className="text-[10px] opacity-40 flex-1 truncate font-mono">{step === 'waiting' ? getReceiveURL() : getShareURL()}</span>
                    <button onClick={() => copyLink(step === 'waiting' ? getReceiveURL() : getShareURL())} className="text-xs font-black uppercase hover:underline ml-6 underline-offset-4">{copied ? 'Copied' : 'Copy Link'}</button>
                </div>

                {e2eeEnabled && step === 'success' && (
                  <div className="p-6 border border-white/20 bg-white/5 ring-1 ring-white/5"><p className="text-[9px] font-black uppercase tracking-widest opacity-30 mb-2">Secret Key</p><p className="text-3xl font-black italic tracking-widest">{encryptionKey}</p></div>
                )}

                <button onClick={reset} className="text-[10px] font-black uppercase tracking-widest opacity-40 hover:opacity-100 transition-opacity underline underline-offset-8">Batalkan & Mulai Baru</button>
              </div>
              
              <div className="flex flex-col items-center order-first lg:order-last">
                 <div className="p-8 sm:p-12 bg-white shadow-[20px_20px_0px_0px_rgba(255,255,255,0.05)] border border-white/10"><QRCodeSVG value={step === 'waiting' ? getReceiveURL() : getShareURL()} size={qrSize} level="H" bgColor="#FFFFFF" fgColor="#000000" marginSize={0} /></div>
                 <div className="mt-8 bg-red-600 px-6 py-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"><p className="text-[11px] font-black uppercase tracking-widest">{step === 'waiting' ? 'Scan to Push' : 'Scan to Pull'}</p></div>
              </div>
            </div>
          )}

        </div>

        {/* COMPREHENSIVE FEATURE OVERVIEW (SCROLLABLE) */}
        {step === 'input' && (
           <div className="w-full mt-40 border-t border-white/10 bg-white/[0.01] pt-32 pb-40">
              <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 gap-32">
                 <div className="space-y-6">
                    <div className="w-16 h-1 bg-red-600" />
                    <h4 className="text-5xl font-black uppercase tracking-tighter italic leading-none">Military Grade <br /> Encryption</h4>
                    <p className="text-xs font-black uppercase tracking-[0.3em] opacity-30 leading-loose">Data dikunci menggunakan AES-GCM 256-bit langsung di browser Anda. Kami tidak memiliki kunci untuk melihat isi data Anda.</p>
                 </div>
                 <div className="space-y-6">
                    <div className="w-16 h-1 bg-white" />
                    <h4 className="text-5xl font-black uppercase tracking-tighter italic leading-none">Ghost Mode <br /> Protocol</h4>
                    <p className="text-xs font-black uppercase tracking-[0.3em] opacity-30 leading-loose">Aktifkan protokol penghancuran diri. Sesi akan dihapus permanen dari server segera setelah scan pertama berhasil dilakukan.</p>
                 </div>
              </div>
           </div>
        )}
      </main>

      <footer className="footer w-full p-8 sm:p-12 border-t border-white/5 flex flex-col sm:flex-row justify-between items-center gap-6 opacity-40 hover:opacity-100 transition-opacity">
        <p className="text-[9px] font-black uppercase tracking-widest leading-none">© 2026 / RAFQR PREMIUM / v5.0</p>
        <div className="flex gap-10">
           <p className="text-[9px] font-black uppercase tracking-widest cursor-pointer group" onClick={() => window.location.href = '/admin'}>
              System <span className="group-hover:text-red-500 transition-colors">Admin</span>
           </p>
        </div>
      </footer>
    </div>
  );
}
