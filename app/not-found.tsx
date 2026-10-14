import { AppShell, Btn } from '../components/ui';

export default function NotFound() {
  return (
    <AppShell center>
      <div className="stack" style={{ justifyItems: 'center', maxWidth: 340 }}>
        <span className="big404">404</span>
        <h1 className="mid">Halaman tidak ada</h1>
        <p className="lead" style={{ textAlign: 'center' }}>
          Tautan ini tidak lead ke mana pun. Kalau ini sesi transfer, berarti sesinya sudah habis.
        </p>
        <a className="btn lg" style={{ padding: '0 26px' }} href="/">Kembali ke beranda</a>
      </div>
    </AppShell>
  );
}