'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
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
const DownloadIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
  </svg>
);

const CopyIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" /></svg>
);

const TextIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3h9m-9 3h4.5M2.25 5.25v13.5a2.25 2.25 0 002.25 2.25h15a2.25 2.25 0 002.25-2.25V5.25A2.25 2.25 0 0019.5 3h-15a2.25 2.25 0 00-2.25 2.25z" />
  </svg>
);

// ─── Types ───────────────────────────────────────────────────
interface SessionFile {
  fileName: string;
  fileSize: number;
  fileType: string;
  firebaseUrl: string;
  storageRef: string;
}

interface SessionData {
  files?: SessionFile[];
  textContent?: string;
  createdAt: number;
  totalSize: number;
  fileCount: number;
}

// ─── Component ───────────────────────────────────────────────
export default function DownloadPage() {
  const params = useParams();
  const id = params.id as string;

  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<SessionData | null>(null);
  const [ttl, setTtl] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [downloadingIndex, setDownloadingIndex] = useState<number | null>(null);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchSession = async () => {
      try {
        const res = await fetch(`/api/session?id=${id}`);
        const result = await res.json();
        if (!res.ok) throw new Error(result.error);
        setSession(result.data);
        setTtl(result.ttl || 0);
      } catch (err: any) {
        setError(err.message || 'Gagal.');
      } finally {
        setLoading(false);
      }
    };
    if (id) fetchSession();
  }, [id]);

  useEffect(() => {
    if (ttl <= 0) return;
    const timer = setInterval(() => setTtl(p => p > 1 ? p - 1 : 0), 1000);
    return () => clearInterval(timer);
  }, [ttl]);

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const copyText = async () => {
    if (!session?.textContent) return;
    await navigator.clipboard.writeText(session.textContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadFile = useCallback(async (file: SessionFile, index: number) => {
    setDownloadingIndex(index);
    try {
      const response = await fetch(file.firebaseUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = file.fileName;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch { window.open(file.firebaseUrl, '_blank'); }
    finally { setDownloadingIndex(null); }
  }, []);

  const downloadAllFiles = async () => {
    if (!session?.files) return;
    setDownloadingAll(true);
    for (let i = 0; i < session.files.length; i++) {
      await downloadFile(session.files[i], i);
      await new Promise(r => setTimeout(r, 600)); // Delay slightly longer for batch on mobile
    }
    setDownloadingAll(false);
  };

  if (loading) return (
    <div className="min-h-screen bg-black flex items-center justify-center p-6">
      <div className="w-10 h-10 border border-white/20 border-t-white animate-spin" />
    </div>
  );

  if (error || !session) return (
    <div className="min-h-screen bg-black text-white p-6 flex items-center justify-center">
      <div className="max-w-md w-full border border-white p-10 sm:p-12 text-center animate-fade-in relative">
        <div className="absolute -top-3 left-8 px-4 bg-black text-[10px] font-black uppercase tracking-widest ring-1 ring-white">Error</div>
        <h2 className="text-3xl font-black uppercase tracking-tighter mb-4 leading-none">Not Found</h2>
        <p className="text-xs opacity-50 mb-12 uppercase font-medium">Link kadaluarsa atau URL salah.</p>
        <a href="/" className="inline-block w-full py-4 border border-white text-white font-black uppercase tracking-widest hover:bg-white/5 transition-all text-sm">Kembali</a>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-black text-white selection:bg-white selection:text-black antialiased">
      <header className="px-6 py-6 border-b border-white/5 sticky top-0 bg-black/80 backdrop-blur z-50">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo size={28} />
            <span className="text-lg font-black tracking-tighter uppercase italic">RafQR</span>
          </div>
          {ttl > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 ring-1 ring-white/10 glass text-[9px] sm:text-[10px] font-black uppercase tracking-widest tabular-nums">
              Expires in {formatTime(ttl)}
            </div>
          )}
        </div>
      </header>

      <main className="px-6 py-10 sm:py-16">
        <div className="max-w-4xl mx-auto space-y-16 sm:space-y-24 animate-fade-in-up">
          
          <div className="mt-8">
            <h2 className="text-4xl sm:text-7xl font-black tracking-tighter uppercase leading-[0.9] mb-4">
              Received <br />
              <span className="opacity-20">Content</span>
            </h2>
            <p className="max-w-xs text-[10px] opacity-40 uppercase font-black tracking-widest leading-relaxed">
              {session.fileCount || 0} Files shared · {formatSize(session.totalSize)} total
            </p>
          </div>

          {session.textContent && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TextIcon />
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-40">Shared Text</span>
                </div>
                <button onClick={copyText} className="text-[10px] font-black uppercase tracking-widest border border-white/20 px-4 py-2 hover:bg-white hover:text-black transition-all">
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div className="border border-white/10 p-6 sm:p-12 bg-white/5">
                <pre className="text-base sm:text-xl font-medium whitespace-pre-wrap leading-relaxed selection:bg-white selection:text-black font-sans">{session.textContent}</pre>
              </div>
            </div>
          )}

          {session.files && session.files.length > 0 && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DownloadIcon />
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-40">Shared Files</span>
                </div>
                {session.files.length > 1 && (
                  <button 
                    onClick={downloadAllFiles} 
                    disabled={downloadingAll}
                    className="text-[10px] font-black uppercase tracking-widest bg-white text-black px-4 py-2 hover:bg-white/90 disabled:opacity-50 transition-all"
                  >
                    {downloadingAll ? 'Batch Downloading...' : 'Download All'}
                  </button>
                )}
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {session.files.map((file, i) => {
                  const isDownloading = downloadingIndex === i;
                  const isImage = file.fileType.startsWith('image/');
                  return (
                    <div key={i} className="group border border-white/5 bg-white/5 relative overflow-hidden flex flex-col transition-all hover:border-white/10">
                      {/* Preview */}
                      <div className="aspect-[16/10] sm:aspect-[4/3] bg-black/40 overflow-hidden relative">
                        {isImage ? (
                          <img src={file.firebaseUrl} className="w-full h-full object-cover grayscale opacity-50 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-700 sm:group-hover:scale-105" />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center opacity-10">
                            <span className="text-3xl font-black">{getFileExt(file.fileName)}</span>
                          </div>
                        )}
                        <div className="absolute top-3 left-3 bg-black/60 px-2 py-1 backdrop-blur ring-1 ring-white/10">
                          <span className="text-[8px] font-black uppercase tracking-widest">{getFileExt(file.fileName)}</span>
                        </div>
                      </div>

                      {/* Info & Action */}
                      <div className="p-5 sm:p-6 space-y-4 flex-1 flex flex-col justify-between">
                        <div>
                          <p className="text-xs font-black uppercase tracking-tight truncate mb-1">{file.fileName}</p>
                          <p className="text-[10px] opacity-30 uppercase font-bold">{formatSize(file.fileSize)}</p>
                        </div>
                        <button 
                          onClick={() => downloadFile(file, i)}
                          disabled={isDownloading || downloadingAll}
                          className={`w-full py-4 border border-white/10 font-black uppercase text-[10px] tracking-widest transition-all ${isDownloading ? 'animate-pulse bg-white/10' : 'hover:bg-white hover:text-black hover:border-white'}`}
                        >
                          {isDownloading ? 'Processing...' : 'Download'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 border-t border-white/5 pt-16 sm:pt-24 pb-8">
            <div className="p-6 sm:p-8 border border-white/5 bg-white/[0.01]">
              <div className="text-[10px] font-black uppercase tracking-widest opacity-20 mb-3">Security</div>
              <p className="text-[10px] sm:text-[11px] uppercase font-bold leading-relaxed">End-to-end encrypted transfer. Files are deleted permanently from storage after expiry.</p>
            </div>
            <div className="p-6 sm:p-8 border border-white/5 bg-white/[0.01]">
              <div className="text-[10px] font-black uppercase tracking-widest opacity-20 mb-3">Expiry</div>
              <p className="text-[10px] sm:text-[11px] uppercase font-bold leading-relaxed text-red-500/60">Otomatis terhapus dalam 30 menit. Amankan file Anda segera.</p>
            </div>
          </div>
        </div>
      </main>

      <footer className="p-8 text-center text-[9px] opacity-10 uppercase font-black tracking-widest border-t border-white/5">
        © 2026 / RafQR / RaffiTech Solutions / v2.1
      </footer>
    </div>
  );
}
