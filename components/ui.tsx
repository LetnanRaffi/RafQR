'use client';

import { useEffect, useRef, useState } from 'react';
import { Logo } from './Logo';
import { CloudUpIcon, BackIcon, fileGlyph } from './icons';

/* ── shell ───────────────────────────────────────────────────────── */

export function AppShell({
  children,
  className = '',
  dim = false,
  center = false,
}: {
  children: React.ReactNode;
  className?: string;
  dim?: boolean;
  center?: boolean;
}) {
  const cls = ['app', dim && 'dim', center && 'center', className].filter(Boolean).join(' ');
  return <div className={cls}>{children}</div>;
}

export function TopBar({
  children,
  right,
  onLogoClick,
  title = 'RafQR',
}: {
  children?: React.ReactNode;
  right?: React.ReactNode;
  onLogoClick?: () => void;
  title?: string;
}) {
  return (
    <div className="top">
      <div className="top-in">
        <button type="button" className="brand" onClick={onLogoClick} style={{ background: 'none', border: 0, padding: 0 }}>
          <span className="mark"><Logo size={17} /></span>
          <span className="name">{title}</span>
        </button>
        <span className="spacer" />
        {right}
      </div>
    </div>
  );
}

/** TopBar for the scan screen: back button on the left, no logo tile. */
export function TopBarBack({
  onBack,
  title,
  right,
}: {
  onBack: () => void;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="top">
      <div className="top-in">
        <Btn size="icon" onClick={onBack} aria-label="Kembali"><BackIcon size={17} /></Btn>
        <span className="brand" style={{ marginLeft: 4 }}><span className="name">{title}</span></span>
        <span className="spacer" />
        {right}
      </div>
    </div>
  );
}

/* ── countdown ───────────────────────────────────────────────────── */

/** Ticks down from a server-supplied TTL (seconds). */
export function useCountdown(initialSeconds: number | null) {
  const [left, setLeft] = useState<number | null>(initialSeconds);
  useEffect(() => { setLeft(initialSeconds); }, [initialSeconds]);
  useEffect(() => {
    const id = setInterval(() => setLeft((v) => (v === null ? null : Math.max(0, v - 1))), 1000);
    return () => clearInterval(id);
  }, []);
  return left;
}

export const formatClock = (s: number): string =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function Countdown({ seconds }: { seconds: number | null }) {
  if (seconds === null) return null;
  const done = seconds <= 0;
  return (
    <span className={`count num${done ? ' done' : ''}`} aria-live="off">
      <s />{done ? 'habis' : formatClock(seconds)}
    </span>
  );
}

/* ── controls ────────────────────────────────────────────────────── */

type BtnProps = {
  children: React.ReactNode;
  variant?: 'solid' | 'white' | 'yellow' | 'ghost';
  size?: 'sm' | 'lg' | 'icon';
  block?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

export function Btn({ children, variant = 'solid', size, block, className = '', ...rest }: BtnProps) {
  const cls = ['btn', variant !== 'solid' && variant, size, block && 'block', className]
    .filter(Boolean).join(' ');
  return <button type="button" {...rest} className={cls}>{children}</button>;
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon?: React.ReactNode }[];
}) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-pressed={value === o.value}
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.icon}{o.label}
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({
  value,
  onChange,
  tabs,
}: {
  value: T;
  onChange: (v: T) => void;
  tabs: { value: T; label: string }[];
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.value} role="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <label className={`row${disabled ? ' opacity-40' : ''}`} style={{ gap: 12, cursor: disabled ? 'not-allowed' : 'pointer' }}>
      <span className="stack tight" style={{ gap: 2 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>{label}</span>
        {hint && <span className="tiny muted">{hint}</span>}
      </span>
      <span className="spacer" />
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        role="switch"
        aria-checked={checked}
      />
      <span className={`toggle${checked ? ' on' : ''}`} aria-hidden="true"><i /></span>
    </label>
  );
}

export function Disclosure({
  open,
  onToggle,
  children,
  label = 'Opsi lanjutan',
}: {
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  label?: string;
}) {
  return (
    <div>
      <button type="button" className={`disc${open ? ' open' : ''}`} onClick={onToggle} aria-expanded={open}>
        {label}
        <svg className="chev" style={{ marginLeft: 'auto' }} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && children}
    </div>
  );
}

export function Field({ label, children, htmlFor }: { label: string; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
    </div>
  );
}

