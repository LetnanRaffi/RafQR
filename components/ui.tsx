'use client';

import { Logo } from './Logo';
import { ScanIcon } from './icons';

type ShellProps = { children: React.ReactNode; className?: string };

/** Full-page wrapper with the subtle dot texture + selection styling. */
export function PageShell({ children, className = '' }: ShellProps) {
  return (
    <div className={`min-h-screen bg-paper text-ink font-sans flex flex-col overflow-x-hidden selection:bg-accent selection:text-ink ${className}`}>
      {children}
    </div>
  );
}

type HeaderProps = {
  label?: string;
  onLogoClick?: () => void;
  right?: React.ReactNode;
  showScan?: boolean;
  onScan?: () => void;
};

/** Consistent top bar used across pages. */
export function SiteHeader({ label = 'RafQR', onLogoClick, right, showScan, onScan }: HeaderProps) {
  return (
    <nav className="relative z-10 w-full border-b-2 border-ink bg-white">
      <div className="max-w-5xl mx-auto w-full px-5 sm:px-8 py-4 flex justify-between items-center">
        <button onClick={onLogoClick} className="flex items-center gap-3 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 rounded-md">
          <span className="bg-ink p-1.5 rounded-md">
            <Logo size={22} color="white" />
          </span>
          <span className="text-xl font-extrabold tracking-tight">{label}</span>
        </button>
        {right ??
          (showScan && (
            <button onClick={onScan} className="neo-btn bg-accent text-sm">
              <ScanIcon className="w-4 h-4" /> Pindai
            </button>
          ))}
      </div>
    </nav>
  );
}

/** Quiet, honest footer. */
export function SiteFooter() {
  return (
    <footer className="relative z-10 w-full py-10 border-t-2 border-ink bg-white mt-auto">
      <div className="max-w-5xl mx-auto px-5 flex flex-col sm:flex-row items-center justify-between gap-4 text-center">
        <p className="text-xs font-semibold text-muted">
          © {new Date().getFullYear()} RafQR — RaffiTech Labs
        </p>
        <p className="text-[11px] font-medium text-muted">
          Tanpa akun · Auto-hapus 30 menit · Enkripsi lokal
        </p>
      </div>
    </footer>
  );
}

type ToggleProps = {
  label: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
};

/** Accessible switch styled to the refined neo language. */
export function Toggle({ label, checked, onChange, disabled }: ToggleProps) {
  return (
    <label
      className={`flex items-center justify-between gap-3 p-3.5 border-2 border-ink rounded-md cursor-pointer transition-all
        ${checked ? 'bg-accent shadow-none translate-x-[3px] translate-y-[3px]' : 'bg-white shadow-neo-hover hover:-translate-y-0.5'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <span className="text-sm font-bold">{label}</span>
      <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} className="sr-only" />
      <span className={`relative w-10 h-5 rounded-full border-2 border-ink transition-colors ${checked ? 'bg-ink' : 'bg-white'}`}>
        <span className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full border border-ink bg-accent transition-transform ${checked ? 'translate-x-5' : ''}`} />
      </span>
    </label>
  );
}
