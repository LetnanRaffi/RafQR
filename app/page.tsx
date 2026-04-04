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
    <div className="min-h-screen bg-transparent text-white font-sans flex flex-col overflow-x-hidden selection:bg-indigo-500/30 selection:text-white">
      {/* NAVBAR */}
      <nav className="relative z-10 px-8 py-6 flex justify-between items-center max-w-7xl mx-auto w-full animate-slide-down">
        <button onClick={() => setStep('input')} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <Logo size={28} />
          <h1 className="text-xl font-bold tracking-tight">RafQR</h1>
        </button>
        <button onClick={() => window.location.href = '/scan'} className="bg-white/10 hover:bg-white/20 text-white px-5 py-2.5 rounded-full text-xs font-semibold tracking-wide transition-all backdrop-blur-md border border-white/10">
           Scan QR
        </button>
      </nav>

      <main className="relative z-10 flex-1 flex flex-col items-center pt-8 sm:pt-16 pb-32 px-6 max-w-6xl mx-auto w-full">
        {step === 'input' && (
          <div className="w-full flex justify-center animate-fade-in flex-col items-center">
            {/* HERO */}
            <div className="text-center mb-12 flex flex-col items-center">
               <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-xs font-semibold uppercase tracking-widest mb-6 backdrop-blur-sm hover:bg-indigo-500/20 transition-colors shadow-[0_0_20px_rgba(79,70,229,0.2)]">
                 <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                 RafQR V3.5 Secure Engine
               </div>
               <h2 className="text-5xl sm:text-7xl md:text-8xl font-black tracking-tighter mb-6 leading-none">
                  Jembatan <br className="sm:hidden" />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 drop-shadow-[0_0_30px_rgba(168,85,247,0.4)]">
                    Data Anda
                  </span>
               </h2>
               <p className="text-base sm:text-lg text-gray-400/90 max-w-xl mx-auto font-medium leading-relaxed">
                  Transfer file & teks antar perangkat layaknya teleportasi. Nol instalasi, nol akun, privasi absolut.
               </p>
            </div>

            <div className="glass-panel w-full max-w-2xl p-2 flex flex-col mb-12">
              {/* TOGGLES */}
              <div className="flex bg-white/5 rounded-2xl p-1 mb-6">
                 <button onClick={() => setActiveMode('send')} className={`flex-1 py-3 text-sm font-semibold rounded-xl transition-all ${activeMode === 'send' ? 'bg-white text-black shadow-lg' : 'text-gray-400 hover:text-white'}`}>Mulai Kirim</button>
                 <button onClick={() => setActiveMode('receive')} className={`flex-1 py-3 text-sm font-semibold rounded-xl transition-all ${activeMode === 'receive' ? 'bg-white text-black shadow-lg' : 'text-gray-400 hover:text-white'}`}>Terima File</button>
              </div>

              {activeMode === 'send' ? (
                <div className="px-6 pb-6 space-y-6">
                   {/* DROPZONE */}
                   <div 
                      onClick={() => !isUploading && fileInputRef.current?.click()}
                      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={(e) => { e.preventDefault(); setIsDragging(false); if(!isUploading) setSelectedFiles(p => [...p, ...Array.from(e.dataTransfer.files)]); }}
                      className={`relative overflow-hidden rounded-2xl border-2 border-dashed transition-all cursor-pointer ${isDragging ? 'border-indigo-500 bg-indigo-500/10' : 'border-white/10 hover:border-white/20 hover:bg-white/[0.02]'} ${isUploading ? 'opacity-50 cursor-not-allowed' : ''} p-10 flex flex-col items-center justify-center text-center`}
                   >
                     <div className="bg-white/5 p-4 rounded-full mb-4">
                       <svg className="w-8 h-8 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                     </div>
                     <h3 className="text-lg font-semibold mb-1">Klik atau lepaskan file di sini</h3>
                     <p className="text-xs text-gray-400">Ukuran maksimal 50 MB / Tipe Bebas</p>
                     <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => setSelectedFiles(p => [...p, ...Array.from(e.target.files || [])])} disabled={isUploading} />
                   </div>

                   {/* FILES PREVIEW */}
                   {selectedFiles.length > 0 && (
                      <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
                        {selectedFiles.map((f, i) => (
                          <div key={i} className="aspect-square bg-white/5 rounded-xl border border-white/10 flex items-center justify-center relative group overflow-hidden">
                            {previews[`${f.name}-${f.lastModified}`] ? (
                              <img src={previews[`${f.name}-${f.lastModified}`]} className="object-cover w-full h-full opacity-60" />
                            ) : (
                              <span className="text-[10px] font-bold opacity-40 text-center px-1 truncate">{f.name.split('.').pop()?.toUpperCase()}</span>
                            )}
                            <button onClick={(e) => { e.stopPropagation(); setSelectedFiles(p => p.filter((_, idx) => idx !== i)); }} className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm"><XIcon /></button>
                          </div>
                        ))}
                      </div>
                   )}

                   {/* TEXT AREA */}
                   <div className="relative group">
                     <textarea disabled={isUploading} value={textContent} onChange={(e) => setTextContent(e.target.value)} placeholder="Ketik pesan atau salin teks rahasia di sini..." className="w-full h-32 bg-white/5 border border-white/10 rounded-2xl p-5 text-sm focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all resize-none placeholder-gray-500" />
                     <button
                        onClick={isRecording ? stopRecording : startRecording}
                        disabled={isUploading}
                        title={isRecording ? "Stop Recording" : "Record Voice Note"}
                        className={`absolute bottom-4 right-4 p-2.5 rounded-full backdrop-blur-md transition-all shadow-lg ${isRecording ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse shadow-red-500/40' : 'bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white'}`}
                     >
                       {isRecording ? <StopIcon /> : <MicIcon />}
                     </button>
                   </div>

                   {/* SETTINGS */}
                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label className={`flex items-center justify-between p-4 rounded-2xl border border-white/5 cursor-pointer transition-all ${e2eeEnabled ? 'bg-indigo-500/20 border-indigo-500/50' : 'bg-white/5 hover:bg-white/10'}`}>
                         <span className="text-sm font-medium">Bungkus E2EE</span>
                         <input type="checkbox" checked={e2eeEnabled} onChange={() => setE2eeEnabled(!e2eeEnabled)} className="sr-only" />
                         <div className={`w-10 h-5 rounded-full transition-colors relative ${e2eeEnabled ? 'bg-indigo-500' : 'bg-white/20'}`}>
                           <div className={`absolute top-1 left-1 bg-white w-3 h-3 rounded-full transition-transform ${e2eeEnabled ? 'translate-x-5' : ''}`} />
                         </div>
                      </label>
                      <label className={`flex items-center justify-between p-4 rounded-2xl border border-white/5 cursor-pointer transition-all ${ghostMode ? 'bg-indigo-500/20 border-indigo-500/50' : 'bg-white/5 hover:bg-white/10'}`}>
                         <span className="text-sm font-medium">Auto-Hapus</span>
                         <input type="checkbox" checked={ghostMode} onChange={() => setGhostMode(!ghostMode)} className="sr-only" />
                         <div className={`w-10 h-5 rounded-full transition-colors relative ${ghostMode ? 'bg-indigo-500' : 'bg-white/20'}`}>
                           <div className={`absolute top-1 left-1 bg-white w-3 h-3 rounded-full transition-transform ${ghostMode ? 'translate-x-5' : ''}`} />
                         </div>
                      </label>
                      <label className={`flex items-center justify-between p-4 rounded-2xl border border-white/5 cursor-pointer transition-all ${pinMode ? 'bg-indigo-500/20 border-indigo-500/50' : 'bg-white/5 hover:bg-white/10'}`}>
                         <span className="text-sm font-medium">Gembok PIN</span>
                         <input type="checkbox" checked={pinMode} onChange={() => setPinMode(!pinMode)} className="sr-only" />
                         <div className={`w-10 h-5 rounded-full transition-colors relative ${pinMode ? 'bg-indigo-500' : 'bg-white/20'}`}>
                           <div className={`absolute top-1 left-1 bg-white w-3 h-3 rounded-full transition-transform ${pinMode ? 'translate-x-5' : ''}`} />
                         </div>
                      </label>
                      <div className="p-1 border border-white/5 bg-white/5 rounded-2xl flex items-center px-4 gap-2 focus-within:border-indigo-500/50 transition-colors">
                         <span className="text-gray-500 text-xs font-semibold">T-ID</span>
                         <input disabled={isUploading} value={customId} onChange={(e) => setCustomId(e.target.value.replace(/[^a-zA-Z0-9-]/g, '').toLowerCase())} placeholder="otomatis" className="bg-transparent w-full focus:outline-none text-sm" />
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
                        <button onClick={handleUpload} className="w-full py-4 bg-white hover:bg-gray-100 text-black rounded-xl font-bold tracking-wide transition-all shadow-[0_0_40px_-10px_rgba(255,255,255,0.5)] flex items-center justify-center gap-2">
                          Mulai Transfer
                        </button>
                      ) : (
                        <div className="space-y-3 bg-white/5 p-5 rounded-xl border border-white/10">
                           <div className="flex justify-between text-xs font-medium text-gray-400">
                             <span>Memproses...</span>
                             <span>{overallProgress}%</span>
                           </div>
                           <div className="h-1.5 bg-white/10 rounded-full w-full overflow-hidden">
                             <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300" style={{ width: `${overallProgress}%` }} />
                           </div>
                        </div>
                      )}
                      {error && <p className="text-center text-xs font-medium text-red-400 mt-4">{error}</p>}
                   </div>
                </div>
              ) : (
                <div className="p-8 text-center space-y-8 animate-fade-in flex flex-col items-center">
                   <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-2">
                     <svg className="w-8 h-8 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                   </div>
                   <h2 className="text-2xl font-bold">Terima File Langsung</h2>
                   <p className="text-gray-400 text-sm max-w-sm">Masukkan <span className="font-semibold text-white">ID (T-ID)</span> milik pengirim file untuk terhubung.</p>
                   
                   <div className="w-full space-y-4 pt-4">
                     <input disabled={isUploading} value={customId} onChange={(e) => setCustomId(e.target.value)} placeholder="Contoh: raf-123" className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-center tracking-widest font-mono text-lg focus:outline-none focus:border-indigo-500/50 transition-colors" />
                     <button onClick={handleReceive} disabled={isUploading || !customId.trim()} className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold tracking-wide transition-all shadow-[0_0_40px_-10px_rgba(79,70,229,0.5)]">
                       {isUploading ? 'Menyambungkan...' : 'Hubungkan'}
                     </button>
                   </div>
                   {error && <p className="text-center text-xs font-medium text-red-400">{error}</p>}
                </div>
              )}
            </div>

            {/* HISTORY */}
            {history.length > 0 && (
              <div className="w-full max-w-2xl px-2">
                 <h4 className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">Sesi Sebelumnya</h4>
                 <div className="grid gap-2">
                    {history.map((h, i) => (
                      <div key={i} className="p-4 bg-white/[0.02] border border-white/5 rounded-xl flex justify-between items-center group cursor-pointer hover:bg-white/[0.05] hover:border-white/10 transition-all" onClick={() => window.location.href = `/d/${h.id}`}>
                         <div className="flex items-center gap-4">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${h.type === 'send' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={h.type === 'send' ? "M5 10l7-7m0 0l7 7m-7-7v18" : "M19 14l-7 7m0 0l-7-7m7 7V3"} /></svg>
                            </div>
                            <p className="text-sm font-medium text-gray-300">{h.title}</p>
                         </div>
                         <p className="text-xs font-mono text-gray-500">/{h.id}</p>
                      </div>
                    ))}
                 </div>
              </div>
            )}
          </div>
        )}

        {/* SUCCESS / WAITING STATE */}
        {(step === 'success' || step === 'waiting') && (
          <div className="animate-scale-in w-full max-w-4xl flex flex-col lg:flex-row gap-12 items-center lg:items-start justify-center mt-12">
            <div className="flex-1 space-y-8 text-center lg:text-left">
               {downloadedAtLeastOnce && <div className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-4 py-1.5 rounded-full inline-flex font-semibold text-[10px] tracking-widest uppercase animate-pulse">Data Telah Disinkronisasi</div>}
               <div className="space-y-4">
                 <h2 className="text-5xl sm:text-7xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-br from-white to-gray-500 leading-tight">
                   {step === 'waiting' ? 'Siaga' : 'Terhubung!'}
                 </h2>
                 <p className="text-gray-400 text-sm max-w-sm mx-auto lg:mx-0">
                   {step === 'waiting' ? 'Menunggu pengirim mentransfer file ke jembatan ini.' : 'Sesi Anda telah aktif dan siap dipindai atau dibagikan ke perangkat tujuan.'}
                 </p>
               </div>
               
               <div className="space-y-3 pt-6 max-w-sm mx-auto lg:mx-0">
                  <div className="flex items-center p-1 bg-white/5 border border-white/10 rounded-xl overflow-hidden focus-within:border-indigo-500/50 transition-colors">
                     <div className="flex-1 px-4 truncate font-mono text-sm text-gray-300">
                       {step === 'waiting' ? getReceiveURL() : getShareURL()}
                     </div>
                     <button onClick={() => copyLink(step === 'waiting' ? getReceiveURL() : getShareURL())} className="bg-white/10 hover:bg-white/20 text-white px-6 py-3 text-xs font-bold rounded-lg transition-colors">
                       {copied ? 'Tersalin' : 'Salin URL'}
                     </button>
                  </div>
                  <button onClick={async () => {
                     const url = step === 'waiting' ? getReceiveURL() : getShareURL();
                     if (navigator.share) await navigator.share({ url }); else copyLink(url);
                  }} className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-sm transition-all shadow-[0_0_30px_-10px_rgba(79,70,229,0.5)] flex items-center justify-center gap-2">
                     <ShareIcon /> Bagikan Link via Sosmed
                  </button>
               </div>
               
               {e2eeEnabled && step === 'success' && (
                  <div className="p-6 rounded-2xl border border-indigo-500/30 bg-indigo-500/10 text-left max-w-sm mx-auto lg:mx-0 mt-8 backdrop-blur-sm">
                    <span className="text-xs font-semibold text-indigo-300 uppercase tracking-widest mb-3 block">KUNCI PEMBUKA (SECRET)</span>
                    <p className="text-2xl font-mono text-white break-all">{encryptionKey}</p>
                    <p className="text-[10px] text-indigo-400/60 mt-3">Infokan kunci ini kepada pemerima. Jika hilang, file tidak bisa diselamatkan.</p>
                  </div>
               )}
               
               <button onClick={() => setStep('input')} className="text-sm font-medium text-gray-500 hover:text-white transition-colors mt-8 inline-block">Mulai Sesi Baru / Hancurkan Ini</button>
            </div>
            
            <div className="glass-panel p-8 bg-white flex flex-col items-center">
               <div className="bg-white rounded-2xl overflow-hidden p-2">
                 <QRCodeSVG 
                    value={step === 'waiting' ? getReceiveURL() : getShareURL()} 
                    size={qrSize} 
                    level="H" 
                    bgColor="#FFFFFF" 
                    fgColor="#000000" 
                    marginSize={0}
                 />
               </div>
               <p className="text-black/40 text-xs font-bold font-mono tracking-widest mt-6">PINDAI QR UTK BUKA</p>
            </div>
          </div>
        )}
      </main>

      {/* LANDING PAGE / WHAT IS THIS? */}
      {step === 'input' && (
        <section className="w-full mt-12 mb-24 px-6 flex flex-col items-center opacity-90 transition-opacity">
          <div className="max-w-5xl mx-auto space-y-20">
            <div className="text-center">
              <h2 className="text-3xl font-bold text-white mb-2">Kenapa Memilih RafQR?</h2>
              <p className="text-gray-400">Dibangun untuk solusi transfer super cepat, rahasia, tanpa bikin pusing.</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="glass-panel p-8 rounded-3xl text-left border-t border-white/20 relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="w-12 h-12 bg-indigo-500/20 text-indigo-400 rounded-2xl flex items-center justify-center mb-6 shadow-xl border border-indigo-500/20">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                </div>
                <h3 className="text-lg font-bold mb-3 text-white tracking-tight">Cepat Secepat Kilat</h3>
                <p className="text-sm text-gray-400 leading-relaxed font-medium">Lompat batas device! Dari Laptop ke iPhone, Android ke PC. Bebas OS dengan modal browser saja.</p>
              </div>
              <div className="glass-panel p-8 rounded-3xl text-left border-t border-white/20 relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-2xl flex items-center justify-center mb-6 shadow-xl border border-emerald-500/20">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                </div>
                <h3 className="text-lg font-bold mb-3 text-white tracking-tight">Kerahasiaan E2EE</h3>
                <p className="text-sm text-gray-400 leading-relaxed font-medium">Bungkus keamanan dengan AES-256 E2EE. Kunci diproses di browser, kami sekalipun tidak dapat mengintip isinya!</p>
              </div>
              <div className="glass-panel p-8 rounded-3xl text-left border-t border-white/20 relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-rose-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="w-12 h-12 bg-rose-500/20 text-rose-400 rounded-2xl flex items-center justify-center mb-6 shadow-xl border border-rose-500/20">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </div>
                <h3 className="text-lg font-bold mb-3 text-white tracking-tight">Hilang Tanpa Sisa</h3>
                <p className="text-sm text-gray-400 leading-relaxed font-medium">Storage Anda aman. Semua data akan dihapus mandiri dari server tanpa sisa dalam durasi 30 menit otomatis (Ephemeral).</p>
              </div>
            </div>

            {/* CARA KERJA (How it works) */}
            <div className="bg-white/[0.02] border border-white/10 rounded-3xl p-8 md:p-12 shadow-2xl">
               <div className="text-center mb-10">
                 <h2 className="text-3xl font-bold text-white mb-2">3 Langkah Penggunaan</h2>
                 <p className="text-gray-400">Langsung bisa kirim ke teman tanpa babibu lagi.</p>
               </div>
               <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative items-start">
                  <div className="text-center">
                    <div className="w-14 h-14 bg-white/10 text-white font-bold flex items-center justify-center rounded-full mx-auto mb-6 text-xl border border-white/20">1</div>
                    <h4 className="font-bold mb-2 text-lg">Lempar File</h4>
                    <p className="text-sm text-gray-400 leading-relaxed">Taruh file rahasiamu. Beri Gembok PIN atau Kunci E2EE bila dirasa perlu mengamankannya.</p>
                  </div>
                  <div className="text-center">
                    <div className="w-14 h-14 bg-white/10 text-white font-bold flex items-center justify-center rounded-full mx-auto mb-6 text-xl border border-white/20">2</div>
                    <h4 className="font-bold mb-2 text-lg">Bagikan Akses</h4>
                    <p className="text-sm text-gray-400 leading-relaxed">QR Code akan langsung terbentuk. Berikan ini di depan layar atau salin tautannya ya.</p>
                  </div>
                  <div className="text-center">
                    <div className="w-14 h-14 bg-indigo-600 text-white font-bold flex items-center justify-center rounded-full mx-auto mb-6 text-xl shadow-[0_0_30px_rgba(79,70,229,0.5)] border border-indigo-400">3</div>
                    <h4 className="font-bold mb-2 text-lg">Terima Data!</h4>
                    <p className="text-sm text-gray-400 leading-relaxed">Tinggal klik unduh, dan boom! Datanya pindah sekejap tanpa singgah lama.</p>
                  </div>
               </div>
            </div>
            
          </div>
        </section>
      )}

      <footer className="relative z-10 w-full py-8 text-center text-xs font-semibold text-gray-500 border-t border-white/5 bg-black/40">
         <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-6">
           <p>© {new Date().getFullYear()} RafQR Data Bridge. Oleh RaffiTech Labs.</p>
           <span className="hidden sm:block w-1 h-1 bg-gray-600 rounded-full" />
           <p className="cursor-pointer hover:text-white transition-colors">Dibuat dengan ❤️ dari Indonesia</p>
         </div>
      </footer>
    </div>
  );
}
