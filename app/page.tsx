'use client';

import { useState, useRef, useEffect } from 'react';
import { uploadFileToR2 } from '../lib/r2-client';
import { encryptData } from '../lib/crypto';
import { nanoid } from 'nanoid';
import BrandedQR from '../components/BrandedQR';
import { toast } from '../components/toast';
import { PageShell, SiteHeader, SiteFooter, Toggle } from '../components/ui';
import {
  XIcon, ShareIcon, MicIcon, StopIcon, DiceIcon, RefreshIcon,
  CloudUpIcon, BoltIcon, ShieldIcon, TrashIcon, ArrowUpIcon, ArrowDownIcon,
} from '../components/icons';

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
  const [isManualId, setIsManualId] = useState(false);

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
        toast('Catatan suara ditambahkan.', 'success');
      };
      audioChunksRef.current = [];
      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (err) {
      toast('Izin mikrofon ditolak atau tidak didukung.', 'error');
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
    const handleResize = () => setQrSize(window.innerWidth < 640 ? 200 : 280);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (activeMode === 'receive' && !isManualId && !customId) {
      setCustomId(nanoid(8).toUpperCase());
    }
  }, [activeMode, isManualId, customId]);

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
    if (e2eeEnabled && (encryptionKey.length < 8)) { setError('Kunci E2EE minimal 8 karakter.'); return; }

    setIsUploading(true); setOverallProgress(0); setDownloadedAtLeastOnce(false);
    const uploadedFiles: UploadedFile[] = [];
    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        let finalBlob: Blob = selectedFiles[i];
        if (e2eeEnabled) finalBlob = await encryptData(selectedFiles[i], encryptionKey);
        const { downloadURL, storagePath } = await uploadFileToR2(finalBlob, (p) => { setOverallProgress(Math.round(((i + p/100) / (selectedFiles.length || 1)) * 100)); }, selectedFiles[i].name);
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
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast('Tautan tersalin.', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      toast('Gagal menyalin tautan.', 'error');
    }
  };

  const getShareURL = () => (typeof window !== 'undefined' ? `${window.location.origin}/d/${uniqueId}` : '');
  const getReceiveURL = () => (typeof window !== 'undefined' ? `${window.location.origin}/u/${uniqueId}` : '');

  return (
    <PageShell>
      <SiteHeader onLogoClick={() => setStep('input')} showScan onScan={() => (window.location.href = '/scan')} />

      <main className="relative z-10 flex-1 flex flex-col items-center pt-10 sm:pt-16 pb-24 px-5 max-w-5xl mx-auto w-full">
        {step === 'input' && (
          <div className="w-full flex justify-center animate-fade-in flex-col items-center">
            {/* HERO */}
            <div className="text-center mb-12 flex flex-col items-center max-w-2xl">
               <span className="neo-tag bg-accent mb-6">Kirim file & teks antar perangkat</span>
               <h2 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-[1.05] mb-5">
                  Pindahkan data ke perangkat lain,
                  <span className="text-muted"> tanpa ribet.</span>
               </h2>
               <p className="text-base sm:text-lg text-muted font-medium leading-relaxed">
                  Buat sesi, tunjukkan QR-nya, selesai. Tanpa akun, tanpa aplikasi —
                  file otomatis terhapus dalam 30 menit.
               </p>
            </div>

            <div className="neo-card neo-card-hover w-full max-w-2xl p-4 sm:p-5 mb-12">
              {/* MODE SWITCH */}
              <div className="flex gap-1 p-1 mb-5 border-2 border-ink rounded-md bg-paper">
                 <button onClick={() => setActiveMode('send')} className={`flex-1 py-2.5 text-sm font-bold rounded transition-all ${activeMode === 'send' ? 'bg-ink text-white' : 'text-muted hover:text-ink'}`}>Kirim</button>
                 <button onClick={() => setActiveMode('receive')} className={`flex-1 py-2.5 text-sm font-bold rounded transition-all ${activeMode === 'receive' ? 'bg-ink text-white' : 'text-muted hover:text-ink'}`}>Terima</button>
              </div>

              {activeMode === 'send' ? (
                <div className="px-1 sm:px-2 pb-2 space-y-5">
                   {/* DROPZONE */}
                   <div
                      onClick={() => !isUploading && fileInputRef.current?.click()}
                      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={(e) => { e.preventDefault(); setIsDragging(false); if(!isUploading) setSelectedFiles(p => [...p, ...Array.from(e.dataTransfer.files)]); }}
                      className={`relative overflow-hidden border-2 border-dashed border-ink rounded-lg transition-all cursor-pointer ${isDragging ? 'bg-accent/20' : 'bg-paper hover:bg-accent/10'} ${isUploading ? 'opacity-50 cursor-not-allowed' : ''} p-8 flex flex-col items-center justify-center text-center`}
                   >
                      <span className="bg-ink text-accent p-3.5 rounded-lg mb-3">
                        <CloudUpIcon />
                      </span>
                      <h3 className="text-lg font-bold mb-1">Seret file ke sini</h3>
                      <p className="text-xs font-medium text-muted mb-4">atau klik untuk memilih · maks 50 MB</p>
                      <span className="neo-btn bg-white text-xs">Pilih file</span>
                     <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => setSelectedFiles(p => [...p, ...Array.from(e.target.files || [])])} disabled={isUploading} />
                   </div>

                   {/* FILES PREVIEW */}
                   {selectedFiles.length > 0 && (
                      <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
                        {selectedFiles.map((f, i) => (
                          <div key={i} className="aspect-square bg-white border-2 border-ink rounded-md shadow-neo-hover flex items-center justify-center relative group overflow-hidden">
                            {previews[`${f.name}-${f.lastModified}`] ? (
                              <img src={previews[`${f.name}-${f.lastModified}`]} className="object-cover w-full h-full" />
                            ) : (
                              <span className="neo-mono text-[10px] font-bold text-center px-1 truncate">{f.name.split('.').pop()?.toUpperCase()}</span>
                            )}
                            <button onClick={(e) => { e.stopPropagation(); setSelectedFiles(p => p.filter((_, idx) => idx !== i)); }} className="absolute inset-0 bg-danger/85 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white"><XIcon /></button>
                          </div>
                        ))}
                      </div>
                   )}

                   {/* TEXT AREA */}
                   <div className="relative">
                     <textarea disabled={isUploading} value={textContent} onChange={(e) => setTextContent(e.target.value)} placeholder="Tulis pesan (opsional)…" className="neo-input h-28 resize-none" />
                     <button
                        onClick={isRecording ? stopRecording : startRecording}
                        disabled={isUploading}
                        title={isRecording ? 'Stop rekam' : 'Rekam suara'}
                        aria-label={isRecording ? 'Stop rekam' : 'Rekam suara'}
                        className={`absolute bottom-3 right-3 p-2.5 border-2 border-ink rounded-md transition-all shadow-neo-hover active:shadow-none active:translate-x-[2px] active:translate-y-[2px] ${isRecording ? 'bg-danger text-white' : 'bg-accent text-ink'}`}
                     >
                       {isRecording ? <StopIcon /> : <MicIcon />}
                     </button>
                   </div>

                   {/* SETTINGS */}
                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Toggle label="Enkripsi E2EE" checked={e2eeEnabled} onChange={() => setE2eeEnabled(!e2eeEnabled)} disabled={isUploading} />
                      <Toggle label="Auto-hapus" checked={ghostMode} onChange={() => setGhostMode(!ghostMode)} disabled={isUploading} />
                      <Toggle label="Kunci PIN" checked={pinMode} onChange={() => setPinMode(!pinMode)} disabled={isUploading} />
                      <div className="flex items-center gap-2 px-3.5 border-2 border-ink rounded-md bg-white shadow-neo-hover">
                         <span className="neo-mono text-[11px] font-bold text-muted uppercase">ID</span>
                         <input disabled={isUploading} value={customId} onChange={(e) => setCustomId(e.target.value.replace(/[^a-zA-Z0-9-]/g, '').toLowerCase())} placeholder="otomatis" className="neo-mono bg-transparent w-full py-3 focus:outline-none text-sm font-medium" />
                      </div>
                   </div>

                   <div className="space-y-3">
                     {e2eeEnabled && (
                       <div className="relative">
                          <input disabled={isUploading} value={encryptionKey} onChange={(e) => setEncryptionKey(e.target.value)} placeholder="Kunci rahasia (min 8 karakter)" className="neo-input neo-mono bg-accent/5 pr-12 text-sm" />
                          <button onClick={generateSecureKey} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded hover:bg-ink hover:text-white transition-all" title="Buat kunci acak" aria-label="Buat kunci acak"><DiceIcon /></button>
                       </div>
                     )}
                     {pinMode && (
                       <div className="relative">
                          <input disabled={isUploading} type="password" value={pinCode} onChange={(e) => setPinCode(e.target.value.slice(0, 4))} placeholder="PIN 4 digit" className="neo-input neo-mono bg-accent/5 pr-12 tracking-[0.8em] text-center" />
                          <button onClick={generateSecurePin} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded hover:bg-ink hover:text-white transition-all" title="Buat PIN acak" aria-label="Buat PIN acak"><DiceIcon /></button>
                       </div>
                     )}
                   </div>

                    <div className="pt-2">
                      {!isUploading ? (
                         <button onClick={handleUpload} className="w-full neo-btn bg-ink text-white py-4 text-base hover:bg-accent hover:text-ink">
                           Buat sesi transfer
                         </button>
                      ) : (
                         <div className="space-y-3 bg-ink text-white p-4 rounded-lg">
                            <div className="flex justify-between text-xs font-bold neo-mono">
                              <span>Memproses…</span>
                              <span>{overallProgress}%</span>
                            </div>
                            <div className="h-3 bg-white/15 rounded-full w-full overflow-hidden">
                              <div className="h-full bg-accent rounded-full transition-all duration-300" style={{ width: `${overallProgress}%` }} />
                            </div>
                         </div>
                      )}
                      {error && <p className="text-center text-xs font-bold text-danger mt-3">{error}</p>}
                   </div>
                </div>
              ) : (
                <div className="p-2 sm:p-4 text-center space-y-6 flex flex-col items-center">
                    <h2 className="text-2xl font-extrabold tracking-tight mt-2">Terima langsung ke perangkat ini</h2>
                    <p className="text-sm font-medium text-muted max-w-sm">Bagikan ID di bawah ke pengirim. Begitu mereka mengirim, file muncul otomatis di sini.</p>

                    <div className="w-full space-y-5 text-left">
                      <div className="space-y-2">
                         <div className="flex justify-between items-center">
                           <label className="text-xs font-bold text-muted">ID Penerimaan</label>
                           <button onClick={() => setIsManualId(!isManualId)} className="text-[11px] font-bold text-ink underline decoration-2 decoration-accent hover:decoration-ink transition-colors">
                             {isManualId ? 'Pakai ID otomatis' : 'Pakai ID sendiri'}
                           </button>
                         </div>
                         <div className="relative">
                           <input
                             disabled={!isManualId || isUploading}
                             value={customId}
                             onChange={(e) => setCustomId(e.target.value)}
                             placeholder="contoh: RAF-123"
                             className={`neo-input neo-mono text-center tracking-[0.15em] uppercase font-bold text-lg w-full ${!isManualId ? 'bg-paper cursor-not-allowed' : 'bg-white'}`}
                           />
                           {!isManualId && (
                             <button onClick={() => setCustomId(nanoid(8).toUpperCase())} className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded hover:bg-ink hover:text-white transition-all" title="Acak ulang" aria-label="Acak ulang ID">
                               <RefreshIcon />
                             </button>
                           )}
                         </div>
                      </div>
                      <button onClick={handleReceive} disabled={isUploading || !customId.trim()} className="w-full neo-btn bg-ink text-white py-4 text-base hover:bg-accent hover:text-ink disabled:opacity-50">
                        {isUploading ? (
                          <>
                            <span className="w-4 h-4 border-2 border-white border-t-transparent animate-spin rounded-full" />
                            Menyambungkan…
                          </>
                        ) : 'Aktifkan penerimaan'}
                      </button>
                    </div>
                    {error && <p className="text-center text-xs font-bold text-danger">{error}</p>}
                </div>
              )}
            </div>

            {/* HISTORY */}
            {history.length > 0 && (
              <div className="w-full max-w-2xl mb-16">
                 <h4 className="text-xs font-bold text-muted uppercase tracking-widest mb-3">Sesi sebelumnya</h4>
                 <div className="grid gap-2.5">
                    {history.map((h, i) => (
                      <button key={i} className="p-3.5 bg-white border-2 border-ink rounded-md shadow-neo-hover flex justify-between items-center group hover:-translate-y-0.5 hover:shadow-neo transition-all text-left" onClick={() => window.location.href = `/d/${h.id}`}>
                         <div className="flex items-center gap-3">
                            <span className={`w-9 h-9 rounded-md border-2 border-ink flex items-center justify-center ${h.type === 'send' ? 'bg-accent text-ink' : 'bg-ink text-white'}`}>
                              {h.type === 'send' ? <ArrowUpIcon className="w-4 h-4" /> : <ArrowDownIcon className="w-4 h-4" />}
                            </span>
                            <span className="text-sm font-bold truncate max-w-[160px] sm:max-w-none">{h.title}</span>
                         </div>
                         <span className="neo-mono text-[11px] font-medium text-muted">/{h.id}</span>
                      </button>
                    ))}
                 </div>
              </div>
            )}
          </div>
        )}

        {/* SUCCESS / WAITING STATE */}
        {(step === 'success' || step === 'waiting') && (
          <div className="w-full max-w-4xl flex flex-col lg:flex-row gap-12 items-center justify-center mt-6 animate-fade-in">
            <div className="flex-1 space-y-6 text-center lg:text-left">
               {downloadedAtLeastOnce && <div className="neo-tag bg-ok text-white">Data berhasil disinkronkan</div>}
               <div className="space-y-3">
                 <h2 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-none">
                   {step === 'waiting' ? 'Menunggu kiriman' : 'Sesi aktif'}
                 </h2>
                 <p className="text-muted text-base font-medium max-w-sm mx-auto lg:mx-0">
                   {step === 'waiting' ? 'Jangan tutup halaman ini. File akan muncul otomatis begitu pengirim mengirimnya.' : 'Pindai QR atau bagikan tautan ke perangkat tujuan.'}
                 </p>
               </div>

               <div className="space-y-3 max-w-sm mx-auto lg:mx-0">
                  <div className="flex items-center bg-white border-2 border-ink rounded-md shadow-neo overflow-hidden">
                     <div className="flex-1 px-3.5 truncate neo-mono text-sm">
                       {step === 'waiting' ? getReceiveURL() : getShareURL()}
                     </div>
                     <button onClick={() => copyLink(step === 'waiting' ? getReceiveURL() : getShareURL())} className="bg-ink text-white px-5 py-3.5 text-xs font-bold hover:bg-accent hover:text-ink transition-colors border-l-2 border-ink">
                       {copied ? 'Tersalin' : 'Salin'}
                     </button>
                  </div>
                  <button onClick={async () => {
                     const url = step === 'waiting' ? getReceiveURL() : getShareURL();
                     if (navigator.share) await navigator.share({ url }); else copyLink(url);
                  }} className="w-full neo-btn bg-white py-3.5 text-sm hover:bg-accent">
                     <ShareIcon /> Bagikan tautan
                  </button>
               </div>

               {e2eeEnabled && step === 'success' && (
                  <div className="p-5 border-2 border-ink rounded-lg bg-accent shadow-neo text-left max-w-sm mx-auto lg:mx-0">
                    <div className="neo-tag bg-ink text-white mb-2">Kunci pembuka</div>
                    <p className="neo-mono text-lg font-bold break-all">{encryptionKey}</p>
                    <p className="text-[11px] font-medium text-ink/70 mt-2">Kirim kunci ini ke penerima. Jika hilang, file tidak bisa dibuka.</p>
                  </div>
               )}

               <button onClick={() => setStep('input')} className="text-xs font-bold text-muted hover:text-ink underline decoration-2 decoration-accent transition-colors">Mulai sesi baru</button>
            </div>

            <BrandedQR
              value={step === 'waiting' ? getReceiveURL() : getShareURL()}
              size={qrSize}
              caption={step === 'waiting' ? 'Pindai untuk mengirim' : 'Pindai untuk membuka'}
              rotate="rotate-1"
            />
          </div>
        )}
      </main>

      {/* LANDING SECTIONS */}
      {step === 'input' && (
        <section className="w-full mb-20 px-5 flex flex-col items-center">
          <div className="max-w-4xl mx-auto w-full space-y-16">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="neo-card neo-card-hover p-6">
                <span className="w-11 h-11 rounded-md bg-ink text-accent flex items-center justify-center mb-4"><BoltIcon /></span>
                <h3 className="text-lg font-bold mb-2">Lintas perangkat</h3>
                <p className="text-sm font-medium text-muted leading-relaxed">Laptop ke HP, Android ke PC — cukup lewat browser, tanpa instal apa pun.</p>
              </div>
              <div className="neo-card neo-card-hover p-6">
                <span className="w-11 h-11 rounded-md bg-ink text-accent flex items-center justify-center mb-4"><ShieldIcon /></span>
                <h3 className="text-lg font-bold mb-2">Enkripsi lokal</h3>
                <p className="text-sm font-medium text-muted leading-relaxed">Aktifkan E2EE untuk mengenkripsi di browser. Kunci tidak pernah dikirim ke server.</p>
              </div>
              <div className="neo-card neo-card-hover p-6">
                <span className="w-11 h-11 rounded-md bg-ink text-accent flex items-center justify-center mb-4"><TrashIcon /></span>
                <h3 className="text-lg font-bold mb-2">Tanpa sisa</h3>
                <p className="text-sm font-medium text-muted leading-relaxed">Data terhapus otomatis dari server dalam 30 menit. Tidak ada jejak yang tertinggal.</p>
              </div>
            </div>

            <div className="neo-card p-8 md:p-10">
               <h2 className="text-2xl font-extrabold tracking-tight mb-8 text-center">Tiga langkah</h2>
               <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  {[
                    { n: '1', t: 'Taruh file', d: 'Pilih file atau tulis pesan. Tambahkan PIN atau kunci E2EE bila perlu.' },
                    { n: '2', t: 'Bagikan QR', d: 'QR dan tautan langsung terbentuk. Tunjukkan di layar atau salin.' },
                    { n: '3', t: 'Terima', d: 'Perangkat tujuan pindai atau buka tautan, lalu unduh.' },
                  ].map((s) => (
                    <div key={s.n}>
                      <span className="neo-mono w-10 h-10 bg-accent flex items-center justify-center border-2 border-ink rounded-md mb-4 text-lg font-bold">{s.n}</span>
                      <h4 className="font-bold mb-1.5">{s.t}</h4>
                      <p className="text-sm font-medium text-muted leading-relaxed">{s.d}</p>
                    </div>
                  ))}
               </div>
            </div>
          </div>
        </section>
      )}

      <SiteFooter />
    </PageShell>
  );
}
