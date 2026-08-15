'use client';

import { useState } from 'react';
import { uploadFileToR2 } from '../../lib/r2-client';

export default function DebugUpload() {
  const [status, setStatus] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);

  const addLog = (message: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  const handleTestUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus('Starting upload...');
    setLogs([]);
    setProgress(0);

    addLog(`File selected: ${file.name} (${file.size} bytes, ${file.type})`);
    addLog(`Online: ${navigator.onLine}`);

    try {
      addLog('Requesting presigned URL + uploading to R2...');
      const result = await uploadFileToR2(file, (p) => {
        setProgress(p);
      });
      setStatus('✅ Upload successful!');
      addLog(`Upload complete. Object key: ${result.storagePath}`);
    } catch (error: any) {
      setStatus('❌ Upload failed!');
      addLog(`ERROR: ${error.message}`);
      addLog('Cek: 1) R2_* env terisi  2) CORS bucket mengizinkan PUT dari origin ini');
    }
  };

  return (
    <div className="min-h-screen bg-paper text-ink p-5 sm:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-2xl font-extrabold tracking-tight">R2 Upload Debug Tool</h1>

        <div className="space-y-2">
          <label className="block text-sm font-bold">Test File Upload</label>
          <input
            type="file"
            onChange={handleTestUpload}
            className="block w-full text-sm text-muted neo-mono
              file:mr-4 file:py-2 file:px-4 file:cursor-pointer
              file:border-2 file:border-ink file:rounded-md
              file:text-sm file:font-bold
              file:bg-ink file:text-white
              hover:file:bg-accent hover:file:text-ink"
          />
        </div>

        {status && (
          <div className={`neo-card p-4 ${
            status.includes('✅') ? 'bg-ok/10' :
            status.includes('❌') ? 'bg-danger/10' :
            'bg-white'
          }`}>
            <p className="font-bold">{status}</p>
            {progress > 0 && (
              <div className="mt-3">
                <div className="w-full bg-ink/10 rounded-full h-2.5 overflow-hidden">
                  <div className="bg-accent h-full rounded-full transition-all" style={{ width: `${progress}%` }} />
                </div>
                <p className="text-sm font-bold neo-mono mt-1">{progress}%</p>
              </div>
            )}
          </div>
        )}

        {logs.length > 0 && (
          <div className="neo-card bg-ink text-white/90 p-4 neo-mono text-xs overflow-auto max-h-96">
            <h3 className="font-bold text-white mb-2">Debug Logs</h3>
            {logs.map((log, i) => (
              <div key={i} className="mb-1">{log}</div>
            ))}
          </div>
        )}

        <div className="neo-card p-5">
          <h3 className="font-bold mb-3">Quick Checklist</h3>
          <ul className="space-y-2 text-sm font-medium text-muted">
            <li>☐ R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_ENDPOINT / R2_BUCKET terisi</li>
            <li>☐ Bucket `rafqr` sudah dibuat di Cloudflare R2</li>
            <li>☐ CORS bucket mengizinkan PUT + GET dari origin app</li>
            <li>☐ (Opsional) Lifecycle rule auto-delete aktif</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