/** Inline confirmation — replaces the global toast for copy/save (PRD §7.3). */
export function Copied({ show, children = 'Tersalin' }: { show: boolean; children?: React.ReactNode }) {
  if (!show) return null;
  return (
    <span className="copied" role="status">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
      {children}
    </span>
  );
}

/* ── file rows ───────────────────────────────────────────────────── */

/**
 * One row per file. `thumb` renders an inline preview for images (PRD §6.7:
 * no "preview" button — the format is recognised on its own).
 */
export function FileRow({
  name,
  meta,
  thumb,
  dim,
  actions,
  onOpen,
  progress,
}: {
  name: string;
  meta: React.ReactNode;
  thumb?: React.ReactNode;
  dim?: boolean;
  actions?: React.ReactNode;
  onOpen?: () => void;
  progress?: number;
}) {
  const inner = (
    <>
      {thumb ?? <span className="tile y">{fileGlyph(name)}</span>}
      <span className="lrow-txt">
        <span className="t">{name}</span>
        <span className="s">{meta}</span>
        {progress !== undefined && (
          <span className="progline file-progress" role="progressbar" aria-label={`Progres ${name}`} aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <i style={{ width: `${progress}%` }} />
          </span>
        )}
      </span>
      {actions && <span className="acts" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>{actions}</span>}
    </>
  );
  const cls = `lrow${dim ? ' dim' : ''}${actions ? ' with-actions' : ''}`;
  return onOpen ? (
    <div role="button" tabIndex={0} aria-label={`Buka pratinjau ${name}`} onClick={onOpen} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen(); } }} style={{ textAlign: 'left', width: '100%' }} className={cls}>
      {inner}
    </div>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

/* ── dropzone ────────────────────────────────────────────────────── */

export function Dropzone({
  title,
  sub,
  cta,
  onPick,
  onFiles,
  accept,
  disabled,
  className = '',
}: {
  title: string;
  sub?: string;
  cta?: string;
  /** called when the user activates the zone without picking (opens the picker) */
  onPick?: () => void;
  onFiles?: (files: File[]) => void;
  accept?: string;
  disabled?: boolean;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [hi, setHi] = useState(false);
  const activate = () => { if (onPick) onPick(); else inputRef.current?.click(); };

  return (
    <>
      <div
        className={`drop${hi ? ' hi' : ''}${disabled ? ' opacity-45 pointer-events-none' : ''} ${className}`}
        onClick={() => !disabled && activate()}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setHi(true); }}
        onDragLeave={() => setHi(false)}
        onDrop={(e) => {
          e.preventDefault();
          setHi(false);
          if (!disabled && onFiles) onFiles(Array.from(e.dataTransfer.files));
        }}
        role="button"
        tabIndex={0}
        aria-disabled={disabled}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!disabled) activate(); }
        }}
      >
        <span className="ico"><CloudUpIcon size={22} /></span>
        <span className="t">{title}</span>
        {sub && <span className="s">{sub}</span>}
        {cta && <button type="button" className="btn white sm" style={{ marginTop: 4 }} tabIndex={-1}>{cta}</button>}
      </div>
      {!onPick && (
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={accept}
          className="hidden"
          onChange={(e) => {
            if (onFiles) onFiles(Array.from(e.target.files || []));
            e.target.value = '';
          }}
        />
      )}
    </>
  );
}

/* ── pin ─────────────────────────────────────────────────────────── */

/** Four boxes, auto-advance, accepts a 4-digit paste (PRD §6.8). */
export function PinBoxes({
  value,
  onChange,
  onComplete,
}: {
  value: string;
  onChange: (v: string) => void;
  onComplete?: () => void;
}) {
  const refs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  const setAt = (i: number, chunk: string) => {
    const next = (value + chunk).replace(/\D/g, '').slice(0, 4);
    onChange(next);
    const target = Math.min(next.length, 3);
    refs[target].current?.focus();
    if (next.length === 4) onComplete?.();
  };

  return (
    <div className="row" style={{ gap: 9 }}>
      {[0, 1, 2, 3].map((i) => (
        <input
          key={i}
          ref={refs[i]}
          type="password"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          aria-label={`Digit PIN ${i + 1}`}
          className="pinbox text-center"
          value={value[i] ?? ''}
          onChange={(e) => setAt(i, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !value[i] && i > 0) refs[i - 1].current?.focus();
          }}
          onPaste={(e) => { e.preventDefault(); setAt(i, e.clipboardData.getData('text')); }}
        />
      ))}
    </div>
  );
}
