'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';

// ─── Utilities ───────────────────────────────────────────────
const formatSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const getFileColor = (type: string): string => {
  if (type.startsWith('image/')) return 'text-pink-400 bg-pink-500/10 border-pink-500/20';
  if (type.startsWith('video/')) return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
  if (type.startsWith('audio/')) return 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20';
  if (type.includes('pdf')) return 'text-red-400 bg-red-500/10 border-red-500/20';
  if (type.includes('zip') || type.includes('compressed')) return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20';
  return 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20';
};

const getFileExt = (name: string): string => {
  const parts = name.split('.');
  return parts.length > 1 ? parts.pop()!.toUpperCase() : 'FILE';
};

// ─── Icons ───────────────────────────────────────────────────
const FileIcon = ({ type }: { type: string }) => {
  if (type.startsWith('image/')) return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a2.25 2.25 0 002.25-2.25V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" /></svg>
  );
  if (type.startsWith('video/')) return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" /></svg>
  );
  if (type.startsWith('audio/')) return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="m9 9 10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V4.5l-10.5 3v8.028" /></svg>
  );
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
  );
};

const DownloadIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
  </svg>
);

const CheckIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
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
  files: SessionFile[];
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
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [downloadingIndex, setDownloadingIndex] = useState<number | null>(null);
  const [downloadedIndices, setDownloadedIndices] = useState<Set<number>>(new Set());

  // Fetch session data
  useEffect(() => {
    const fetchSession = async () => {
      try {
        const res = await fetch(`/api/session?id=${id}`);
        const result = await res.json();

        if (!res.ok) {
          throw new Error(result.error || 'Session not found');
        }

        setSession(result.data);
        setTtl(result.ttl || 0);
        // Select all files by default
        setSelectedIndices(new Set(result.data.files.map((_: any, i: number) => i)));
      } catch (err: any) {
        setError(err.message || 'Failed to load session');
      } finally {
        setLoading(false);
      }
    };

    if (id) fetchSession();
  }, [id]);

  // Countdown timer
  useEffect(() => {
    if (ttl <= 0) return;
    const timer = setInterval(() => {
      setTtl(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [ttl > 0]);

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const toggleFile = (index: number) => {
    setSelectedIndices(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const selectAll = () => {
    if (session) {
      setSelectedIndices(new Set(session.files.map((_, i) => i)));
    }
  };

  const deselectAll = () => {
    setSelectedIndices(new Set());
  };

  const allSelected = session ? selectedIndices.size === session.files.length : false;

  // Download single file
  const downloadFile = useCallback(async (file: SessionFile, index: number) => {
    setDownloadingIndex(index);
    try {
      const response = await fetch(file.firebaseUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      setDownloadedIndices(prev => new Set(prev).add(index));
    } catch {
      // Fallback: open in new tab
      window.open(file.firebaseUrl, '_blank');
    } finally {
      setDownloadingIndex(null);
    }
  }, []);

  // Download selected files
  const downloadSelected = async () => {
    if (!session) return;
    const indices = Array.from(selectedIndices).sort((a, b) => a - b);
    for (const i of indices) {
      await downloadFile(session.files[i], i);
      // Small delay between downloads
      await new Promise(r => setTimeout(r, 500));
    }
  };

  // ─── Loading State ──────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-5 antialiased">
        <div className="text-center animate-fade-in-up">
          <div className="relative mx-auto w-16 h-16 mb-5">
            <div className="absolute inset-0 rounded-full border-2 border-indigo-500/20" />
            <div className="absolute inset-0 rounded-full border-2 border-t-indigo-500 animate-spin" />
          </div>
          <p className="text-gray-400 text-sm">Loading files...</p>
        </div>
      </div>
    );
  }

  // ─── Error / Expired State ─────────────────────────────────
  if (error || !session) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-5 antialiased">
        <div className="max-w-md w-full animate-fade-in-up">
          <div className="glass rounded-2xl p-8 text-center">
            <div className="mx-auto w-20 h-20 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-5">
              <svg className="w-10 h-10 text-red-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-white mb-2">File Not Found</h2>
            <p className="text-gray-400 text-sm mb-6 max-w-xs mx-auto leading-relaxed">
              This link has expired or is invalid. Files auto-expire after <span className="text-indigo-400 font-semibold">30 minutes</span>.
            </p>
            <a
              href="/"
              className="inline-block w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-all shadow-lg shadow-indigo-600/20"
            >
              Go to RafQR
            </a>
          </div>

          <div className="mt-5 glass rounded-xl p-4">
            <h4 className="text-sm font-semibold text-gray-300 mb-3">Why did this happen?</h4>
            <div className="space-y-2.5">
              <div className="flex items-start gap-2.5">
                <svg className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs text-gray-500 leading-relaxed">Files are auto-deleted after 30 minutes for security.</p>
              </div>
              <div className="flex items-start gap-2.5">
                <svg className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-9.86a4.5 4.5 0 00-6.364 0l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                </svg>
                <p className="text-xs text-gray-500 leading-relaxed">Ask the sender to re-upload and share a new QR code.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Download Page ─────────────────────────────────────────
  return (
    <div className="min-h-screen antialiased">
      {/* Header */}
      <header className="px-5 py-4">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 19.5h.75v.75h-.75v-.75zM19.5 13.5h.75v.75h-.75v-.75zM19.5 19.5h.75v.75h-.75v-.75z" />
              </svg>
            </div>
            <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">RafQR</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full glass text-xs text-gray-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Secure
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="px-5 pb-10">
        <div className="max-w-lg mx-auto stagger">

          {/* Status + Timer */}
          <div className="flex items-center justify-between mb-5">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass text-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-emerald-400 font-medium">
                {session.fileCount} File{session.fileCount !== 1 && 's'} Ready
              </span>
            </div>
            {ttl > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-indigo-400 font-semibold">{formatTime(ttl)}</span>
              </div>
            )}
          </div>

          {/* Session Summary */}
          <div className="glass rounded-2xl p-5 mb-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-bold text-white">Shared Files</h2>
                <p className="text-xs text-gray-500 mt-0.5">{session.fileCount} file{session.fileCount !== 1 && 's'} · {formatSize(session.totalSize)}</p>
              </div>
              <button
                onClick={allSelected ? deselectAll : selectAll}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors font-medium"
              >
                {allSelected ? 'Deselect All' : 'Select All'}
              </button>
            </div>

            {/* File List */}
            <div className="space-y-2.5">
              {session.files.map((file, i) => {
                const isSelected = selectedIndices.has(i);
                const isDownloading = downloadingIndex === i;
                const isDownloaded = downloadedIndices.has(i);

                return (
                  <div
                    key={i}
                    className={`rounded-xl p-3.5 flex items-center gap-3 transition-all duration-200 cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-500/[0.08] border border-indigo-500/20'
                        : 'bg-white/[0.02] border border-transparent hover:bg-white/[0.04]'
                    }`}
                    onClick={() => toggleFile(i)}
                  >
                    {/* Checkbox */}
                    <div className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 transition-all ${
                      isSelected
                        ? 'bg-indigo-500 border-indigo-500'
                        : 'border border-gray-600 bg-transparent'
                    }`}>
                      {isSelected && <CheckIcon />}
                    </div>

                    {/* File Icon */}
                    <div className={`w-9 h-9 rounded-lg ${getFileColor(file.fileType)} border flex items-center justify-center flex-shrink-0`}>
                      <FileIcon type={file.fileType} />
                    </div>

                    {/* File Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white font-medium truncate">{file.fileName}</p>
                      <p className="text-xs text-gray-500">{formatSize(file.fileSize)} · {getFileExt(file.fileName)}</p>
                    </div>

                    {/* Individual Download */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        downloadFile(file, i);
                      }}
                      disabled={isDownloading}
                      className={`p-2 rounded-lg transition-all flex-shrink-0 ${
                        isDownloaded
                          ? 'text-emerald-400 bg-emerald-500/10'
                          : isDownloading
                          ? 'text-indigo-400 bg-indigo-500/10 animate-pulse'
                          : 'text-gray-500 hover:text-indigo-400 hover:bg-indigo-500/10'
                      }`}
                    >
                      {isDownloaded ? <CheckIcon /> : isDownloading ? (
                        <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                      ) : <DownloadIcon />}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Download Selected Button */}
          {selectedIndices.size > 0 && (
            <button
              onClick={downloadSelected}
              disabled={downloadingIndex !== null}
              className="dl-glow w-full py-4 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-sm transition-all duration-300 shadow-xl shadow-indigo-600/25 hover:shadow-indigo-500/35 hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2.5 relative z-10 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <DownloadIcon />
              Download {selectedIndices.size === session.files.length
                ? `All ${session.files.length} Files`
                : `${selectedIndices.size} Selected File${selectedIndices.size !== 1 ? 's' : ''}`
              }
            </button>
          )}

          {/* Info cards */}
          <div className="grid grid-cols-2 gap-3 mt-5">
            <div className="glass rounded-xl p-3.5">
              <div className="flex items-center gap-2 mb-1.5">
                <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
                <span className="text-xs text-gray-300 font-medium">Secure</span>
              </div>
              <p className="text-[11px] text-gray-500 leading-relaxed">End-to-end encrypted transfer</p>
            </div>
            <div className="glass rounded-xl p-3.5">
              <div className="flex items-center gap-2 mb-1.5">
                <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-xs text-gray-300 font-medium">Temporary</span>
              </div>
              <p className="text-[11px] text-gray-500 leading-relaxed">Auto-deleted after 30 min</p>
            </div>
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-5 px-5">
        <div className="max-w-lg mx-auto text-center">
          <p className="text-gray-600 text-xs">© 2026 RafQR · Instant File Transfer</p>
        </div>
      </footer>
    </div>
  );
}
