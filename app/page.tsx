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

// ─── Icons ───────────────────────────────────────────────────
const XIcon = () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>);
const HistoryIcon = () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m4.5 5.5c-4.142 4.142-10.858 4.142-15 0-4.142-4.142-4.142-10.858 0-15 4.142-4.142 10.858-4.142 15 0m-7.5-12a9 9 0 11-9 9 9 9 0 019-9z" /></svg>);
const ShareIcon = () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>);

// ─── Types ───────────────────────────────────────────────────
interface UploadedFile { fileName: string; fileSize: number; fileType: string; firebaseUrl: string; storageRef: string; }
interface HistoryItem { id: string; type: 'send' | 'receive'; createdAt: number; title: string; }
type Mode = 'send' | 'receive';
type Step = 'input' | 'success' | 'waiting';

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
  const [history, setHistory] = useState<HistoryItem[]>([]);
  
  // Settings Toggles
  const [ghostMode, setGhostMode] = useState(false);
  const [pinMode, setPinMode] = useState(false);
  const [pinCode, setPinCode] = useState('');
  const [e2eeEnabled, setE2eeEnabled] = useState(false);
  const [encryptionKey, setEncryptionKey] = useState('');
  const [customId, setCustomId] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem('rafqr_history');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const fresh = parsed.filter((i: HistoryItem) => Date.now() - i.createdAt < 1800000);
        setHistory(fresh);
      } catch (e) {}
    }
  }, []);

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
        if (step === 'waiting' && res.ok && result.data && (result.data.files || (result.data.textContent && result.data.textContent !== 'WAITING_FOR_UPLOAD'))) {
           window.location.href = `/d/${uniqueId}`;
        }
        if (step === 'success' && res.ok && result.data && result.data.isDownloaded && !downloadedAtLeastOnce) {
           setDownloadedAtLeastOnce(true);
        }
      } catch (err) {}
    }, 3000);
    return () => clearInterval(pollInterval);
  }, [step, uniqueId, downloadedAtLeastOnce]);

  const addToHistory = (id: string, type: 'send' | 'receive', title: string) => {
    const newItem: HistoryItem = { id, type, createdAt: Date.now(), title };
    const updated = [newItem, ...history].slice(0, 5);
    setHistory(updated);
    localStorage.setItem('rafqr_history', JSON.stringify(updated));
  };

  const handleReceive = async () => {
      const id = customId.trim() || nanoid(10);
      setUniqueId(id); setIsUploading(true);
      try {
        const res = await fetch('/api/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, textContent: 'WAITING_FOR_UPLOAD' }),
        });
        if (!res.ok) throw new Error("ID sudah digunakan");
        setStep('waiting');
        addToHistory(id, 'receive', 'Penerimaan Data');
      } catch (err: any) { setError(err.message); }
      setIsUploading(false);
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0 && !textContent.trim()) { setError('Unggah file atau masukkan teks.'); return; }
    if (pinMode && (pinCode.length < 4)) { setError('PIN minimal 4 karakter.'); return; }
    if (e2eeEnabled && (encryptionKey.length < 6)) { setError('Secret E2EE minimal 6 karakter.'); return; }
    
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

      const senderId = customId.trim() || nanoid(10);
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: senderId, files: uploadedFiles.length > 0 ? uploadedFiles : undefined, textContent: finalText || undefined, ghost: ghostMode, pin: pinMode ? pinCode : undefined, e2ee: e2eeEnabled }),
      });
      if (!res.ok) throw new Error("Gagal membuat sesi.");
      setUniqueId(senderId); setStep('success');
      addToHistory(senderId, 'send', selectedFiles[0]?.name || 'Pesan Teks');
    } catch (err: any) { setError(err.message || 'Error.'); }
    finally { setIsUploading(false); }
  };

  const copyLink = async (url: string) => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch (e) {}
  };

  return (
    <div className="min-h-screen bg-black text-white selection:bg-white selection:text-black font-sans flex flex-col overflow-x-hidden">
      {/* MONOCHROME OVERLAY */}
      <div className="fixed inset-0 z-0 pointer-events-none opacity-[0.03] bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />

      {/* NAVBAR */}
      <nav className="relative z-10 p-6 sm:p-10 border-b border-white/5 bg-black/80 backdrop-blur sticky top-0 flex justify-between items-center">
        <button onClick={() => setStep('input')} className="flex items-center gap-3">
          <Logo size={24} />
          <h1 className="text-lg font-black tracking-tighter uppercase italic">RafQR</h1>
        </button>
        <button onClick={() => window.location.href = '/scan'} className="bg-white text-black px-6 py-2 text-[9px] font-black uppercase tracking-widest hover:invert transition-all">
           SCAN
        </button>
      </nav>

      <main className="relative z-10 flex-1 flex flex-col pt-12 sm:pt-24 px-6">
        
        {/* HERO */}
        <section className="text-center max-w-5xl mx-auto space-y-8 mb-16 sm:mb-24 animate-fade-in">
           <h2 className="text-5xl sm:text-8xl md:text-[10rem] font-black tracking-tighter uppercase leading-[0.8] italic">
              BRIDGE <br /> YOUR <br /> <span className="text-outline">DATA</span>
           </h2>
           <p className="text-[10px] sm:text-xs font-black uppercase tracking-[0.3em] opacity-40 max-w-2xl mx-auto italic leading-loose">
              Transfer file & teks instan antar perangkat. <br /> Tanpa akun. Tanpa jejak. Enkripsi lokal.
           </p>
        </section>

        <div className="max-w-3xl mx-auto w-full flex-1 flex flex-col mb-40">
          {step === 'input' && (
            <div className="space-y-12 animate-fade-in">
              {/* TOGGLE */}
              <div className="flex bg-white/5 border border-white/10 p-1">
                 <button onClick={() => setActiveMode('send')} className={`flex-1 py-5 text-[10px] sm:text-[11px] font-black uppercase tracking-[0.4em] transition-all ${activeMode === 'send' ? 'bg-white text-black' : 'opacity-30 hover:opacity-100'}`}>SEND</button>
                 <button onClick={() => setActiveMode('receive')} className={`flex-1 py-5 text-[10px] sm:text-[11px] font-black uppercase tracking-[0.4em] transition-all ${activeMode === 'receive' ? 'bg-white text-black' : 'opacity-30 hover:opacity-100'}`}>RECEIVE</button>
              </div>

              {activeMode === 'send' ? (
                <div className="space-y-10">
                   {/* INPUT */}
                   <div className="border border-white/10 bg-white/[0.02] p-1.5 ring-1 ring-white/5">
                      <div 
                        onClick={() => fileInputRef.current?.click()}
                        onDragOver={(e) => e.preventDefault()} onDragEnter={() => setIsDragging(true)} onDragLeave={() => setIsDragging(false)} onDrop={(e) => { e.preventDefault(); setIsDragging(false); setSelectedFiles(p => [...p, ...Array.from(e.dataTransfer.files)]); }}
                        className={`p-12 sm:p-20 border border-dashed transition-all cursor-pointer text-center ${isDragging ? 'border-white bg-white/5' : 'border-white/10 hover:border-white/20'}`}
                      >
                         <h3 className="text-3xl sm:text-4xl font-black uppercase italic tracking-tighter mb-1">Upload</h3>
                         <p className="text-[9px] font-black uppercase opacity-20 tracking-widest italic">Max total 50MB</p>
                         <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => setSelectedFiles(p => [...p, ...Array.from(e.target.files || [])])} />
                      </div>
                      <textarea value={textContent} onChange={(e) => setTextContent(e.target.value)} placeholder="Tulis catatan..." className="w-full h-32 bg-transparent border-t border-white/5 p-6 text-lg focus:outline-none placeholder-white/5 resize-none" />
                   </div>

                   {selectedFiles.length > 0 && (
                      <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                        {selectedFiles.map((f, i) => (
                          <div key={i} className="aspect-square bg-white/5 border border-white/10 flex items-center justify-center relative group">
                            <span className="text-[8px] font-black opacity-20 text-center uppercase tracking-tighter px-1 truncate">{f.name}</span>
                            <button onClick={() => setSelectedFiles(p => p.filter((_, idx) => idx !== i))} className="absolute inset-0 bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"><XIcon /></button>
                          </div>
                        ))}
                      </div>
                   )}

                   {/* SETTINGS */}
                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px] font-black uppercase tracking-widest">
                      <div onClick={() => setE2eeEnabled(!e2eeEnabled)} className={`p-6 border border-white/5 bg-white/[0.01] flex justify-between items-center cursor-pointer transition-all ${e2eeEnabled ? 'bg-white text-black' : 'hover:bg-white/5'}`}>
                         <span>E2EE Locked</span>
                         <span>{e2eeEnabled ? '[ON]' : '[OFF]'}</span>
                      </div>
                      {e2eeEnabled && <div className="p-5 border border-white/10 bg-white/5"><input value={encryptionKey} onChange={(e) => setEncryptionKey(e.target.value)} placeholder="Secret Key..." className="bg-transparent w-full focus:outline-none" /></div>}

                      <div onClick={() => setGhostMode(!ghostMode)} className={`p-6 border border-white/5 bg-white/[0.01] flex justify-between items-center cursor-pointer transition-all ${ghostMode ? 'bg-white text-black' : 'hover:bg-white/5'}`}>
                         <span>Ghost Mode</span>
                         <span>{ghostMode ? '[ON]' : '[OFF]'}</span>
                      </div>

                      <div onClick={() => setPinMode(!pinMode)} className={`p-6 border border-white/5 bg-white/[0.01] flex justify-between items-center cursor-pointer transition-all ${pinMode ? 'bg-white text-black' : 'hover:bg-white/5'}`}>
                         <span>Pin Access</span>
                         <span>{pinMode ? '[ON]' : '[OFF]'}</span>
                      </div>
                      {pinMode && <div className="p-5 border border-white/10 bg-white/5"><input type="password" value={pinCode} onChange={(e) => setPinCode(e.target.value.slice(0, 4))} placeholder="Set PIN..." className="bg-transparent w-full focus:outline-none tracking-widest" /></div>}

                      <div className="p-6 border border-white/5 bg-white/[0.01] flex flex-col gap-2">
                         <span className="opacity-30">Custom ID</span>
                         <input value={customId} onChange={(e) => setCustomId(e.target.value.replace(/[^a-zA-Z0-9-]/g, '').toLowerCase())} placeholder="link-custom" className="bg-transparent border-b border-white/10 focus:border-white focus:outline-none p-1" />
                      </div>
                   </div>

                   {/* ACTIVATE */}
                   <div className="pt-8">
                      {!isUploading ? (
                        <button onClick={handleUpload} className="w-full py-8 bg-white text-black font-black uppercase tracking-[0.5em] text-xl hover:invert transition-all italic">OPEN BRIDGE</button>
                      ) : (
                        <div className="space-y-4">
                           <div className="h-1 bg-white/10 w-full"><div className="h-full bg-white transition-all duration-300" style={{ width: `${overallProgress}%` }} /></div>
                           <p className="text-center text-[9px] font-black uppercase tracking-[0.3em] opacity-40 animate-pulse">Processing... {overallProgress}%</p>
                        </div>
                      )}
                      {error && <p className="text-center text-[10px] font-black uppercase tracking-widest text-white underline underline-offset-8 mt-10">{error}</p>}
                   </div>
                </div>
              ) : (
                <div className="space-y-12 py-12 animate-fade-in text-center">
                   <h2 className="text-6xl font-black italic tracking-tighter uppercase opacity-10">Receiver</h2>
                   <div className="p-8 border border-white/10 bg-white/[0.02] max-w-sm mx-auto space-y-6">
                      <input value={customId} onChange={(e) => setCustomId(e.target.value)} placeholder="CUSTOM_TUNNEL_ID" className="w-full bg-black border border-white/10 p-4 text-[10px] font-black uppercase tracking-widest focus:outline-none focus:border-white" />
                      <button onClick={handleReceive} disabled={isUploading} className="w-full py-16 border-2 border-dashed border-white/10 hover:border-white hover:bg-white/5 transition-all font-black text-2xl uppercase italic tracking-tighter">Listen</button>
                   </div>
                </div>
              )}

              {/* HISTORY */}
              {history.length > 0 && (
                <div className="pt-24 border-t border-white/5 opacity-40 hover:opacity-100 transition-opacity">
                   <h4 className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.4em] mb-6">Recent Records</h4>
                   <div className="space-y-1">
                      {history.map((h, i) => (
                        <div key={i} className="p-4 border border-white/5 flex justify-between items-center group cursor-pointer hover:bg-white/5" onClick={() => window.location.href = `/d/${h.id}`}>
                           <p className="text-[9px] font-black uppercase">{h.title}</p>
                           <p className="text-[8px] font-black uppercase opacity-20 group-hover:opacity-100">/{h.id}</p>
                        </div>
                      ))}
                   </div>
                </div>
              )}
            </div>
          )}

          {(step === 'success' || step === 'waiting') && (
            <div className="animate-scale-in flex flex-col items-center py-12 sm:py-24 space-y-20">
              <div className="flex flex-col lg:flex-row gap-16 items-center w-full">
                <div className="flex-1 space-y-10 text-center lg:text-left">
                   {downloadedAtLeastOnce && <div className="bg-white text-black px-6 py-2 inline-block font-black text-[10px] uppercase tracking-widest italic animate-bounce">SYNC_COMPLETE</div>}
                   <h2 className="text-7xl sm:text-9xl font-black uppercase tracking-tighter leading-none italic">LIVE<br /><span className="text-outline">BRIDGE</span></h2>
                   
                   <div className="space-y-4 pt-10">
                      <div className="flex flex-col sm:flex-row gap-2">
                         <div className="flex-1 p-5 bg-white/5 border border-white/10 text-left overflow-hidden">
                            <span className="text-[7px] font-black uppercase opacity-20 block mb-1">ID</span>
                            <span className="text-[10px] font-mono uppercase opacity-40">{uniqueId}</span>
                         </div>
                         <button onClick={() => copyLink(step === 'waiting' ? getReceiveURL() : getShareURL())} className="bg-white text-black px-8 py-4 text-[10px] font-black uppercase tracking-widest hover:invert active:scale-95 transition-all">COPY</button>
                      </div>
                      <button onClick={async () => {
                         const url = step === 'waiting' ? getReceiveURL() : getShareURL();
                         if (navigator.share) await navigator.share({ url }); else copyLink(url);
                      }} className="w-full py-4 border border-white/10 text-[10px] font-black uppercase tracking-widest hover:bg-white/5 transition-all flex items-center justify-center gap-3">
                         <ShareIcon /> SHARE TO PHONE
                      </button>
                   </div>
                   {e2eeEnabled && step === 'success' && (
                      <div className="p-10 border border-white/10 bg-white/5 text-left">
                        <span className="text-[9px] font-black uppercase opacity-20 mb-4 block">E2EE_KEY</span>
                        <p className="text-4xl sm:text-6xl font-black italic break-all tracking-widest">{encryptionKey}</p>
                      </div>
                   )}
                   <button onClick={() => setStep('input')} className="text-[9px] font-black uppercase tracking-[0.4em] opacity-20 hover:opacity-100 transition-opacity underline underline-offset-8 mt-10">Dispose Session</button>
                </div>
                
                <div className="order-first lg:order-last p-10 bg-white shadow-[20px_20px_0px_0px_rgba(255,255,255,0.05)]">
                   <QRCodeSVG 
                      value={step === 'waiting' ? getReceiveURL() : getShareURL()} 
                      size={qrSize} 
                      level="H" 
                      bgColor="#FFFFFF" 
                      fgColor="#000000" 
                      marginSize={0}
                   />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* DETAILS */}
        <div className="w-full py-40 bg-white/[0.01] border-t border-white/5">
           <div className="max-w-6xl mx-auto space-y-48">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-16 md:gap-24 opacity-60">
                 <div className="space-y-6">
                    <h5 className="text-[9px] font-black tracking-[0.5em] uppercase opacity-40 border-b border-white/10 pb-4 inline-block">Protocol 01</h5>
                    <h4 className="text-3xl font-black uppercase italic tracking-tighter">Fast Bridge</h4>
                    <p className="text-[10px] font-black uppercase tracking-widest leading-loose opacity-30 italic">Transfer file maksimal 50MB secara instan tanpa kabel.</p>
                 </div>
                 <div className="space-y-6">
                    <h5 className="text-[9px] font-black tracking-[0.5em] uppercase opacity-40 border-b border-white/10 pb-4 inline-block">Protocol 02</h5>
                    <h4 className="text-3xl font-black uppercase italic tracking-tighter">Encryption</h4>
                    <p className="text-[10px] font-black uppercase tracking-widest leading-loose opacity-30 italic">AES-GCM 256-bit dienkripsi langsung di browser pengirim.</p>
                 </div>
                 <div className="space-y-6">
                    <h5 className="text-[9px] font-black tracking-[0.5em] uppercase opacity-40 border-b border-white/10 pb-4 inline-block">Protocol 03</h5>
                    <h4 className="text-3xl font-black uppercase italic tracking-tighter">Disposition</h4>
                    <p className="text-[10px] font-black uppercase tracking-widest leading-loose opacity-30 italic">Data dihapus dalam 30 menit atau sekali scan (Ghost Mode).</p>
                 </div>
              </div>
           </div>
        </div>
      </main>

      <footer className="relative z-10 w-full p-12 py-20 border-t border-white/5 flex flex-col sm:flex-row justify-between items-center opacity-40 font-black text-[9px] uppercase tracking-widest">
         <p>RafQR / LetnanRaffi</p>
         <p onClick={() => window.location.href = '/admin'} className="cursor-pointer hover:text-white transition-colors">Internal System</p>
      </footer>

      <style jsx global>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in { animation: fadeIn 0.8s ease-out; }
        .text-outline { -webkit-text-stroke: 1px rgba(255,255,255,0.2); color: transparent !important; }
      `}</style>
    </div>
  );
}
