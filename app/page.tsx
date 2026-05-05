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
const MicIcon = () => (<svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>);
const StopIcon = () => (<svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path fillRule="evenodd" d="M4.5 7.5a3 3 0 013-3h9a3 3 0 013 3v9a3 3 0 01-3 3h-9a3 3 0 01-3-3v-9z" clipRule="evenodd" /></svg>);
const DiceIcon = () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>);

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

  // Audio Recording State
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const file = new File([audioBlob], `AudioNote-${nanoid(6)}.webm`, { type: 'audio/webm' });
        setSelectedFiles(p => [...p, file]);
        audioChunksRef.current = [];
        stream.getTracks().forEach(track => track.stop());
      };
      audioChunksRef.current = [];
      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (err) {
      alert("Microphone permission denied or not supported.");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  const generateSecureKey = () => setEncryptionKey(nanoid(16));
  const generateSecurePin = () => setPinCode(Math.floor(1000 + Math.random() * 9000).toString());

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

  const getShareURL = () => (typeof window !== 'undefined' ? `${window.location.origin}/d/${uniqueId}` : '');
  const getReceiveURL = () => (typeof window !== 'undefined' ? `${window.location.origin}/u/${uniqueId}` : '');

  return (
    <div className="min-h-screen bg-white text-black font-sans flex flex-col overflow-x-hidden selection:bg-neo-yellow selection:text-black">
      {/* NAVBAR */}
      <nav className="relative z-10 px-4 sm:px-8 py-6 flex justify-between items-center max-w-7xl mx-auto w-full border-b-4 border-black bg-neo-yellow">
        <button onClick={() => setStep('input')} className="flex items-center gap-3 hover:-rotate-2 transition-transform">
          <div className="bg-black p-1.5 border-2 border-black shadow-[2px_2px_0px_0px_rgba(255,255,255,1)]">
            <Logo size={24} color="white" />
          </div>
          <h1 className="text-2xl font-black tracking-tighter uppercase">RafQR</h1>
        </button>
        <button onClick={() => window.location.href = '/scan'} className="neo-btn bg-white text-xs px-4 py-2 hover:bg-neo-green">
           Scan QR
        </button>
      </nav>

      <main className="relative z-10 flex-1 flex flex-col items-center pt-8 sm:pt-16 pb-32 px-6 max-w-6xl mx-auto w-full">
        {step === 'input' && (
          <div className="w-full flex justify-center animate-fade-in flex-col items-center">
            {/* HERO */}
            <div className="text-center mb-12 flex flex-col items-center">
               <div className="neo-tag bg-neo-pink text-white mb-6 transform rotate-1">
                 RafQR V3.5 Secure Engine
               </div>
               <h2 className="text-5xl sm:text-7xl md:text-9xl font-black tracking-tighter mb-4 sm:mb-6 leading-none uppercase">
                  Jembatan <br className="sm:hidden" />
                  <span className="bg-neo-yellow px-4 border-4 border-black shadow-neo inline-block rotate-[-1deg]">
                    Data Anda
                  </span>
               </h2>
               <p className="text-lg sm:text-xl text-black max-w-xl mx-auto font-bold leading-tight mt-4">
                  Transfer file & teks antar perangkat layaknya teleportasi. <span className="bg-neo-green px-1">Nol instalasi, nol akun, privasi absolut.</span>
               </p>
            </div>

            <div className="neo-card w-full max-w-2xl p-4 flex flex-col mb-12 bg-neo-blue/5">
              {/* TOGGLES */}
              <div className="flex bg-black p-1 mb-6 border-2 border-black">
                 <button onClick={() => setActiveMode('send')} className={`flex-1 py-3 text-sm font-black uppercase tracking-widest transition-all ${activeMode === 'send' ? 'bg-neo-yellow text-black' : 'text-white hover:bg-white/10'}`}>Mulai Kirim</button>
                 <button onClick={() => setActiveMode('receive')} className={`flex-1 py-3 text-sm font-black uppercase tracking-widest transition-all ${activeMode === 'receive' ? 'bg-neo-yellow text-black' : 'text-white hover:bg-white/10'}`}>Terima File</button>
              </div>

              {activeMode === 'send' ? (
                <div className="px-6 pb-6 space-y-6">
                   {/* DROPZONE */}
                   <div 
                      onClick={() => !isUploading && fileInputRef.current?.click()}
                      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={(e) => { e.preventDefault(); setIsDragging(false); if(!isUploading) setSelectedFiles(p => [...p, ...Array.from(e.dataTransfer.files)]); }}
                      className={`relative overflow-hidden border-4 border-black transition-all cursor-pointer ${isDragging ? 'bg-neo-green shadow-none translate-x-1 translate-y-1' : 'bg-white shadow-neo hover:shadow-neo-lg'} ${isUploading ? 'opacity-50 cursor-not-allowed' : ''} p-10 flex flex-col items-center justify-center text-center`}
                   >
                      <div className="bg-black p-4 border-2 border-black mb-4 shadow-[4px_4px_0px_0px_rgba(163,230,53,1)]">
                        <svg className="w-8 h-8 text-neo-green" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                      </div>
                      <h3 className="text-xl font-black uppercase mb-1">Pilih File atau Seret</h3>
                      <p className="text-xs font-bold mb-4 text-black/60">Maks 50 MB / Tipe Bebas</p>
                      <div className="neo-btn bg-black text-white text-xs py-2">Cari File</div>
                     <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => setSelectedFiles(p => [...p, ...Array.from(e.target.files || [])])} disabled={isUploading} />
                   </div>

                   {/* FILES PREVIEW */}
                   {selectedFiles.length > 0 && (
                      <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
                        {selectedFiles.map((f, i) => (
                          <div key={i} className="aspect-square bg-white border-2 border-black shadow-neo-hover flex items-center justify-center relative group overflow-hidden">
                            {previews[`${f.name}-${f.lastModified}`] ? (
                              <img src={previews[`${f.name}-${f.lastModified}`]} className="object-cover w-full h-full" />
                            ) : (
                              <span className="text-[10px] font-black text-center px-1 truncate">{f.name.split('.').pop()?.toUpperCase()}</span>
                            )}
                            <button onClick={(e) => { e.stopPropagation(); setSelectedFiles(p => p.filter((_, idx) => idx !== i)); }} className="absolute inset-0 bg-neo-pink/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white"><XIcon /></button>
                          </div>
                        ))}
                      </div>
                   )}

                   {/* TEXT AREA */}
                   <div className="relative group">
                     <textarea disabled={isUploading} value={textContent} onChange={(e) => setTextContent(e.target.value)} placeholder="Ketik pesan rahasia di sini..." className="neo-input h-32 resize-none placeholder-gray-500" />
                     <button
                        onClick={isRecording ? stopRecording : startRecording}
                        disabled={isUploading}
                        title={isRecording ? "Stop Recording" : "Record Voice Note"}
                        className={`absolute bottom-4 right-4 p-3 border-2 border-black transition-all shadow-neo-hover active:shadow-none active:translate-x-[2px] active:translate-y-[2px] ${isRecording ? 'bg-neo-pink text-white animate-pulse' : 'bg-neo-yellow text-black'}`}
                     >
                       {isRecording ? <StopIcon /> : <MicIcon />}
                     </button>
                   </div>

                   {/* SETTINGS */}
                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <label className={`flex items-center justify-between p-4 border-3 border-black cursor-pointer transition-all ${e2eeEnabled ? 'bg-neo-green shadow-none translate-x-1 translate-y-1' : 'bg-white shadow-neo-hover'}`}>
                         <span className="text-sm font-black uppercase">Bungkus E2EE</span>
                         <input type="checkbox" checked={e2eeEnabled} onChange={() => setE2eeEnabled(!e2eeEnabled)} className="sr-only" />
                         <div className={`w-10 h-5 border-2 border-black transition-colors relative ${e2eeEnabled ? 'bg-black' : 'bg-white'}`}>
                           <div className={`absolute top-0.5 left-0.5 bg-neo-yellow w-3 h-3 border border-black transition-transform ${e2eeEnabled ? 'translate-x-5' : ''}`} />
                         </div>
                      </label>
                      <label className={`flex items-center justify-between p-4 border-3 border-black cursor-pointer transition-all ${ghostMode ? 'bg-neo-pink text-white shadow-none translate-x-1 translate-y-1' : 'bg-white shadow-neo-hover'}`}>
                         <span className="text-sm font-black uppercase">Auto-Hapus</span>
                         <input type="checkbox" checked={ghostMode} onChange={() => setGhostMode(!ghostMode)} className="sr-only" />
                         <div className={`w-10 h-5 border-2 border-black transition-colors relative ${ghostMode ? 'bg-white' : 'bg-black'}`}>
                           <div className={`absolute top-0.5 left-0.5 bg-neo-yellow w-3 h-3 border border-black transition-transform ${ghostMode ? 'translate-x-5' : ''}`} />
                         </div>
                      </label>
                      <label className={`flex items-center justify-between p-4 border-3 border-black cursor-pointer transition-all ${pinMode ? 'bg-neo-purple text-white shadow-none translate-x-1 translate-y-1' : 'bg-white shadow-neo-hover'}`}>
                         <span className="text-sm font-black uppercase">Gembok PIN</span>
                         <input type="checkbox" checked={pinMode} onChange={() => setPinMode(!pinMode)} className="sr-only" />
                         <div className={`w-10 h-5 border-2 border-black transition-colors relative ${pinMode ? 'bg-white' : 'bg-black'}`}>
                           <div className={`absolute top-0.5 left-0.5 bg-neo-yellow w-3 h-3 border border-black transition-transform ${pinMode ? 'translate-x-5' : ''}`} />
                         </div>
                      </label>
                      <div className="p-1 border-3 border-black bg-white shadow-neo-hover flex items-center px-4 gap-2">
                         <span className="text-black text-xs font-black uppercase">T-ID</span>
                         <input disabled={isUploading} value={customId} onChange={(e) => setCustomId(e.target.value.replace(/[^a-zA-Z0-9-]/g, '').toLowerCase())} placeholder="otomatis" className="bg-transparent w-full focus:outline-none text-sm font-bold" />
                      </div>
                   </div>

                   <div className="space-y-3">
                     {e2eeEnabled && (
                       <div className="relative">
                         <input disabled={isUploading} value={encryptionKey} onChange={(e) => setEncryptionKey(e.target.value)} placeholder="Ketik minimal 6 huruf untuk Kunci E2EE" className="w-full bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-4 text-sm focus:outline-none focus:border-indigo-500 transition-colors pr-12" />
                         <button onClick={generateSecureKey} className="absolute right-3 top-3.5 p-1.5 bg-indigo-500/20 hover:bg-indigo-500/40 rounded-lg text-indigo-300" title="Auto-Generate Key"><DiceIcon /></button>
                       </div>
                     )}
                     {pinMode && (
                       <div className="relative">
                         <input disabled={isUploading} type="password" value={pinCode} onChange={(e) => setPinCode(e.target.value.slice(0, 4))} placeholder="Buat angka 4-digit PIN..." className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-sm focus:outline-none focus:border-white/30 transition-colors tracking-widest pr-12" />
                         <button onClick={generateSecurePin} className="absolute right-3 top-3.5 p-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-gray-300" title="Auto-Generate PIN"><DiceIcon /></button>
                       </div>
                     )}
                   </div>

                    <div className="pt-4">
                      {!isUploading ? (
                         <button onClick={handleUpload} className="w-full neo-btn bg-black text-white hover:bg-neo-green hover:text-black py-4 text-lg">
                           Mulai Transfer
                         </button>
                      ) : (
                         <div className="space-y-3 bg-black text-white p-5 border-4 border-black">
                            <div className="flex justify-between text-xs font-black uppercase">
                              <span>Memproses...</span>
                              <span>{overallProgress}%</span>
                            </div>
                            <div className="h-4 bg-white border-2 border-white w-full overflow-hidden">
                              <div className="h-full bg-neo-green transition-all duration-300" style={{ width: `${overallProgress}%` }} />
                            </div>
                         </div>
                      )}
                      {error && <p className="text-center text-xs font-medium text-red-400 mt-4">{error}</p>}
                   </div>
                </div>
              ) : (
                <div className="p-8 text-center space-y-8 flex flex-col items-center">
                   <div className="w-20 h-20 bg-neo-yellow border-4 border-black shadow-neo flex items-center justify-center mb-2 rotate-3">
                     <svg className="w-10 h-10 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                   </div>
                   <h2 className="text-3xl font-black uppercase tracking-tighter">Terima File Langsung</h2>
                   <p className="text-black text-sm font-bold max-w-sm">Masukkan <span className="underline decoration-4 decoration-neo-pink">T-ID</span> milik pengirim file untuk terhubung.</p>
                   
                   <div className="w-full space-y-6 pt-4 text-left">
                     <div className="space-y-2">
                        <label className="text-xs font-black uppercase ml-1">ID Pengirim</label>
                        <input disabled={isUploading} value={customId} onChange={(e) => setCustomId(e.target.value)} placeholder="Contoh: raf-123" className="neo-input text-center tracking-[0.2em] uppercase font-black text-xl" />
                     </div>
                     <button onClick={handleReceive} disabled={isUploading || !customId.trim()} className="w-full neo-btn bg-black text-white hover:bg-neo-blue py-4 text-lg">
                       {isUploading ? 'Menyambungkan...' : 'Hubungkan'}
                     </button>
                   </div>
                   {error && <p className="text-center text-xs font-black text-neo-pink uppercase mt-4 italic">!! {error} !!</p>}
                </div>
              )}
            </div>

            {/* HISTORY */}
            {history.length > 0 && (
              <div className="w-full max-w-2xl px-2">
                 <h4 className="flex items-center gap-2 text-xs font-black text-black uppercase tracking-widest mb-4">
                   <span className="w-3 h-3 bg-neo-green border border-black shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]" />
                   Sesi Sebelumnya
                 </h4>
                 <div className="grid gap-3">
                    {history.map((h, i) => (
                      <div key={i} className="p-4 bg-white border-2 border-black shadow-neo-hover flex justify-between items-center group cursor-pointer hover:bg-neo-yellow transition-colors" onClick={() => window.location.href = `/d/${h.id}`}>
                         <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 border-2 border-black flex items-center justify-center shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] ${h.type === 'send' ? 'bg-neo-pink text-white' : 'bg-neo-green text-black'}`}>
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d={h.type === 'send' ? "M5 10l7-7m0 0l7 7m-7-7v18" : "M19 14l-7 7m0 0l-7-7m7 7V3"} /></svg>
                            </div>
                            <p className="text-sm font-black uppercase truncate max-w-[150px] sm:max-w-none">{h.title}</p>
                         </div>
                         <p className="text-[10px] font-black bg-black text-white px-2 py-1 transform -rotate-2">/{h.id}</p>
                      </div>
                    ))}
                 </div>
              </div>
            )}
          </div>
        )}

        {/* SUCCESS / WAITING STATE */}
        {(step === 'success' || step === 'waiting') && (
          <div className="w-full max-w-4xl flex flex-col lg:flex-row gap-12 items-center lg:items-center justify-center mt-6">
            <div className="flex-1 space-y-8 text-center lg:text-left">
               {downloadedAtLeastOnce && <div className="bg-neo-green border-2 border-black px-4 py-2 inline-flex font-black text-xs uppercase tracking-widest shadow-neo animate-bounce">Data Berhasil Disinkronisasi!</div>}
               <div className="space-y-4">
                 <h2 className="text-6xl sm:text-8xl font-black tracking-tighter uppercase leading-none">
                   {step === 'waiting' ? <span className="bg-neo-yellow px-2 border-4 border-black">Siaga</span> : <span className="bg-neo-green px-2 border-4 border-black">Terhubung!</span>}
                 </h2>
                 <p className="text-black text-lg font-bold max-w-sm mx-auto lg:mx-0">
                   {step === 'waiting' ? 'Menunggu pengirim mentransfer file ke jembatan ini. Jangan tutup halaman ini.' : 'Sesi aktif! Pindai QR atau bagikan link ke perangkat tujuan sekarang.'}
                 </p>
               </div>
               
               <div className="space-y-4 pt-6 max-w-sm mx-auto lg:mx-0">
                  <div className="flex items-center bg-white border-4 border-black shadow-neo overflow-hidden">
                     <div className="flex-1 px-4 truncate font-black text-sm uppercase">
                       {step === 'waiting' ? getReceiveURL() : getShareURL()}
                     </div>
                     <button onClick={() => copyLink(step === 'waiting' ? getReceiveURL() : getShareURL())} className="bg-black text-white px-6 py-4 text-xs font-black uppercase hover:bg-neo-yellow hover:text-black transition-colors border-l-4 border-black">
                       {copied ? 'OK!' : 'Salin'}
                     </button>
                  </div>
                  <button onClick={async () => {
                     const url = step === 'waiting' ? getReceiveURL() : getShareURL();
                     if (navigator.share) await navigator.share({ url }); else copyLink(url);
                  }} className="w-full neo-btn bg-neo-blue text-white py-4 text-sm flex items-center justify-center gap-3">
                     <ShareIcon /> Bagikan via Sosmed
                  </button>
               </div>
               
               {e2eeEnabled && step === 'success' && (
                  <div className="p-6 border-4 border-black bg-neo-yellow shadow-neo text-left max-w-sm mx-auto lg:mx-0 mt-8 relative overflow-hidden">
                    <div className="neo-tag bg-black text-white mb-3 inline-block">KUNCI PEMBUKA (SECRET)</div>
                    <p className="text-2xl font-black break-all uppercase tracking-tighter">{encryptionKey}</p>
                    <p className="text-[10px] font-bold text-black/60 mt-3 italic underline decoration-neo-pink underline-offset-2">Infokan kunci ini kepada pemerima. Jika hilang, file tidak bisa diselamatkan.</p>
                  </div>
               )}
               
               <button onClick={() => setStep('input')} className="text-xs font-black uppercase underline decoration-4 decoration-neo-pink hover:bg-neo-pink hover:text-white transition-all mt-8 inline-block p-1">Mulai Sesi Baru / Hancurkan</button>
            </div>
            
            <div className="neo-card p-8 bg-white flex flex-col items-center rotate-2">
               <div className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-4">
                 <QRCodeSVG 
                    value={step === 'waiting' ? getReceiveURL() : getShareURL()} 
                    size={qrSize} 
                    level="H" 
                    bgColor="#FFFFFF" 
                    fgColor="#000000" 
                    marginSize={0}
                 />
               </div>
               <p className="bg-black text-white px-4 py-1 text-xs font-black uppercase tracking-[0.3em] mt-8 -rotate-2">PINDAI QR UTK BUKA</p>
            </div>
          </div>
        )}
      </main>

      {/* LANDING PAGE / WHAT IS THIS? */}
      {step === 'input' && (
        <section className="w-full mt-12 mb-24 px-4 sm:px-6 flex flex-col items-center">
          <div className="max-w-5xl mx-auto space-y-24">
            <div className="text-center">
              <h2 className="text-4xl sm:text-6xl font-black uppercase tracking-tighter mb-4">Kenapa Memilih RafQR?</h2>
              <p className="text-lg font-bold">Dibangun untuk solusi transfer super cepat, rahasia, tanpa bikin pusing.</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="neo-card p-8 bg-white rotate-1 hover:rotate-0 transition-transform">
                <div className="w-16 h-16 bg-neo-blue border-4 border-black text-white flex items-center justify-center mb-6 shadow-neo">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                </div>
                <h3 className="text-xl font-black uppercase mb-3">Cepat Kilat</h3>
                <p className="text-sm font-bold leading-snug">Lompat batas device! Dari Laptop ke iPhone, Android ke PC. Bebas OS dengan modal browser saja.</p>
              </div>
              <div className="neo-card p-8 bg-neo-green -rotate-1 hover:rotate-0 transition-transform">
                <div className="w-16 h-16 bg-white border-4 border-black text-black flex items-center justify-center mb-6 shadow-neo">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                </div>
                <h3 className="text-xl font-black uppercase mb-3">Privasi E2EE</h3>
                <p className="text-sm font-bold leading-snug">Bungkus keamanan dengan AES-256 E2EE. Kunci diproses di browser, server kami sekalipun tidak dapat mengintip.</p>
              </div>
              <div className="neo-card p-8 bg-neo-pink text-white rotate-2 hover:rotate-0 transition-transform">
                <div className="w-16 h-16 bg-black border-4 border-white text-white flex items-center justify-center mb-6 shadow-[4px_4px_0px_0px_rgba(255,255,255,1)]">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </div>
                <h3 className="text-xl font-black uppercase mb-3">Tanpa Sisa</h3>
                <p className="text-sm font-bold leading-snug">Semua data dihapus otomatis dari server dalam 30 menit. Tidak ada jejak yang tertinggal.</p>
              </div>
            </div>

            {/* CARA KERJA (How it works) */}
            <div className="neo-card p-8 md:p-12 bg-white relative overflow-hidden">
               <div className="neo-bg-dots absolute inset-0 opacity-10 pointer-events-none" />
               <div className="text-center mb-12 relative z-10">
                 <h2 className="text-4xl font-black uppercase tracking-tighter mb-2">3 Langkah Mudah</h2>
                 <p className="font-bold">Langsung bisa kirim ke teman tanpa babibu lagi.</p>
               </div>
               <div className="grid grid-cols-1 md:grid-cols-3 gap-12 relative z-10 items-start">
                  <div className="text-center group">
                    <div className="w-16 h-16 bg-neo-yellow text-black font-black flex items-center justify-center border-4 border-black mx-auto mb-6 text-2xl shadow-neo group-hover:-translate-y-1 transition-transform">1</div>
                    <h4 className="font-black uppercase mb-2 text-xl">Lempar File</h4>
                    <p className="text-sm font-bold leading-tight">Taruh file rahasiamu. Beri Gembok PIN atau Kunci E2EE bila perlu mengamankannya.</p>
                  </div>
                  <div className="text-center group">
                    <div className="w-16 h-16 bg-neo-pink text-white font-black flex items-center justify-center border-4 border-black mx-auto mb-6 text-2xl shadow-neo group-hover:-translate-y-1 transition-transform">2</div>
                    <h4 className="font-black uppercase mb-2 text-xl">Bagi Akses</h4>
                    <p className="text-sm font-bold leading-tight">QR Code akan langsung terbentuk. Berikan ini di depan layar atau salin tautannya ya.</p>
                  </div>
                  <div className="text-center group">
                    <div className="w-16 h-16 bg-neo-green text-black font-black flex items-center justify-center border-4 border-black mx-auto mb-6 text-2xl shadow-neo group-hover:-translate-y-1 transition-transform">3</div>
                    <h4 className="font-black uppercase mb-2 text-xl">Terima Data!</h4>
                    <p className="text-sm font-bold leading-tight">Tinggal klik unduh di perangkat tujuan, dan boom! Datanya pindah sekejap.</p>
                  </div>
               </div>
            </div>
            
          </div>
        </section>
      )}

      <footer className="relative z-10 w-full py-12 text-center border-t-4 border-black bg-white">
         <div className="flex flex-col items-center justify-center gap-6">
           <div className="flex gap-4">
             <div className="w-8 h-8 bg-neo-yellow border-2 border-black" />
             <div className="w-8 h-8 bg-neo-green border-2 border-black" />
             <div className="w-8 h-8 bg-neo-pink border-2 border-black" />
           </div>
           <p className="text-xs font-black uppercase tracking-widest">© {new Date().getFullYear()} RafQR Data Bridge. Oleh RaffiTech Labs.</p>
           <p className="text-[10px] font-black uppercase bg-black text-white px-2 py-1 rotate-1">Dibuat dengan ❤️ dari Indonesia</p>
         </div>
      </footer>
    </div>
  );
}
