'use client';

import { useState, useRef, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { uploadFileToR2 } from '../../../lib/r2-client';
import { getFileExt } from '../../../lib/format';
import { PageShell, SiteHeader } from '../../../components/ui';
import { CloudUpIcon, XIcon } from '../../../components/icons';

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
        const { downloadURL, storagePath } = await uploadFileToR2(selectedFiles[i], (p: number) => {
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
    <PageShell>
      <SiteHeader
        onLogoClick={() => router.push('/')}
        right={<span className="neo-tag bg-accent">Kirim langsung</span>}
      />

      <main className="max-w-2xl mx-auto w-full px-5 py-10 space-y-7 animate-fade-in pb-24">
        <div className="space-y-2">
          <h2 className="text-3xl font-extrabold tracking-tight">Kirim ke perangkat tujuan</h2>
          <p className="text-sm font-medium text-muted">
            Sesi <span className="neo-mono text-ink bg-accent/30 px-1.5 rounded">{id}</span>
          </p>
        </div>

        <div className="neo-card p-4 sm:p-5 space-y-5">
          <div
            className="p-8 border-2 border-dashed border-ink rounded-lg hover:bg-accent/10 cursor-pointer transition-all flex flex-col items-center justify-center gap-3 text-center"
            onClick={() => !isUploading && fileInputRef.current?.click()}
          >
            <span className="w-14 h-14 bg-ink text-accent flex items-center justify-center rounded-lg">
              <CloudUpIcon />
            </span>
            <div>
              <p className="font-bold text-lg">Pilih dokumen</p>
              <p className="text-xs font-medium text-muted mt-0.5">Maks 50 MB / file</p>
            </div>
            <span className="neo-btn bg-white text-xs">Cari file</span>
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => setSelectedFiles(p => [...p, ...Array.from(e.target.files || [])])} />
          </div>

          {selectedFiles.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {selectedFiles.map((f, i) => (
                <div key={i} className="aspect-square border-2 border-ink rounded-md bg-white relative group overflow-hidden flex flex-col items-center justify-center shadow-neo-hover">
                  {previews[`${f.name}-${f.lastModified}`] ? (
                    <img src={previews[`${f.name}-${f.lastModified}`]} className="w-full h-full object-cover" />
                  ) : (
                    <span className="neo-mono text-xs font-bold text-ink">{getFileExt(f.name)}</span>
                  )}
                  <button onClick={(e) => { e.stopPropagation(); setSelectedFiles(p => p.filter((_, idx) => idx !== i)); }} className="absolute inset-0 bg-danger/85 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white"><XIcon /></button>
                </div>
              ))}
            </div>
          )}

          <textarea
            value={textContent}
            onChange={(e) => setTextContent(e.target.value)}
            placeholder="Pesan teks (opsional)…"
            className="neo-input h-32 resize-none"
          />
        </div>

        <div>
          {!isUploading ? (
            <button onClick={handleUpload} className="w-full neo-btn bg-ink text-white py-4 text-base hover:bg-accent hover:text-ink">
              Kirim sekarang
            </button>
          ) : (
            <div className="space-y-3 bg-ink text-white p-4 rounded-lg">
              <div className="flex justify-between text-xs font-bold neo-mono">
                <span>Mengirim…</span>
                <span>{progress}%</span>
              </div>
              <div className="h-3 bg-white/15 rounded-full w-full overflow-hidden">
                <div className="h-full bg-accent rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
          {error && <p className="text-center text-xs font-bold text-danger mt-3">{error}</p>}
        </div>
      </main>
    </PageShell>
  );
}
