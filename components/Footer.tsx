'use client';

import { Logo } from './Logo';

/** Public footer — product credit plus the maker, the way a SaaS footer reads. */
export default function SiteFooter() {
  return (
    <footer
      style={{
        borderTop: '1px solid var(--line)',
        padding: '22px 18px 26px',
        display: 'grid',
        gap: 14,
        justifyItems: 'center',
        textAlign: 'center',
      }}
    >
      <div className="row" style={{ gap: 10 }}>
        <span className="mark" style={{ width: 24, height: 24, borderRadius: 8, background: 'var(--ink)', color: 'var(--accent)', display: 'grid', placeItems: 'center' }}>
          <Logo size={14} />
        </span>
        <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: '-.02em' }}>RafQR</span>
      </div>
      <p className="tiny muted" style={{ margin: 0, maxWidth: '38ch' }}>
        Pindahkan file dan teks antar perangkat lewat QR. Sesi hangus sendiri, tanpa akun.
      </p>
      <div className="row wrapr" style={{ gap: 6, justifyContent: 'center' }}>
        <a className="badge n" href="https://raffitech.biz.id" target="_blank" rel="noopener noreferrer">
          RaffiTech Solutions
        </a>
        <span className="badge n">Otomatis terhapus 30 menit</span>
      </div>
      <p className="tiny" style={{ margin: 0, color: 'var(--faint)' }}>
        © {new Date().getFullYear()} RafQR — bagian dari RaffiTech Solutions
      </p>
    </footer>
  );
}