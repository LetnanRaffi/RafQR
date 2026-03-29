'use client';

import { useState, useEffect } from 'react';
import { Logo } from '../../components/Logo';

interface AnalyticsData {
  totalTransfers: number;
  totalGb: string;
  largestFile: {
    file_name: string;
    file_size: number;
  };
  chartData: Array<{ date: string; count: number }>;
  totalVisitors: number;
}

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export default function AdminDashboard() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [pin, setPin] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  // Set PIN securely in your .env or here
  const ADMIN_PIN = process.env.NEXT_PUBLIC_ADMIN_PIN || 'admin123';

  useEffect(() => {
    if (!isAuthenticated) return;
    fetch('/api/analytics')
      .then(res => res.json())
      .then(d => {
        setData(d);
        setLoading(false);
      });
  }, [isAuthenticated]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === ADMIN_PIN) setIsAuthenticated(true);
    else alert('Invalid PIN');
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6">
        <form onSubmit={handleLogin} className="max-w-xs w-full space-y-6">
          <div className="flex justify-center mb-8"><Logo size={48} /></div>
          <h1 className="text-xl font-black uppercase text-center tracking-widest italic opacity-40 mb-10">Secret Dashboard</h1>
          <input 
            type="password" 
            value={pin} 
            onChange={(e) => setPin(e.target.value)}
            placeholder="Enter Admin PIN" 
            className="w-full bg-white/5 border border-white/10 p-4 font-black text-center focus:outline-none focus:border-white transition-all"
            autoFocus
          />
          <button type="submit" className="w-full bg-white text-black font-black uppercase py-4 tracking-widest hover:bg-white/90">Verify Identity</button>
          {!process.env.NEXT_PUBLIC_ADMIN_PIN && <p className="text-[10px] text-center opacity-20 uppercase font-black tracking-widest mt-4 italic">Note: Use default PIN 'admin123' if not set in .env</p>}
        </form>
      </div>
    );
  }

  if (loading) return <div className="min-h-screen bg-black text-white p-10 font-black flex items-center justify-center animate-pulse">BOOTING ACCESS...</div>;

  const maxCount = Math.max(...(data?.chartData.map(d => d.count) || [1])) || 1;

  return (
    <div className="min-h-screen bg-black text-white font-sans p-6 sm:p-12 lg:p-20">
      <header className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 mb-20">
        <div className="flex items-center gap-6">
          <Logo size={40} />
          <div>
            <h1 className="text-3xl font-black uppercase tracking-tighter italic leading-none">Admin <br /><span className="opacity-20">Analytics</span></h1>
          </div>
        </div>
        <div className="text-[9px] font-black uppercase tracking-[0.3em] opacity-30 border border-white/10 px-4 py-2">System Live Status: OK</div>
      </header>

      <main className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 mb-20 animate-fade-in">
          <div className="p-10 border border-white/5 bg-white/[0.02]">
            <p className="text-[10px] font-black uppercase tracking-widest opacity-30 mb-2">Total Transferred</p>
            <p className="text-4xl font-black italic">{data?.totalGb} <span className="text-sm opacity-20 unitalic">GB</span></p>
          </div>
          <div className="p-10 border border-white/5 bg-white/[0.02]">
            <p className="text-[10px] font-black uppercase tracking-widest opacity-30 mb-2">Success Scans</p>
            <p className="text-4xl font-black italic">{data?.totalTransfers}</p>
          </div>
          <div className="p-10 border border-white/5 bg-white/[0.02]">
            <p className="text-[10px] font-black uppercase tracking-widest opacity-30 mb-2">Total Visitors</p>
            <p className="text-4xl font-black italic">{data?.totalVisitors}</p>
          </div>
          <div className="p-10 border border-white/5 bg-white/[0.02] flex flex-col justify-center">
            <p className="text-[10px] font-black uppercase tracking-widest opacity-30 mb-2">Largest Asset</p>
            <p className="text-xs font-black uppercase tracking-tighter truncate w-full mb-1">{data?.largestFile.file_name}</p>
            <p className="text-lg font-black italic opacity-40">{formatBytes(data?.largestFile.file_size || 0)}</p>
          </div>
        </div>

        <section className="animate-fade-in-up">
           <h3 className="text-[10px] font-black uppercase tracking-[0.4em] opacity-30 mb-12 border-b border-white/5 pb-4">Activity Journal (Weekly)</h3>
           <div className="flex items-end gap-1 sm:gap-4 h-64 sm:h-96">
             {data?.chartData.map((d, i) => (
               <div key={i} className="flex-1 flex flex-col items-center group">
                 <div className="text-[10px] font-black opacity-0 group-hover:opacity-40 transition-opacity mb-2">{d.count}</div>
                 <div 
                   className="w-full bg-white/10 group-hover:bg-white transition-all duration-500 ease-out" 
                   style={{ height: `${(d.count / maxCount) * 100}%`, minHeight: '2px' }} 
                 />
                 <div className="text-[8px] sm:text-[10px] font-black uppercase tracking-widest mt-4 opacity-20 -rotate-45 sm:rotate-0 origin-left">
                    {d.date.split('-').slice(1).join('/')}
                 </div>
               </div>
             ))}
           </div>
        </section>
        
        <div className="mt-32 p-8 border border-white/5 flex flex-col sm:flex-row items-center justify-between gap-6">
           <p className="text-[10px] font-black uppercase tracking-widest opacity-20 leading-relaxed max-w-sm text-center sm:text-left italic">Pemberitahuan: Data ini diambil langsung dari tabel analitik Supabase secara real-time untuk kebutuhan evaluasi project.</p>
           <button onClick={() => window.location.reload()} className="px-10 py-4 ring-1 ring-white/10 text-xs font-black uppercase tracking-widest hover:bg-white hover:text-black transition-all">Manual Sync</button>
        </div>
      </main>

      <footer className="mt-20 max-w-7xl mx-auto py-10 border-t border-white/5 flex justify-between items-center opacity-10">
        <p className="text-[9px] font-black uppercase tracking-widest leading-none">Internal Use Only / RaffiTech Solutions Dashboard / v1.0 Alpha</p>
        <Logo size={16} />
      </footer>
    </div>
  );
}
