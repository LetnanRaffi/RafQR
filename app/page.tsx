'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { uploadFileToSupabase } from '../lib/supabase-storage';
import { QRCodeSVG } from 'qrcode.react';
import { Logo } from '../components/Logo';

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
const UploadCloudIcon = () => (
  <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
  </svg>
);

const TextIcon = () => (
  <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3h9m-9 3h4.5M2.25 5.25v13.5a2.25 2.25 0 002.25 2.25h15a2.25 2.25 0 002.25-2.25V5.25A2.25 2.25 0 0019.5 3h-15a2.25 2.25 0 00-2.25 2.25z" />
  </svg>
);

const XIcon = () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>);
const ArrowLeftIcon = () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>);

// ─── Types ───────────────────────────────────────────────────
interface UploadedFile {
  fileName: string;
  fileSize: number;
  fileType: string;
  firebaseUrl: string;
  storageRef: string;
}

type Mode = 'none' | 'file' | 'text' | 'both';
type Step = 'choice' | 'input' | 'success';

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleResize = () => setQrSize(window.innerWidth < 640 ? 200 : 300);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const newPreviews: Record<string, string> = {};
    selectedFiles.forEach(file => {
      if (file.type.startsWith('image/')) {
        const url = URL.createObjectURL(file);
        newPreviews[`${file.name}-${file.lastModified}`] = url;
      }
    });
    setPreviews(newPreviews);
    return () => Object.values(newPreviews).forEach(url => URL.revokeObjectURL(url));
  }, [selectedFiles]);

  const selectMode = (m: Mode) => {
    setMode(m);
    setStep('input');
    setError(null);
  };

  const handleDragEnter = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    setSelectedFiles(prev => [...prev, ...files]);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setSelectedFiles(prev => [...prev, ...files]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0 && !textContent.trim()) {
      setError('Masukkan data untuk dikirim.');
      return;
    }
    setIsUploading(true);
    setOverallProgress(0);
    const uploadedFiles: UploadedFile[] = [];
    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const { downloadURL, storagePath } = await uploadFileToSupabase(selectedFiles[i], (p) => {
          setOverallProgress(Math.round(((i + p/100) / (selectedFiles.length || 1)) * 100));
        });
        uploadedFiles.push({ fileName: selectedFiles[i].name, fileSize: selectedFiles[i].size, fileType: selectedFiles[i].type, firebaseUrl: downloadURL, storageRef: storagePath });
      }
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: uploadedFiles.length > 0 ? uploadedFiles : undefined, textContent: textContent.trim() || undefined }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      setUniqueId(result.uniqueId);
      setStep('success');
    } catch (err: any) { setError(err.message || 'Error.'); }
    finally { setIsUploading(false); }
  };

  const reset = () => { setStep('choice'); setMode('none'); setSelectedFiles([]); setTextContent(''); setUniqueId(null); setError(null); };

  const getShareURL = () => (typeof window !== 'undefined' ? `${window.location.origin}/d/${uniqueId}` : '');
  const copyLink = async () => {
    const url = getShareURL();
    try {
      await navigator.clipboard.writeText(url);
    } catch (err) {
      const textArea = document.createElement("textarea");
      textArea.value = url;
      document.body.appendChild(textArea);
      textArea.select();
      try { document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(textArea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
          
          {/* STEP 0: CHOICE */}
          {step === 'choice' && (
            <div className="animate-fade-in space-y-12 sm:space-y-20 py-10 w-full">
              <div>
                <h2 className="text-5xl sm:text-7xl lg:text-8xl font-black tracking-tighter uppercase leading-[0.85] mb-6">
                  Select <br />
                  Transfer <br />
                  <span className="opacity-20">Method</span>
                </h2>
                <div className="h-0.5 w-12 bg-white/20" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button onClick={() => selectMode('file')} className="p-10 border border-white/5 hover:bg-white hover:text-black transition-all group text-left">
                  <div className="mb-8"><UploadCloudIcon /></div>
                  <div className="font-black text-xl uppercase italic mb-2 tracking-tighter">Transfer File</div>
                  <div className="text-[10px] opacity-40 font-bold uppercase tracking-widest">Kirim media & dokumen.</div>
                </button>
                <button onClick={() => selectMode('text')} className="p-10 border border-white/5 hover:bg-white hover:text-black transition-all group text-left">
                  <div className="mb-8"><TextIcon /></div>
                  <div className="font-black text-xl uppercase italic mb-2 tracking-tighter">Copy Text</div>
                  <div className="text-[10px] opacity-40 font-bold uppercase tracking-widest">Kirim catatan & link.</div>
                </button>
                <button onClick={() => selectMode('both')} className="p-10 border border-white/5 hover:bg-white hover:text-black transition-all group text-left">
                  <div className="mb-8 flex gap-1"><UploadCloudIcon /><TextIcon /></div>
                  <div className="font-black text-xl uppercase italic mb-2 tracking-tighter">Combined</div>
                  <div className="text-[10px] opacity-40 font-bold uppercase tracking-widest">File sekaligus teks.</div>
                </button>
              </div>
            </div>
          )}

          {/* STEP 1: INPUT */}
          {step === 'input' && (
            <div className="animate-fade-in-up space-y-8 sm:space-y-12 py-10 w-full">
              <button onClick={() => setStep('choice')} className="group flex items-center gap-2 text-[10px] font-black uppercase tracking-widest opacity-40 hover:opacity-100 transition-opacity">
                <ArrowLeftIcon /> Back To Methods
              </button>
              
              <div className="space-y-10">
                {(mode === 'file' || mode === 'both') && (
                  <div className="space-y-6">
                    <div 
                      className={`p-10 sm:p-24 border-2 border-dashed transition-all cursor-pointer text-center ${isDragging ? 'border-white bg-white/5' : 'border-white/10 hover:border-white/20'}`}
                      onDragOver={(e) => e.preventDefault()} onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <p className="font-black uppercase tracking-tighter text-xl sm:text-4xl mb-2">Drop your files</p>
                      <p className="text-[10px] font-black uppercase opacity-20 tracking-widest">or browse local storage</p>
                      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileInput} />
                    </div>
                    {selectedFiles.length > 0 && (
                      <div className="grid grid-cols-2 xs:grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2">
                        {selectedFiles.map((f, i) => {
                          const pk = `${f.name}-${f.lastModified}`;
                          return (
                            <div key={i} className="aspect-square border border-white/5 bg-white/5 relative group overflow-hidden">
                              {previews[pk] ? <img src={previews[pk]} className="w-full h-full object-cover grayscale opacity-60 group-hover:grayscale-0 transition-opacity" /> : <div className="w-full h-full flex items-center justify-center text-[10px] font-black opacity-10 uppercase">{getFileExt(f.name)}</div>}
                              <button onClick={(e) => { e.stopPropagation(); setSelectedFiles(p => p.filter((_, idx) => idx !== i)); }} className="absolute top-1 right-1 w-6 h-6 bg-black ring-1 ring-white/10 flex items-center justify-center hover:bg-red-900 transition-all"><XIcon /></button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
                {(mode === 'text' || mode === 'both') && (
                  <textarea value={textContent} onChange={(e) => setTextContent(e.target.value)} placeholder="Type your data here..." className="w-full h-48 sm:h-96 bg-white/[0.01] border border-white/10 p-8 sm:p-12 text-xl sm:text-3xl font-medium focus:outline-none focus:border-white transition-all resize-none placeholder-white/5 font-sans" />
                )}
              </div>

              <div className="pt-10">
                {!isUploading ? (
                  <button onClick={handleUpload} className="w-full py-6 sm:py-8 bg-white text-black font-black uppercase tracking-[0.2em] sm:text-lg hover:bg-white/90 active:scale-[0.99] transition-all">
                    Generate Secure QR
                  </button>
                ) : (
                  <div className="space-y-4">
                    <div className="h-0.5 bg-white/5 w-full">
                      <div className="h-full bg-white transition-all duration-500" style={{ width: `${overallProgress}%` }} />
                    </div>
                    <div className="flex justify-between items-center text-[10px] font-black tracking-widest px-1 uppercase opacity-40"><span>Processing Transfer</span><span>{overallProgress}%</span></div>
                  </div>
                )}
                {error && <p className="text-xs font-black text-red-600 uppercase tracking-widest mt-4">Error: {error}</p>}
              </div>
            </div>
          )}

          {/* STEP 2: SUCCESS */}
          {step === 'success' && (
            <div className="animate-scale-in grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-20 items-center py-10">
              <div className="space-y-10">
                <div>
                  <h2 className="text-4xl sm:text-6xl font-black uppercase tracking-tighter leading-none mb-4">Content <br /><span className="opacity-20 underline">Secured</span></h2>
                  <p className="text-[11px] font-black uppercase tracking-widest opacity-40 leading-relaxed max-w-sm">Pindai QR Code di sebelah untuk mengakses data Anda. Berlaku 30 menit dari sekarang.</p>
                </div>
                <div className="space-y-4">
                  <div className="flex bg-white/5 border border-white/10 p-4 sm:p-6 overflow-hidden">
                    <span className="text-[10px] opacity-40 flex-1 truncate font-mono">{getShareURL()}</span>
                    <button onClick={copyLink} className="text-xs font-black uppercase hover:underline ml-6 underline-offset-4">{copied ? 'Copied' : 'Copy Link'}</button>
                  </div>
                </div>
                <button onClick={reset} className="w-full py-6 border border-white/10 text-xs font-black uppercase tracking-widest hover:bg-white/5 transition-all">Start New Transfer</button>
              </div>

              <div className="flex flex-col items-center lg:items-end">
                <div className="p-8 sm:p-12 bg-white ring-[16px] ring-white/5">
                  <QRCodeSVG value={getShareURL()} size={qrSize} level="H" bgColor="#FFFFFF" fgColor="#000000" marginSize={0} />
                </div>
                <div className="mt-8 text-center sm:text-right space-y-1">
                  <div className="text-[10px] font-black uppercase tracking-[0.3em] bg-white text-black px-4 py-1 inline-block">Scan To Access</div>
                  <p className="text-[9px] font-black uppercase tracking-widest opacity-20 mt-4 block">Compatible with any device camera</p>
                </div>
              </div>
            </div>
          )}

        </div>
      </main>

      <footer className="footer w-full p-8 sm:p-12 border-t border-white/5 flex flex-col sm:flex-row justify-between items-center gap-6">
        <p className="text-[9px] opacity-20 font-black uppercase tracking-widest leading-none">© 2026 / RAFQR / RAFFITECH SOLUTIONS / V2.2</p>
        <div className="flex gap-4">
          <div className="px-3 py-1 ring-1 ring-white/5 text-[8px] font-black uppercase tracking-widest opacity-40">System_OK</div>
        </div>
      </footer>
    </div>
  );
}
