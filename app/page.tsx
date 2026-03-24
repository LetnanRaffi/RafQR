'use client';

import { useState, useCallback, useRef } from 'react';
import { uploadFileToSupabase } from '../lib/supabase-storage';
import { QRCodeSVG } from 'qrcode.react';

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
  if (type.includes('zip') || type.includes('compressed') || type.includes('archive')) return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20';
  return 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20';
};

const getFileExt = (name: string): string => {
  const parts = name.split('.');
  return parts.length > 1 ? parts.pop()!.toUpperCase() : 'FILE';
};

// ─── Icons ───────────────────────────────────────────────────
const UploadCloudIcon = () => (
  <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
  </svg>
);

const PlusIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
  </svg>
);

const XIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const FileIcon = ({ type }: { type: string }) => {
  if (type.startsWith('image/')) return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a2.25 2.25 0 002.25-2.25V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" /></svg>
  );
  if (type.startsWith('video/')) return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" /></svg>
  );
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
  );
};

const CopyIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" /></svg>
);

const CheckIcon = () => (
  <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
);

// ─── Types ───────────────────────────────────────────────────
interface UploadedFile {
  fileName: string;
  fileSize: number;
  fileType: string;
  firebaseUrl: string;
  storageRef: string;
}

// ─── Component ───────────────────────────────────────────────
export default function UploadPage() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [fileProgress, setFileProgress] = useState(0);
  const [overallProgress, setOverallProgress] = useState(0);
  const [uploadComplete, setUploadComplete] = useState(false);
  const [uniqueId, setUniqueId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Drag handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      setSelectedFiles(prev => [...prev, ...files]);
      setError(null);
    }
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setSelectedFiles(prev => [...prev, ...files]);
      setError(null);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const clearAll = () => {
    setSelectedFiles([]);
    setError(null);
  };

  const totalSize = selectedFiles.reduce((sum, f) => sum + f.size, 0);

  // Upload all files
  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;

    setIsUploading(true);
    setError(null);
    setCurrentFileIndex(0);
    setFileProgress(0);
    setOverallProgress(0);

    const uploadedFiles: UploadedFile[] = [];

    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        setCurrentFileIndex(i);
        setFileProgress(0);

        const { downloadURL, storagePath } = await uploadFileToSupabase(
          file,
          (progress) => {
            setFileProgress(Math.round(progress));
            const overall = ((i + progress / 100) / selectedFiles.length) * 100;
            setOverallProgress(Math.round(overall));
          }
        );

        uploadedFiles.push({
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type || 'application/octet-stream',
          firebaseUrl: downloadURL,
          storageRef: storagePath,
        });
      }

      setOverallProgress(100);

      // Create session with all files
      const response = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: uploadedFiles }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create session');
      }

      setUniqueId(result.uniqueId);
      setUploadComplete(true);
    } catch (err: any) {
      console.error('Upload error:', err);
      setError(err.message || 'Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleReset = () => {
    setSelectedFiles([]);
    setUploadComplete(false);
    setUniqueId(null);
    setError(null);
    setOverallProgress(0);
    setFileProgress(0);
    setCurrentFileIndex(0);
    setCopied(false);
  };

  const getShareURL = () => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/d/${uniqueId}`;
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(getShareURL());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  // ─── Render ─────────────────────────────────────────────────
  return (
    <div className="min-h-screen antialiased">
      {/* Header */}
      <header className="px-6 py-5">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <div className="absolute -inset-1 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-600/20 animate-pulse-ring" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">TempShare</h1>
              <p className="text-[11px] text-gray-500 font-medium tracking-widest uppercase">Instant · Secure · Temporary</p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full glass text-xs text-gray-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Ready
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="px-6 pb-16">
        <div className="max-w-5xl mx-auto">

          {/* Hero */}
          <div className="text-center mb-10 animate-fade-in-up">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-3">
              <span className="bg-gradient-to-r from-white via-gray-200 to-gray-400 bg-clip-text text-transparent">Share Files</span>
              <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent"> Instantly</span>
            </h2>
            <p className="text-gray-500 text-sm sm:text-base max-w-md mx-auto leading-relaxed">
              Drop your files, scan the QR code, download on any device.
              <br className="hidden sm:block" />
              Auto-expires in <span className="text-indigo-400 font-semibold">30 minutes</span>.
            </p>
          </div>

          {!uploadComplete ? (
            /* ── UPLOAD STATE ── */
            <div className="grid lg:grid-cols-5 gap-6">
              {/* Left side */}
              <div className="lg:col-span-3 space-y-5">

                {/* Dropzone */}
                <div
                  className={`dropzone rounded-2xl p-8 sm:p-12 text-center cursor-pointer group relative overflow-hidden ${isDragging ? 'drag-over' : ''}`}
                  onDragEnter={handleDragEnter}
                  onDragLeave={handleDragLeave}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl" />
                  </div>

                  <div className="relative z-10">
                    <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-300">
                      <UploadCloudIcon />
                    </div>
                    <p className="text-white font-semibold text-base mb-1">
                      {isDragging ? 'Drop files here!' : 'Drag & drop files here'}
                    </p>
                    <p className="text-gray-500 text-sm mb-5">or click to browse your files</p>
                    <button
                      onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-all duration-200 shadow-lg shadow-indigo-600/20 hover:shadow-indigo-500/30 hover:scale-[1.02] active:scale-[0.98]"
                    >
                      <PlusIcon />
                      Select Files
                    </button>
                    <p className="text-gray-600 text-xs mt-4">Max 100 MB per file · Auto-expires in 30 min</p>
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={handleFileInput}
                  />
                </div>

                {/* File List */}
                {selectedFiles.length > 0 && (
                  <div className="animate-fade-in-up">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-gray-300">
                        {selectedFiles.length} file{selectedFiles.length !== 1 && 's'} · {formatSize(totalSize)}
                      </h3>
                      <button onClick={clearAll} className="text-xs text-gray-500 hover:text-red-400 transition-colors">
                        Clear all
                      </button>
                    </div>
                    <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                      {selectedFiles.map((file, i) => (
                        <div key={`${file.name}-${i}`} className="glass rounded-xl px-4 py-3 flex items-center gap-3 group animate-fade-in-up">
                          <div className={`w-9 h-9 rounded-lg ${getFileColor(file.type)} border flex items-center justify-center flex-shrink-0`}>
                            <FileIcon type={file.type} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white font-medium truncate">{file.name}</p>
                            <p className="text-xs text-gray-500">{formatSize(file.size)} · {getFileExt(file.name)}</p>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                            className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-all p-1"
                          >
                            <XIcon />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Upload Button */}
                {selectedFiles.length > 0 && !isUploading && (
                  <button
                    onClick={handleUpload}
                    className="w-full py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold text-sm transition-all duration-300 shadow-xl shadow-indigo-600/20 hover:shadow-indigo-500/30 hover:scale-[1.005] active:scale-[0.995] flex items-center justify-center gap-2"
                  >
                    <UploadCloudIcon />
                    Upload {selectedFiles.length} File{selectedFiles.length !== 1 && 's'} & Generate QR
                  </button>
                )}

                {/* Progress */}
                {isUploading && (
                  <div className="glass rounded-2xl p-5 animate-fade-in-up">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-medium text-gray-300">
                        Uploading file {currentFileIndex + 1} of {selectedFiles.length}...
                      </p>
                      <span className="text-sm font-bold text-indigo-400">{overallProgress}%</span>
                    </div>
                    <div className="w-full h-2.5 rounded-full bg-white/5 overflow-hidden">
                      <div
                        className="progress-shimmer h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300 ease-out"
                        style={{ width: `${overallProgress}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-2 truncate">
                      {selectedFiles[currentFileIndex]?.name}
                    </p>
                  </div>
                )}

                {/* Error */}
                {error && (
                  <div className="glass rounded-xl p-4 border-red-500/20 bg-red-500/5 animate-fade-in-up">
                    <p className="text-red-400 text-sm flex items-center gap-2">
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                      </svg>
                      {error}
                    </p>
                  </div>
                )}
              </div>

              {/* Right side: QR placeholder */}
              <div className="lg:col-span-2">
                <div className="glass rounded-2xl p-6 text-center sticky top-6">
                  <div className="py-8">
                    <div className="mx-auto w-44 h-44 rounded-2xl border-2 border-dashed border-white/10 flex items-center justify-center mb-5">
                      <div className="text-center">
                        <svg className="w-10 h-10 text-gray-700 mx-auto mb-2" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM16.5 6.75h.75v.75H16.5v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 19.5h.75v.75h-.75v-.75zM19.5 13.5h.75v.75h-.75v-.75zM19.5 19.5h.75v.75h-.75v-.75zM16.5 16.5h.75v.75h-.75v-.75z" />
                        </svg>
                        <p className="text-xs text-gray-600">QR code will<br />appear here</p>
                      </div>
                    </div>
                    <p className="text-gray-500 text-sm">Upload files to generate<br />your sharing QR code</p>
                  </div>
                </div>
              </div>
            </div>

          ) : (

            /* ── COMPLETE STATE ── */
            <div className="grid lg:grid-cols-5 gap-6 animate-scale-in">
              {/* Left: file summary */}
              <div className="lg:col-span-3 space-y-5">
                <div className="glass rounded-2xl p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                      <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-white font-semibold">Upload Complete!</h3>
                      <p className="text-xs text-gray-500">{selectedFiles.length} file{selectedFiles.length !== 1 && 's'} · {formatSize(totalSize)}</p>
                    </div>
                  </div>

                  <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                    {selectedFiles.map((file, i) => (
                      <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.03]">
                        <div className={`w-8 h-8 rounded-lg ${getFileColor(file.type)} border flex items-center justify-center flex-shrink-0`}>
                          <FileIcon type={file.type} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white truncate">{file.name}</p>
                          <p className="text-xs text-gray-500">{formatSize(file.size)}</p>
                        </div>
                        <CheckIcon />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Expiry notice */}
                <div className="glass rounded-xl p-4 flex items-center gap-3 border-amber-500/10">
                  <svg className="w-5 h-5 text-amber-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm text-gray-400">
                    Files auto-expire in <span className="text-amber-400 font-semibold">30 minutes</span>
                  </p>
                </div>

                {/* New transfer */}
                <button
                  onClick={handleReset}
                  className="w-full py-3 rounded-xl glass text-sm text-gray-300 font-medium hover:text-white hover:bg-white/[0.06] transition-all flex items-center justify-center gap-2"
                >
                  <PlusIcon />
                  New Transfer
                </button>
              </div>

              {/* Right: QR code */}
              <div className="lg:col-span-2">
                <div className="glass rounded-2xl p-6 text-center sticky top-6 animate-scale-in">
                  <div className="inline-block p-4 bg-white rounded-2xl shadow-2xl shadow-indigo-500/10 mb-5">
                    <QRCodeSVG
                      value={getShareURL()}
                      size={176}
                      level="H"
                      bgColor="#FFFFFF"
                      fgColor="#0a0a1a"
                    />
                  </div>

                  <p className="text-white font-semibold text-sm mb-1">Scan to Download</p>
                  <p className="text-gray-500 text-xs mb-4">Point your phone camera at the QR code</p>

                  {/* Share link */}
                  <div className="flex items-center gap-2 bg-white/[0.03] rounded-xl px-3 py-2.5 mb-4">
                    <svg className="w-4 h-4 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-9.86a4.5 4.5 0 00-6.364 0l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                    </svg>
                    <span className="text-xs text-gray-400 truncate flex-1">{getShareURL()}</span>
                    <button onClick={copyLink} className="text-indigo-400 hover:text-indigo-300 transition-colors flex-shrink-0">
                      {copied ? <CheckIcon /> : <CopyIcon />}
                    </button>
                  </div>

                  <p className="text-xs text-gray-600">
                    {copied ? <span className="text-emerald-400">Link copied!</span> : 'Click to copy share link'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Feature cards */}
          <div className="grid sm:grid-cols-3 gap-4 mt-12">
            {[
              { icon: <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>, color: 'bg-emerald-500/10', title: 'Secure Transfer', desc: 'Files auto-deleted after 30 minutes. Zero traces.' },
              { icon: <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg>, color: 'bg-indigo-500/10', title: 'Lightning Fast', desc: 'Direct upload to cloud. Instant QR code generation.' },
              { icon: <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" /></svg>, color: 'bg-purple-500/10', title: 'Any Device', desc: 'Scan QR from any phone. Works on all browsers.' },
            ].map((card, i) => (
              <div key={i} className="glass rounded-xl p-5 group hover:border-indigo-500/20 transition-all duration-300">
                <div className={`w-9 h-9 rounded-lg ${card.color} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}>
                  {card.icon}
                </div>
                <h4 className="text-white font-semibold text-sm mb-1">{card.title}</h4>
                <p className="text-gray-500 text-xs leading-relaxed">{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-6 px-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-gray-600 text-xs">© 2026 TempShare · Files auto-expire after 30 minutes</p>
          <p className="text-gray-700 text-xs">Personal Tool by Pasha</p>
        </div>
      </footer>
    </div>
  );
}
