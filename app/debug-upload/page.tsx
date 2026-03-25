'use client';

import { useState } from 'react';
import { uploadFileToSupabase } from '../../lib/supabase-storage';

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
    addLog(`User Agent: ${navigator.userAgent}`);
    addLog(`Online: ${navigator.onLine}`);

    try {
      addLog('Starting upload to Supabase...');
      
      const result = await uploadFileToSupabase(file, (progress) => {
        setProgress(progress);
        addLog(`Upload progress: ${progress}%`);
      });

      setStatus('✅ Upload successful!');
      addLog(`Upload complete! URL: ${result.downloadURL}`);
      addLog(`Storage path: ${result.storagePath}`);
    } catch (error: any) {
      setStatus('❌ Upload failed!');
      addLog(`ERROR: ${error.message}`);
      addLog(`Error stack: ${error.stack || 'N/A'}`);
      
      // Additional debug info
      addLog('--- Debug Info ---');
      addLog(`Window location: ${window.location.href}`);
      addLog(`Protocol: ${window.location.protocol}`);
      addLog(`Online status: ${navigator.onLine}`);
    }
  };

  const testSupabaseConnection = async () => {
    setStatus('Testing connection...');
    setLogs([]);

    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/^["']|["']$/g, '').trim();
      addLog(`Testing connection to: ${url}`);
      
      const response = await fetch(`${url}/rest/v1/`, {
        method: 'GET',
        headers: {
          'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.replace(/^["']|["']$/g, '').trim() || '',
        },
      });

      addLog(`Response status: ${response.status}`);
      addLog(`Response OK: ${response.ok}`);
      
      if (response.ok) {
        setStatus('✅ Supabase connection successful!');
        addLog('Supabase is accessible from this device');
      } else {
        setStatus('⚠️ Supabase responded but with errors');
        addLog(`Response: ${await response.text()}`);
      }
    } catch (error: any) {
      setStatus('❌ Cannot connect to Supabase!');
      addLog(`Connection error: ${error.message}`);
      addLog(`This means your phone cannot reach Supabase servers`);
      addLog(`Check: 1) Internet connection 2) Supabase URL 3) Firewall/CORS`);
    }
  };

  const checkBucketExists = async () => {
    setStatus('Checking bucket...');
    setLogs([]);

    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/^["']|["']$/g, '').trim() || '';
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.replace(/^["']|["']$/g, '').trim() || '';
      
      addLog(`Checking bucket "tempshare" at ${url}`);
      
      const response = await fetch(`${url}/storage/v1/buckets/tempshare`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${key}`,
          'apikey': key,
        },
      });

      addLog(`Bucket response status: ${response.status}`);
      
      if (response.status === 200) {
        const data = await response.json();
        setStatus('✅ Bucket exists!');
        addLog(`Bucket name: ${data.name}`);
        addLog(`Bucket public: ${data.public}`);
      } else if (response.status === 404) {
        setStatus('❌ Bucket "tempshare" not found!');
        addLog('You need to create the bucket in Supabase Dashboard');
        addLog('Go to: Storage → New Bucket → Name: tempshare → Public: ON');
      } else {
        setStatus(`⚠️ Unexpected response: ${response.status}`);
        const text = await response.text();
        addLog(`Response: ${text}`);
      }
    } catch (error: any) {
      setStatus('❌ Error checking bucket!');
      addLog(`Error: ${error.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">🔧 Upload Debug Tool</h1>
        
        <div className="space-y-4 mb-6">
          <button
            onClick={testSupabaseConnection}
            className="px-4 py-2 bg-blue-600 rounded-lg hover:bg-blue-500"
          >
            Test Supabase Connection
          </button>
          
          <button
            onClick={checkBucketExists}
            className="px-4 py-2 bg-purple-600 rounded-lg hover:bg-purple-500"
          >
            Check Bucket Exists
          </button>
        </div>

        <div className="mb-6">
          <label className="block mb-2">
            Test File Upload:
          </label>
          <input
            type="file"
            onChange={handleTestUpload}
            className="block w-full text-sm text-gray-400
              file:mr-4 file:py-2 file:px-4
              file:rounded-lg file:border-0
              file:text-sm file:font-semibold
              file:bg-indigo-600 file:text-white
              hover:file:bg-indigo-500"
          />
        </div>

        {status && (
          <div className={`p-4 rounded-lg mb-4 ${
            status.includes('✅') ? 'bg-green-900/50 border border-green-700' :
            status.includes('❌') ? 'bg-red-900/50 border border-red-700' :
            'bg-gray-800 border border-gray-700'
          }`}>
            <p className="font-semibold">{status}</p>
            {progress > 0 && (
              <div className="mt-2">
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div 
                    className="bg-indigo-600 h-2 rounded-full transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-sm mt-1">{progress}%</p>
              </div>
            )}
          </div>
        )}

        {logs.length > 0 && (
          <div className="bg-black/50 rounded-lg p-4 font-mono text-xs overflow-auto max-h-96">
            <h3 className="font-bold mb-2">Debug Logs:</h3>
            {logs.map((log, i) => (
              <div key={i} className="mb-1 text-gray-300">
                {log}
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 p-4 bg-gray-800 rounded-lg">
          <h3 className="font-bold mb-2">📋 Quick Checklist:</h3>
          <ul className="space-y-2 text-sm">
            <li>☐ Supabase URL is correct (https://xxxxx.supabase.co)</li>
            <li>☐ Bucket "tempshare" exists in Supabase Dashboard</li>
            <li>☐ Bucket is set to PUBLIC</li>
            <li>☐ Storage policies allow public INSERT</li>
            <li>☐ Phone has internet connection</li>
            <li>☐ Can access supabase.co from phone browser</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
