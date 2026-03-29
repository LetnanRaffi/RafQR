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
      router.push(`/d/${id}`); // Show them what they just sent
    } catch (err: any) { setError(err.message || 'Error.'); }
    finally { setIsUploading(false); }
  };

  return (
    <div className="min-h-screen bg-black text-white selection:bg-white selection:text-black font-sans p-6">
      <header className="flex items-center gap-3 mb-12">
        <Logo size={32} />
        <h1 className="text-xl font-black tracking-tighter uppercase italic">RafQR Send</h1>
      </header>

      <main className="max-w-xl mx-auto space-y-10">
        <div className="space-y-4">
          <h2 className="text-3xl font-black uppercase tracking-tighter leading-none">Upload <br /><span className="opacity-20">To Computer</span></h2>
          <p className="text-[10px] font-black uppercase tracking-widest opacity-40">Mengirim ke sesi: {id}</p>
        </div>

        <div className="space-y-8">
          <div 
            className="p-10 border-2 border-dashed border-white/10 text-center active:border-white transition-all"
            onClick={() => fileInputRef.current?.click()}
          >
            <UploadCloudIcon />
            <p className="font-black uppercase tracking-widest text-xs mt-4">Tap to select files</p>
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => setSelectedFiles(p => [...p, ...Array.from(e.target.files || [])])} />
          </div>

          {selectedFiles.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {selectedFiles.map((f, i) => (
                <div key={i} className="aspect-square border border-white/5 bg-white/5 relative group overflow-hidden">
                  {previews[`${f.name}-${f.lastModified}`] ? <img src={previews[`${f.name}-${f.lastModified}`]} className="w-full h-full object-cover grayscale opacity-60" /> : <div className="w-full h-full flex items-center justify-center text-[10px] font-black opacity-10 uppercase">{getFileExt(f.name)}</div>}
                  <button onClick={() => setSelectedFiles(p => p.filter((_, idx) => idx !== i))} className="absolute top-1 right-1 w-6 h-6 bg-black ring-1 ring-white/10 flex items-center justify-center"><XIcon /></button>
                </div>
              ))}
            </div>
          )}

          <textarea 
            value={textContent} 
            onChange={(e) => setTextContent(e.target.value)} 
            placeholder="Tambahkan pesan teks..." 
            className="w-full h-40 bg-white/[0.01] border border-white/10 p-6 text-lg focus:outline-none focus:border-white transition-all resize-none placeholder-white/5" 
          />
        </div>

        <div className="pt-6">
          {!isUploading ? (
            <button onClick={handleUpload} className="w-full py-6 bg-white text-black font-black uppercase tracking-widest">
              Kirim ke PC
            </button>
          ) : (
            <div className="space-y-4">
              <div className="h-0.5 bg-white/5 w-full"><div className="h-full bg-white transition-all duration-500" style={{ width: `${progress}%` }} /></div>
              <div className="text-[10px] font-black tracking-widest uppercase opacity-40 text-center">Megirim... {progress}%</div>
            </div>
          )}
          {error && <p className="text-xs font-black text-red-600 uppercase tracking-widest mt-4">Error: {error}</p>}
        </div>
      </main>
    </div>
  );
}
