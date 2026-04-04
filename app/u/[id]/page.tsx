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
    <div className="min-h-screen bg-transparent text-white selection:bg-indigo-500/30 selection:text-white font-sans flex flex-col p-6 sm:p-10">
      <header className="flex items-center gap-3 mb-10 w-full max-w-2xl mx-auto animate-slide-down">
        <Logo size={28} />
        <h1 className="text-xl font-bold tracking-tight">RafQR Kirim File</h1>
      </header>

      <main className="max-w-2xl mx-auto w-full space-y-8 animate-fade-in pb-32">
        <div className="space-y-2">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400">Transfer Mandiri</h2>
          <p className="text-sm font-medium text-gray-400">Terhubung menuju Sesi: <span className="font-mono text-indigo-400">{id}</span></p>
        </div>

        <div className="glass-panel p-2 flex flex-col mb-8">
          <div className="px-4 py-4 sm:p-6 space-y-6">
            <div 
              className="p-8 pb-10 border-2 border-dashed border-white/10 hover:border-indigo-500/50 bg-white/[0.02] hover:bg-white/[0.05] cursor-pointer rounded-2xl text-center transition-all flex flex-col items-center justify-center gap-2"
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-2">
                <UploadCloudIcon />
              </div>
              <p className="font-semibold text-sm">Pilih file untuk ditransmisikan</p>
              <p className="text-xs text-gray-500 font-medium">Bebas tipe file maksimal 50MB</p>
              <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => setSelectedFiles(p => [...p, ...Array.from(e.target.files || [])])} />
            </div>

            {selectedFiles.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {selectedFiles.map((f, i) => (
                  <div key={i} className="aspect-square border border-white/10 bg-white/5 rounded-xl relative group overflow-hidden flex flex-col items-center justify-center">
                    {previews[`${f.name}-${f.lastModified}`] ? (
                      <img src={previews[`${f.name}-${f.lastModified}`]} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                    ) : (
                      <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">{getFileExt(f.name)}</span>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); setSelectedFiles(p => p.filter((_, idx) => idx !== i)); }} className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm"><XIcon /></button>
                  </div>
                ))}
              </div>
            )}

            <textarea 
              value={textContent} 
              onChange={(e) => setTextContent(e.target.value)} 
              placeholder="Tambahkan pesan teks jika Anda mau..." 
              className="w-full h-32 bg-white/5 border border-white/10 rounded-2xl p-5 text-sm focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all resize-none placeholder-gray-500" 
            />
          </div>
        </div>

        <div className="pt-2">
          {!isUploading ? (
            <button onClick={handleUpload} className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold tracking-wide transition-all shadow-[0_0_30px_-10px_rgba(79,70,229,0.5)]">
              Kirim ke Jembatan PC
            </button>
          ) : (
            <div className="space-y-3 bg-white/5 p-5 rounded-xl border border-white/10">
              <div className="flex justify-between text-xs font-medium text-gray-400">
                <span>Mengirim Paket...</span>
                <span>{progress}%</span>
              </div>
              <div className="h-1.5 bg-white/10 rounded-full w-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
          {error && <p className="text-center text-xs font-medium text-red-400 mt-4">{error}</p>}
        </div>
      </main>
    </div>
  );
}
