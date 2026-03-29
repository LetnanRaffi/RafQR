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
const ArrowLeftIcon = () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>);
const LockIcon = () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>);
const ScanIcon = () => (<svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5c-.621 0-1.125-.504-1.125-1.125v-4.5z" /><path strokeLinecap="round" strokeLinejoin="round" d="M16.875 12h1.125m-1.125 3h1.125m-1.125 3h1.125M12 12h1.125m-1.125 3h1.125m-1.125 3h1.125" /></svg>);
const ShareIcon = () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" /></svg>);
const HistoryIcon = () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m4.5 5.5c-4.142 4.142-10.858 4.142-15 0-4.142-4.142-4.142-10.858 0-15 4.142-4.142 10.858-4.142 15 0m-7.5-12a9 9 0 11-9 9 9 9 0 019-9z" /></svg>);

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
  const [broadcast, setBroadcast] = useState(true); 
  const [e2eeEnabled, setE2eeEnabled] = useState(false);
  const [encryptionKey, setEncryptionKey] = useState('');
  const [customId, setCustomId] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize History
  useEffect(() => {
    const saved = localStorage.getItem('rafqr_history');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Filter out items older than 30 mins
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
        if (step === 'waiting') { if (res.ok && result.data && (result.data.files || (result.data.textContent && result.data.textContent !== 'WAITING_FOR_UPLOAD'))) window.location.href = `/d/${uniqueId}`; }
        if (step === 'success') { if (res.ok && result.data && result.data.isDownloaded && !downloadedAtLeastOnce) setDownloadedAtLeastOnce(true); }
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
        if (!res.ok) throw new Error("ID Sesi sudah digunakan.");
        setStep('waiting');
        addToHistory(id, 'receive', 'Sesi Terima File');
      } catch (err: any) { setError(err.message); }
      setIsUploading(false);
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0 && !textContent.trim()) { setError('Berikan data (File atau Teks) untuk dikirim.'); return; }
    if (pinMode && (pinCode.length < 4)) { setError('PIN minimal 4 karakter.'); return; }
    if (e2eeEnabled && (encryptionKey.length < 6)) { setError('Secret E2EE minimal 6 karakter.'); return; }
    const totalBytes = selectedFiles.reduce((acc, f) => acc + f.size, 0);
    if (totalBytes > 50 * 1024 * 1024) { setError('Total file melebihi batas 50MB.'); return; }

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
        body: JSON.stringify({ id: senderId, files: uploadedFiles.length > 0 ? uploadedFiles : undefined, textContent: finalText || undefined, ghost: ghostMode, pin: pinMode ? pinCode : undefined, broadcast: broadcast, e2ee: e2eeEnabled }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "ID Sesi sudah digunakan.");
      setUniqueId(result.uniqueId); setStep('success');
      addToHistory(result.uniqueId, 'send', selectedFiles[0]?.name || 'Pesan Teks');
      try {
        uploadedFiles.forEach(f => {
          fetch('/api/analytics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'transfer', fileId: result.uniqueId, fileSize: f.fileSize, fileName: f.fileName }), });
        });
      } catch (err) {}
    } catch (err: any) { setError(err.message || 'Gagal mengirim data.'); }
    finally { setIsUploading(false); }
  };

  const reset = () => { setStep('input'); setSelectedFiles([]); setTextContent(''); setUniqueId(null); setError(null); setDownloadedAtLeastOnce(false); setCustomId(''); };
  const getShareURL = () => (typeof window !== 'undefined' ? `${window.location.origin}/d/${uniqueId}` : '');
  const getReceiveURL = () => (typeof window !== 'undefined' ? `${window.location.origin}/u/${uniqueId}` : '');
  const copyLink = async (url: string) => {
    try { await navigator.clipboard.writeText(url); } catch (err) {
      const t = document.createElement("textarea"); t.value = url; document.body.appendChild(t); t.select(); document.execCommand('copy'); document.body.removeChild(t);
    }
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };
  const handleShare = async () => {
    const url = step === 'waiting' ? getReceiveURL() : getShareURL();
    if (navigator.share) {
      try { await navigator.share({ title: 'RafQR Bridge', text: 'Ambil datanya di sini:', url }); } catch (e) {}
    } else { copyLink(url); }
  };

  return (
    <div className="min-h-screen bg-black text-white selection:bg-white selection:text-black font-sans flex flex-col relative overflow-hidden">
      
      {/* BACKGROUND DECORATION */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-20 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-white/5 blur-[120px] rounded-full pointer-events-none" />

      {/* ─── NAVBAR ─────────────────────────────────────────── */}
      <nav className="relative z-10 p-6 sm:p-10 border-b border-white/5 bg-black/40 backdrop-blur sticky top-0 flex justify-between items-center">
        <button onClick={reset} className="flex items-center gap-3">
          <Logo size={28} />
          <h1 className="text-xl font-black tracking-tighter uppercase italic">RafQR</h1>
        </button>
        <button onClick={() => window.location.href = '/scan'} className="bg-white text-black px-6 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-white/90 active:scale-95 transition-all shadow-[6px_6px_0px_0px_rgba(255,255,255,0.1)]">
           Pindai QR
        </button>
      </nav>

      <main className="relative z-10 flex-1 flex flex-col pt-16">
        
        {/* HERO BRANDING */}
        <section className="pt-12 px-6 text-center max-w-5xl mx-auto space-y-10 mb-16 sm:mb-20">
           <div className="inline-flex items-center gap-3 px-4 py-2 bg-white/5 border border-white/10 text-[9px] font-black tracking-[0.4em] uppercase">
              <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
              SYSTEM_READY_BRIDGE_ESTABLISHED
           </div>
           <h2 className="text-6xl sm:text-[10rem] font-black tracking-tighter uppercase leading-[0.75] italic">
              BRIDGE <br /> YOUR <br /> <span className="text-outline">DATA</span>
           </h2>
           <p className="text-xs sm:text-base font-black uppercase tracking-[0.2em] opacity-40 max-w-4xl mx-auto leading-relaxed italic">
              Platform transfer ephemeral paling aman untuk tim dan kreator. <br /> Sekali kirim, sekali scan, hancur selamanya.
           </p>
        </section>

        <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col px-6">
          {step === 'input' && (
            <div className="animate-fade-in space-y-12 pb-40">
              
              {/* MAIN CHOICE TOGGLE */}
              <div className="flex bg-white/5 border border-white/10 p-1 mt-12 shadow-[12px_12px_0px_0px_rgba(255,255,255,0.02)]">
                 <button onClick={() => setActiveMode('send')} className={`flex-1 py-7 text-[12px] font-black uppercase tracking-[0.5em] transition-all ${activeMode === 'send' ? 'bg-white text-black' : 'opacity-40 hover:opacity-100'}`}>KIRIM DATA</button>
                 <button onClick={() => setActiveMode('receive')} className={`flex-1 py-7 text-[12px] font-black uppercase tracking-[0.5em] transition-all ${activeMode === 'receive' ? 'bg-white text-black' : 'opacity-40 hover:opacity-100'}`}>TERIMA DATA</button>
              </div>

              {activeMode === 'send' ? (
                <div className="space-y-12 animate-fade-in">
                   {/* UNIFIED CREATOR PANEL */}
                   <div className="bg-white/5 border border-white/10 p-2 space-y-2 relative overflow-hidden ring-1 ring-white/5">
                      <div className="absolute top-0 right-0 p-4 opacity-10 font-black text-[8px] uppercase tracking-widest italic">Encrypted_Socket_Active</div>
                      <div 
                        className={`p-10 sm:p-16 border-2 border-dashed transition-all cursor-pointer text-center ${isDragging ? 'border-white bg-white/10' : 'border-white/5 hover:border-white/20'}`} 
                        onDragOver={(e) => e.preventDefault()} onDragEnter={() => setIsDragging(true)} onDragLeave={() => setIsDragging(false)} onDrop={(e) => { e.preventDefault(); setIsDragging(false); setSelectedFiles(p => [...p, ...Array.from(e.dataTransfer.files)]); }} 
                        onClick={() => fileInputRef.current?.click()}
                      >
                         <h3 className="text-4xl sm:text-5xl font-black uppercase italic tracking-tighter mb-2">Pilih Aset</h3>
                         <p className="text-[10px] font-black uppercase opacity-20 tracking-widest leading-loose italic">
                           Tarik Media Di Sini <br /> 
                           <span className="text-red-500 font-black opacity-100">(Limit Sesi 50MB)</span>
                         </p>
                         <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => setSelectedFiles(p => [...p, ...Array.from(e.target.files || [])])} />
                      </div>
                      <textarea value={textContent} onChange={(e) => setTextContent(e.target.value)} placeholder="Tulis catatan rahasia di sini..." className="w-full h-48 bg-transparent border-t border-white/5 p-8 text-xl font-medium focus:outline-none placeholder-white/5 font-sans resize-none" />
                   </div>

                   {/* ADVANCED SETTINGS */}
                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* E2EE */}
                      <div className="p-6 sm:p-8 border border-white/10 bg-white/[0.02] flex items-center justify-between group">
                         <div><p className="text-[11px] font-black uppercase tracking-widest">Enkripsi Militer</p><p className="text-[8px] font-black uppercase opacity-20 italic">AES-GCM Local Unlock</p></div>
                         <div onClick={() => setE2eeEnabled(!e2eeEnabled)} className={`w-14 h-7 border-2 transition-all p-1 cursor-pointer ${e2eeEnabled ? 'border-white bg-white ring-8 ring-white/5' : 'border-white/20'}`}><div className={`w-4 h-4 transition-all ${e2eeEnabled ? 'bg-black ml-auto' : 'bg-white/20'}`} /></div>
                      </div>
                      {e2eeEnabled && <div className="p-6 border border-white/20 bg-white/5"><input value={encryptionKey} onChange={(e) => setEncryptionKey(e.target.value)} placeholder="Kata Kunci Rahasia..." className="bg-transparent text-[11px] font-black uppercase tracking-widest focus:outline-none w-full italic" /></div>}

                      {/* GHOST MODE */}
                      <div className="p-6 sm:p-8 border border-white/10 bg-white/[0.02] flex items-center justify-between group">
                         <div><p className="text-[11px] font-black uppercase tracking-widest text-red-500">Ghost Mode</p><p className="text-[8px] font-black uppercase opacity-20 italic">Hancur Setelah Scan</p></div>
                         <div onClick={() => setGhostMode(!ghostMode)} className={`w-14 h-7 border-2 transition-all p-1 cursor-pointer ${ghostMode ? 'border-red-600 bg-red-600' : 'border-white/20'}`}><div className={`w-4 h-4 transition-all ${ghostMode ? 'bg-white ml-auto' : 'bg-white/20'}`} /></div>
                      </div>

                      {/* CUSTOM ID */}
                      <div className="p-6 sm:p-8 border border-white/10 bg-white/[0.02] flex flex-col justify-center gap-3">
                         <div className="flex items-center justify-between"><p className="text-[11px] font-black uppercase tracking-widest">Custom Link ID</p><p className="text-[8px] font-black uppercase opacity-10">Opsional</p></div>
                         <input value={customId} onChange={(e) => setCustomId(e.target.value.replace(/[^a-zA-Z0-9-]/g, '').toLowerCase())} placeholder="misal: file-kerja" className="bg-transparent border-b border-white/10 py-1 text-xs font-black uppercase tracking-widest focus:border-white focus:outline-none transition-all placeholder:opacity-20" />
                      </div>

                      {/* PIN PROTECTION */}
                      <div className="p-6 sm:p-8 border border-white/10 bg-white/[0.02] flex items-center justify-between group">
                         <div><p className="text-[11px] font-black uppercase tracking-widest">Akses PIN</p><p className="text-[8px] font-black uppercase opacity-20 italic">Kunci Sesi 4-Digit</p></div>
                         <div onClick={() => setPinMode(!pinMode)} className={`w-14 h-7 border-2 transition-all p-1 cursor-pointer ${pinMode ? 'border-white bg-white' : 'border-white/20'}`}><div className={`w-4 h-4 transition-all ${pinMode ? 'bg-black ml-auto' : 'bg-white/20'}`} /></div>
                      </div>
                      {pinMode && <div className="p-6 border border-white/20 bg-white/5"><input value={pinCode} onChange={(e) => setPinCode(e.target.value.slice(0, 4))} placeholder="Set 4-Digit PIN..." className="bg-transparent text-2xl font-black tracking-[0.6em] focus:outline-none w-full" /></div>}
                   </div>

                   {/* ACTION BUTTON */}
                   <div className="pt-8">
                      {!isUploading ? (
                        <button onClick={handleUpload} className="w-full py-12 bg-white text-black font-black uppercase tracking-[0.5em] text-2xl hover:shadow-[0px_0px_40px_rgba(255,255,255,0.2)] active:scale-[0.98] transition-all italic">GENERATE BRIDGE</button>
                      ) : (
                        <div className="space-y-6">
                           <div className="h-1.5 bg-white/10 w-full"><div className="h-full bg-white transition-all duration-300" style={{ width: `${overallProgress}%` }} /></div>
                           <p className="text-center text-[10px] font-black uppercase tracking-widest animate-pulse opacity-40">Membangun Jalur Aman... {overallProgress}%</p>
                        </div>
                      )}
                      {error && <p className="text-center text-[11px] font-black uppercase text-red-600 tracking-[0.2em] mt-8 italic underline underline-offset-8 transition-all animate-bounce">{error}</p>}
                   </div>
                </div>
              ) : (
                <div className="space-y-16 animate-fade-in py-20 text-center">
                   <div className="space-y-6">
                      <h2 className="text-8xl font-black tracking-tighter uppercase italic leading-[0.8] mb-10">Ready To <br /><span className="text-outline">Receive</span></h2>
                      <p className="text-xs font-black uppercase tracking-[0.4em] opacity-30 leading-loose max-w-2xl mx-auto">PC ini akan bertindak sebagai server sementara untuk menerima aset apa pun dari perangkat lain.</p>
                   </div>
                   
                   <div className="p-6 sm:p-10 border border-white/10 bg-white/[0.02] max-w-sm mx-auto">
                      <p className="text-[10px] font-black uppercase tracking-widest opacity-30 mb-4 text-left">Link ID Kustom (Opsional)</p>
                      <input value={customId} onChange={(e) => setCustomId(e.target.value)} placeholder="misal: terima-laporan" className="w-full bg-black/50 border border-white/10 p-4 text-xs font-black uppercase tracking-widest focus:outline-none focus:border-white mb-6" />
                      <button onClick={handleReceive} disabled={isUploading} className="w-full py-16 border-2 border-dashed border-white/10 hover:border-white/40 hover:bg-white/5 transition-all group flex flex-col items-center justify-center gap-6">
                         <div className="font-black text-3xl uppercase italic tracking-tighter group-hover:scale-110 transition-transform">Create Tunnel</div>
                      </button>
                   </div>
                </div>
              )}

              {/* LOCAL HISTORY */}
              {history.length > 0 && (
                <div className="mt-20 border-t border-white/10 pt-16 animate-fade-in">
                   <div className="flex items-center gap-3 mb-8 opacity-30"><HistoryIcon /><h4 className="text-[10px] font-black uppercase tracking-[0.5em]">History Lokal Terakhir</h4></div>
                   <div className="space-y-2">
                      {history.map((h, i) => (
                        <div key={i} className="flex items-center justify-between p-6 border border-white/5 bg-white/[0.02] hover:bg-white/[0.05] transition-all cursor-pointer group" onClick={() => window.location.href = `/d/${h.id}`}>
                           <div className="flex gap-4 items-center">
                              <span className={`w-1.5 h-1.5 rounded-full ${h.type === 'send' ? 'bg-green-500' : 'bg-blue-500'}`} />
                              <p className="text-[10px] font-black uppercase truncate max-w-[200px]">{h.title}</p>
                           </div>
                           <p className="text-[9px] font-black uppercase opacity-20 group-hover:opacity-100 transition-opacity">/{h.id}</p>
                        </div>
                      ))}
                      <button onClick={() => { localStorage.removeItem('rafqr_history'); setHistory([]); }} className="text-[8px] font-black uppercase tracking-widest opacity-20 hover:opacity-100 italic mt-4">Clear History</button>
                   </div>
                </div>
              )}
            </div>
          )}

          {(step === 'success' || step === 'waiting') && (
            <div className="animate-scale-in flex flex-col items-center py-20 pb-48 text-center sm:text-left">
              <div className="flex flex-col lg:flex-row gap-20 items-center justify-center w-full">
                <div className="flex-1 space-y-12">
                   {downloadedAtLeastOnce && (
                      <div className="bg-red-600 text-white px-8 py-4 inline-block shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] ring-2 ring-white/10 animate-bounce"><p className="text-xs font-black uppercase tracking-[0.3em] italic">PACKET DOWNLOADED!</p></div>
                   )}
                   <h2 className="text-8xl sm:text-9xl font-black uppercase tracking-tighter leading-none italic">SESI <br /><span className="opacity-10 text-outline">LIVE_STATION</span></h2>
                   <p className="text-[11px] font-black uppercase tracking-[0.3em] opacity-30 leading-loose max-w-md">{e2eeEnabled ? '⚠️ SECURED: Berikan kata kunci rahasia Anda ke penerima secara manual.' : 'Sesi aktif selama 30 menit. Silakan pindai QR di samping untuk mengambil data.'}</p>
                   
                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-10">
                      <div className="flex flex-col p-6 bg-white/5 border border-white/10 overflow-hidden text-left">
                         <span className="text-[8px] font-black uppercase opacity-20 mb-2">Bridge URL</span>
                         <div className="flex justify-between items-center gap-4">
                            <span className="text-[10px] opacity-40 truncate font-mono uppercase tracking-widest">{step === 'waiting' ? getReceiveURL() : getShareURL()}</span>
                            <button onClick={() => copyLink(step === 'waiting' ? getReceiveURL() : getShareURL())} className="text-[9px] font-black uppercase hover:underline underline-offset-8 transition-all">{copied ? 'COPIED' : 'COPY'}</button>
                         </div>
                      </div>
                      <button onClick={handleShare} className="py-6 bg-white text-black font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 hover:bg-neutral-200">
                         <ShareIcon /> SHARE TO PHONE
                      </button>
                   </div>

                   {e2eeEnabled && step === 'success' && (
                     <div className="p-8 border-2 border-white/10 bg-white/5 text-left"><p className="text-[9px] font-black uppercase tracking-[0.5em] mb-4 opacity-40">E2EE Secret Token</p><p className="text-6xl font-black italic tracking-widest bg-gradient-to-r from-white to-white/40 bg-clip-text text-transparent break-all">{encryptionKey}</p></div>
                   )}

                   <button onClick={reset} className="text-[10px] font-black uppercase tracking-[0.4em] opacity-20 hover:opacity-100 transition-opacity underline underline-offset-[14px]">Kill Bridge & Pull New</button>
                </div>
                
              <div className="flex flex-col items-center order-first lg:order-last">
                 <div className="p-8 sm:p-12 bg-white shadow-[30px_30px_0px_0px_rgba(255,255,255,0.03)] border border-white/10 drop-shadow-[0_20px_50px_rgba(255,255,255,0.05)] relative group">
                   <div className="absolute inset-0 bg-red-600 opacity-0 group-hover:opacity-5 transition-opacity" />
                   <QRCodeSVG 
                      value={step === 'waiting' ? getReceiveURL() : getShareURL()} 
                      size={qrSize} 
                      level="H" 
                      bgColor="#FFFFFF" 
                      fgColor="#ef4444" 
                      marginSize={0}
                   />
                 </div>
                 <div className="mt-12 bg-red-600 text-white px-10 py-3 shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] ring-1 ring-white/10"><p className="text-xs font-black uppercase tracking-[0.5em] italic">{step === 'waiting' ? 'SCAN TO PUSH DATA' : 'SCAN TO PULL DATA'}</p></div>
              </div>
              </div>
            </div>
          )}
        </div>

        {/* ─── COMPREHENSIVE LANDING SECTION (BAHASA) ──────────────── */}
        <div className="w-full bg-white/[0.01] border-t border-white/5 py-48">
           <div className="max-w-6xl mx-auto px-6 space-y-64">
              
              {/* BRANDING SECTION */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-32 items-end">
                 <div>
                    <h3 className="text-6xl sm:text-8xl font-black tracking-tighter uppercase italic leading-[0.8]">Kenapa <br /> Harus <br /> RafQR?</h3>
                    <div className="h-1 w-24 bg-red-600 mt-10" />
                 </div>
                 <p className="text-sm sm:text-lg font-black uppercase tracking-[0.3em] opacity-30 leading-loose italic">
                    Memindahkan file antar HP ke PC (atau sebaliknya) adalah "penyakit" bagi produktivitas. Kami hadir sebagai obat yang paling instan dan privat.
                 </p>
              </div>

              {/* THREE PILLARS */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-20">
                 <div className="space-y-6 md:space-y-10 group">
                    <div className="text-6xl md:text-[8rem] font-black opacity-5 italic leading-none group-hover:text-red-600 transition-colors duration-500">01</div>
                    <div className="space-y-4">
                       <h4 className="text-3xl md:text-4xl font-black uppercase italic tracking-tighter">Instant Bridge</h4>
                       <p className="text-[11px] font-black uppercase tracking-[0.2em] opacity-30 leading-relaxed italic">
                          Tanpa kabel, tanpa Bluetooth, tanpa ribet. Cukup pakai kamera HP Anda untuk memindahkan file 50MB dalam hitungan detik.
                       </p>
                    </div>
                 </div>
                 <div className="space-y-6 md:space-y-10 group border-t border-white/5 pt-10 md:border-t-0 md:pt-0">
                    <div className="text-6xl md:text-[8rem] font-black opacity-5 italic leading-none group-hover:text-white transition-colors duration-500">02</div>
                    <div className="space-y-4">
                       <h4 className="text-3xl md:text-4xl font-black uppercase italic tracking-tighter">E2EE Privacy</h4>
                       <p className="text-[11px] font-black uppercase tracking-[0.2em] opacity-30 leading-relaxed italic">
                          Data dienkripsi sebelum meninggalkan browser Anda. Tidak ada yang bisa melihat isinya, termasuk server kami sekalipun.
                       </p>
                    </div>
                 </div>
                 <div className="space-y-6 md:space-y-10 group border-t border-white/5 pt-10 md:border-t-0 md:pt-0">
                    <div className="text-6xl md:text-[8rem] font-black opacity-5 italic leading-none group-hover:text-red-600 transition-colors duration-500">03</div>
                    <div className="space-y-4">
                       <h4 className="text-3xl md:text-4xl font-black uppercase italic tracking-tighter">Zero Footprint</h4>
                       <p className="text-[11px] font-black uppercase tracking-[0.2em] opacity-30 leading-relaxed italic">
                          Kami membenci jejak. Data Anda otomatis hancur dalam 30 menit atau sekali akses. Sempurna untuk privasi total.
                       </p>
                    </div>
                 </div>
              </div>

              {/* LIMITS & SPECS */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-1 grid-bg">
                 <div className="p-16 border border-white/5 bg-white/[0.01] hover:bg-white/[0.03] transition-all">
                    <p className="text-[9px] font-black tracking-[0.5em] uppercase text-red-600 mb-6">Storage Protocol</p>
                    <h5 className="text-3xl font-black uppercase italic tracking-tighter mb-4">50MB Session Limit</h5>
                    <p className="text-[10px] font-black uppercase opacity-20 tracking-widest leading-loose italic">Ditentukan untuk memastikan performa maksimal pada layanan server gratisan kami.</p>
                 </div>
                 <div className="p-16 border border-white/5 bg-white/[0.01] hover:bg-white/[0.03] transition-all">
                    <p className="text-[9px] font-black tracking-[0.5em] uppercase opacity-40 mb-6">TTL Lifecycle</p>
                    <h5 className="text-3xl font-black uppercase italic tracking-tighter mb-4">30 Minute Life</h5>
                    <p className="text-[10px] font-black uppercase opacity-20 tracking-widest leading-loose italic">Setiap "Jembatan" yang Anda buat hanya bertahan selama 1800 detik sebelum dihapus permanen.</p>
                 </div>
                 <div className="p-16 border border-white/5 bg-white/[0.01] hover:bg-white/[0.03] transition-all">
                    <p className="text-[9px] font-black tracking-[0.5em] uppercase opacity-40 mb-6">Compatibility</p>
                    <h5 className="text-3xl font-black uppercase italic tracking-tighter mb-4">Universal Bridge</h5>
                    <p className="text-[10px] font-black uppercase opacity-20 tracking-widest leading-loose italic">Bekerja di iOS, Android, macOS, Windows, dan Linux tanpa butuh instalasi aplikasi tambahan.</p>
                 </div>
              </div>

              {/* CREDITS */}
              <div className="pt-20 flex flex-col items-center text-center space-y-12">
                 <h5 className="text-[10px] font-black tracking-[1.5em] uppercase opacity-20 leading-none">Developed by Private Sector</h5>
                 <div className="flex gap-24 opacity-10">
                    <Logo size={44} />
                    <Logo size={44} />
                    <Logo size={44} />
                 </div>
              </div>
           </div>
        </div>
      </main>

      {/* FOOTER */}
      <footer className="footer relative z-10 w-full p-12 py-20 border-t border-white/5 flex flex-col sm:flex-row justify-between items-center gap-10 bg-black">
        <div className="text-left font-black italic">
           <p className="text-[12px] uppercase tracking-widest text-white/50">RafQR Data Bridge</p>
           <p className="text-[9px] uppercase tracking-[0.5em] opacity-20 mt-2 italic leading-none">ULTRA-FAST & EPHEMERAL BRIDGE.</p>
        </div>
        <div className="flex gap-16 font-black items-center">
           <p className="text-[10px] uppercase tracking-widest opacity-20 hover:text-red-500 transition-all cursor-pointer" onClick={() => window.location.href = '/admin'}>[ INTERNAL_SYSTEM ]</p>
        </div>
      </footer>

      {/* CUSTOM STYLE INJECT */}
      <style jsx global>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .animate-fade-in { animation: fadeIn 1s ease-out; }
        .text-outline { -webkit-text-stroke: 1.5px rgba(255,255,255,0.15); color: transparent !important; }
      `}</style>
    </div>
  );
}
