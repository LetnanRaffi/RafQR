'use client';

import { useState } from 'react';
import { Logo } from '../../components/Logo';
import { AppShell, TopBar, Btn } from '../../components/ui';

interface AnalyticsData {
  totalTransfers: number;
  totalGb: string;
  largestFile: { file_name: string; file_size: number } | null;
  chartData: Array<{ date: string; count: number }>;
  totalVisitors: number;
}

const formatBytes = (bytes: number) => {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const DAY = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

export default function AdminDashboard() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [key, setKey] = useState('');
  const [authed, setAuthed] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = async (adminKey: string) => {
    const res = await fetch('/api/analytics', { headers: { 'x-admin-key': adminKey } });
    if (!res.ok) throw new Error('Key salah.');
    return res.json();
  };

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    try {
      setData(await load(key));
      setAuthed(true);
    } catch (err) {
      setLoginError((err as Error).message || 'Gagal terhubung.');
    }
  };

  const sync = async () => {
    setSyncing(true);
    try { setData(await load(key)); } finally { setSyncing(false); }
  };

  if (!authed) {
    return (
      <AppShell dim={false} className="dk center">
        <form onSubmit={login} className="stack" style={{ width: '100%', maxWidth: 300 }}>
          <span style={{ display: 'grid', placeItems: 'center', margin: '0 auto', background: '#0B0B0C', borderRadius: 14, padding: 9 }}>
            <Logo size={26} />
          </span>
          <h1 className="big" style={{ fontSize: 19, textAlign: 'center' }}>Admin dashboard</h1>
          <p className="lead" style={{ textAlign: 'center', fontSize: 13 }}>Masukkan admin key lokal.</p>
          <input
            className="inp m"
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            aria-label="Admin key"
            style={{ textAlign: 'center', letterSpacing: '.3em' }}
          />
          {loginError && <p className="err" role="alert">{loginError}</p>}
          <Btn type="submit" block>Masuk</Btn>
        </form>
      </AppShell>
    );
  }

  const maxCount = Math.max(1, ...(data?.chartData.map((d) => d.count) ?? [1]));

  return (
    <AppShell className="dk">
      <TopBar
        title="Admin"
        right={<span className="sysbadge">system ok</span>}
      />

      <div className="page">
        <div className="kgrid">
          <div className="card kv">
            <span className="k">TERKIRIM</span>
            <span className="v num">{data?.totalGb} <small>GB</small></span>
          </div>
          <div className="card kv">
            <span className="k">SESI SELESAI</span>
            <span className="v num">{data?.totalTransfers}</span>
          </div>
          <div className="card kv">
            <span className="k">PENGUNJUNG</span>
            <span className="v num">{data?.totalVisitors}</span>
          </div>
          <div className="card kv">
            <span className="k">FILE TERBESAR</span>
            <span className="v" style={{ fontSize: 15, wordBreak: 'break-all' }}>
              {data?.largestFile?.file_name ?? '—'}
              <small> {formatBytes(data?.largestFile?.file_size || 0)}</small>
            </span>
          </div>
        </div>

        <div className="sechead">
          <h4 className="sech" style={{ color: '#8B94A3' }}>Aktivitas 7 hari</h4>
          <Btn size="sm" variant="white" onClick={sync} disabled={syncing}>{syncing ? 'Sync…' : 'Sync'}</Btn>
        </div>
        <div className="chart">
          {data?.chartData.map((d) => {
            const day = DAY[new Date(d.date).getDay()] ?? d.date;
            return (
              <div className="c" key={d.date} title={`${day}: ${d.count}`}>
                <b style={{ height: `${Math.max(2, (d.count / maxCount) * 100)}%` }} />
                <s>{day}</s>
              </div>
            );
          })}
        </div>

        <div className="card pad" style={{ fontSize: 12.5, color: '#8B94A3', lineHeight: 1.6 }}>
          Angka diambil langsung dari Supabase. Metrik dasar untuk melihat pemakaian — tanpa pelacak pihak ketiga, tanpa profil pengguna.
        </div>
      </div>
    </AppShell>
  );
}