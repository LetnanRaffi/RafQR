'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { uploadFileToSupabase } from '../../../lib/supabase-storage';
import { Logo } from '../../../components/Logo';

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
  <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
  </svg>
);
const XIcon = () => (<svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>);

interface UploadedFile {
  fileName: string;
  fileSize: number;
  fileType: string;
  firebaseUrl: string; // Keep naming for compatibility
  storageRef: string;
}

export default function MobileUploaderPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [textContent, setTextContent] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const newPs: Record<string, string> = {};
    selectedFiles.forEach(f => {
      if (f.type.startsWith('image/')) newPs[`${f.name}-${f.lastModified}`] = URL.createObjectURL(f);
    });
    setPreviews(newPs);
    return () => Object.values(newPs).forEach(url => URL.revokeObjectURL(url));
  }, [selectedFiles]);

  const handleUpload = async () => {
    if (selectedFiles.length === 0 && !textContent.trim()) {
      setError('Pilih file atau isi teks.');
      return;
    }
    setIsUploading(true);
    setProgress(0);
    setError(null);
    const uploadedFiles: UploadedFile[] = [];
    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const { downloadURL, storagePath } = await uploadFileToSupabase(selectedFiles[i], (p: number) => {
          setProgress(Math.round(((i + p/100) / (selectedFiles.length || 1)) * 100));
        });
        uploadedFiles.push({ fileName: selectedFiles[i].name, fileSize: selectedFiles[i].size, fileType: selectedFiles[i].type, firebaseUrl: downloadURL, storageRef: storagePath });
      }
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, files: uploadedFiles.length > 0 ? uploadedFiles : undefined, textContent: textContent.trim() || undefined }),
      });
      if (!res.ok) throw new Error('Gagal mengirim data ke server.');
      
      // Track Analytics
      try {
        uploadedFiles.forEach(f => {
          fetch('/api/analytics', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'transfer', fileId: id, fileSize: f.fileSize, fileName: f.fileName }),
          });
        });
      } catch (e) {}

      router.push(`/d/${id}`); // Show them what they just sent
    } catch (err: any) { setError(err.message || 'Error.'); }
    finally { setIsUploading(false); }
  };

  return (
    <div className="min-h-screen bg-white text-black font-sans flex flex-col p-6 sm:p-10 relative overflow-hidden selection:bg-neo-yellow selection:text-black">
      {/* BACKGROUND DECO */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, black 1px, transparent 0)', backgroundSize: '24px 24px' }}></div>

      <header className="flex items-center justify-between mb-12 w-full max-w-2xl mx-auto relative z-10">
        <button onClick={() => router.push('/')} className="flex items-center gap-4 hover:-rotate-2 transition-transform">
           <div className="bg-black p-1.5 border-2 border-black shadow-[2px_2px_0px_0px_rgba(255,255,255,1)]">
              <Logo size={24} color="white" />
           </div>
           <h1 className="text-2xl font-black tracking-tighter uppercase">RafQR</h1>
        </button>
        <div className="bg-neo-pink text-white px-3 py-1 border-4 border-black text-xs font-black uppercase rotate-3 shadow-neo">
          Direct Push
        </div>
      </header>

      <main className="max-w-2xl mx-auto w-full space-y-8 animate-fade-in pb-32">
        <div className="space-y-3 relative">
          <div className="absolute -top-8 -left-4 text-7xl font-black text-neo-blue/20 pointer-events-none -z-10 select-none">PUSH</div>
          <h2 className="text-5xl font-black tracking-tighter uppercase leading-none">Kirim <span className="bg-neo-yellow px-2 border-4 border-black inline-block -rotate-1">Mandiri</span></h2>
          <p className="text-sm font-black uppercase tracking-widest text-black/40">Terhubung Sesi: <span className="text-black bg-neo-green px-1">{id}</span></p>
        </div>

        <div className="neo-card p-0 bg-white overflow-hidden flex flex-col">
          <div className="px-6 py-8 space-y-8">
            <div 
              className="p-10 border-4 border-dashed border-black hover:bg-neo-green/10 cursor-pointer transition-all flex flex-col items-center justify-center gap-4 text-center group"
              onClick={() => !isUploading && fileInputRef.current?.click()}
            >
              <div className="w-16 h-16 bg-black text-neo-green flex items-center justify-center border-4 border-black shadow-[4px_4px_0px_0px_rgba(163,230,53,1)] group-hover:scale-110 transition-transform">
                <UploadCloudIcon />
              </div>
              <div>
                <p className="font-black text-2xl uppercase tracking-tighter">Pilih Dokumen</p>
                <p className="text-xs font-bold text-black/60 uppercase mt-1">Maksimal 50MB / File</p>
              </div>
              <div className="neo-btn bg-white text-xs px-8 py-3">CARI FILE</div>
              <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => setSelectedFiles(p => [...p, ...Array.from(e.target.files || [])])} />
            </div>

            {selectedFiles.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-4">
                {selectedFiles.map((f, i) => (
                  <div key={i} className="aspect-square border-4 border-black bg-white relative group overflow-hidden flex flex-col items-center justify-center shadow-neo-hover">
                    {previews[`${f.name}-${f.lastModified}`] ? (
                      <img src={previews[`${f.name}-${f.lastModified}`]} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                    ) : (
                      <span className="text-xs font-black text-black uppercase tracking-widest">{getFileExt(f.name)}</span>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); setSelectedFiles(p => p.filter((_, idx) => idx !== i)); }} className="absolute inset-0 bg-neo-pink/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white"><XIcon /></button>
                  </div>
                ))}
              </div>
            )}

            <textarea 
              value={textContent} 
              onChange={(e) => setTextContent(e.target.value)} 
              placeholder="PESAN TEKS (OPSIONAL)..." 
              className="w-full h-40 neo-input bg-white p-6 text-sm font-bold uppercase transition-all resize-none placeholder-black/30" 
            />
          </div>
        </div>

        <div className="pt-2">
          {!isUploading ? (
            <button onClick={handleUpload} className="w-full neo-btn bg-black text-white hover:bg-neo-green hover:text-black py-4 text-2xl">
              KIRIM KE JEMBATAN
            </button>
          ) : (
            <div className="space-y-4 bg-black text-white p-6 border-4 border-black shadow-neo">
              <div className="flex justify-between text-xs font-black uppercase tracking-widest">
                <span>PENGIRIMAN PAKET...</span>
                <span>{progress}%</span>
              </div>
              <div className="h-6 bg-white border-2 border-white w-full overflow-hidden">
                <div className="h-full bg-neo-green transition-all duration-300 shadow-[inset_-4px_0px_0px_0px_rgba(0,0,0,1)]" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
          {error && <p className="text-center text-xs font-black text-neo-pink bg-black text-white p-3 border-4 border-black uppercase mt-8 animate-pulse rotate-1">!! {error} !!</p>}
        </div>
      </main>
    </div>
  );
}
