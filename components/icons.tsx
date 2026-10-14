'use client';

type IconProps = { className?: string; size?: number; style?: React.CSSProperties };

/** All icons share one stroke treatment so weight stays even across the UI. */
const Svg = ({ children, size = 18, className = '', sw = 2, style }: IconProps & { children: React.ReactNode; sw?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={sw}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={style}
    aria-hidden="true"
  >
    {children}
  </svg>
);

const P = ({ d }: { d: string }) => <path d={d} />;

export const ScanIcon = (p: IconProps) => (
  <Svg {...p} sw={2.2}><P d="M3 10V5a2 2 0 012-2h5M14 3h5a2 2 0 012 2v5M21 14v5a2 2 0 01-2 2h-5M10 21H5a2 2 0 01-2-2v-5M12 12h.01M9 12h.01M15 12h.01" /></Svg>
);

export const CloudUpIcon = (p: IconProps) => (
  <Svg {...p} sw={2.2}><P d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 111 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></Svg>
);

export const DownloadIcon = (p: IconProps) => (
  <Svg {...p} sw={2.2}><P d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" /></Svg>
);

export const ImageIcon = (p: IconProps) => (
  <Svg {...p} sw={2}><P d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></Svg>
);

export const FileIcon = (p: IconProps) => (
  <Svg {...p} sw={2}><P d="M14 2H7a2 2 0 00-2 2v16a2 2 0 002 2h10a2 2 0 002-2V7zM14 2v5h5M9 13h6M9 17h4" /></Svg>
);

export const MusicIcon = (p: IconProps) => (
  <Svg {...p} sw={2}><P d="M9 18V5l10-2v13M9 18a3 3 0 11-6 0 3 3 0 016 0zm10-2a3 3 0 11-6 0 3 3 0 016 0z" /></Svg>
);

export const VideoIcon = (p: IconProps) => (
  <Svg {...p} sw={2}><P d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.895L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></Svg>
);

export const XIcon = (p: IconProps) => (
  <Svg {...p} sw={2.5}><P d="M18 6L6 18M6 6l12 12" /></Svg>
);

export const RefreshIcon = (p: IconProps) => (
  <Svg {...p} sw={2}><P d="M21 12a9 9 0 11-3-6.7M21 3v6h-6" /></Svg>
);

export const CopyIcon = (p: IconProps) => (
  <Svg {...p} sw={2}><P d="M9 9h10a2 2 0 012 2v10a2 2 0 01-2 2H9a2 2 0 01-2-2V11a2 2 0 012-2zM5 15H4a2 2 0 01-2-2V3a2 2 0 012-2h10a2 2 0 012 2v1" /></Svg>
);

export const ShareIcon = (p: IconProps) => (
  <Svg {...p} sw={2}><P d="M4 12v7a2 2 0 002 2h12a2 2 0 002-2v-7M16 6l-4-4-4 4M12 2v13" /></Svg>
);

export const ShieldIcon = (p: IconProps) => (
  <Svg {...p} sw={2}><P d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></Svg>
);

export const LockIcon = (p: IconProps) => (
  <Svg {...p} sw={2}><P d="M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2zM7 11V7a5 5 0 0110 0v4" /></Svg>
);

export const ClockIcon = (p: IconProps) => (
  <Svg {...p} sw={2}><P d="M12 22a10 10 0 100-20 10 10 0 000 20zM12 6v6l4 2" /></Svg>
);

export const CheckIcon = (p: IconProps) => (
  <Svg {...p} sw={3}><P d="M5 13l4 4L19 7" /></Svg>
);

export const CheckCircleIcon = (p: IconProps) => (
  <Svg {...p} sw={2}><P d="M22 11.08V12a10 10 0 11-5.93-9.14M22 4L12 14.01l-3-3" /></Svg>
);

export const BackIcon = (p: IconProps) => (
  <Svg {...p} sw={2.2}><P d="M19 12H5M12 19l-7-7 7-7" /></Svg>
);

export const ArrowLeftIcon = BackIcon;

export const ChevronIcon = (p: IconProps) => (
  <Svg {...p} sw={2.4}><P d="M6 9l6 6 6-6" /></Svg>
);

export const EditIcon = (p: IconProps) => (
  <Svg {...p} sw={2}><P d="M11 4H5a2 2 0 00-2 2v13a2 2 0 002 2h13a2 2 0 002-2v-6M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></Svg>
);

export const EyeIcon = (p: IconProps) => (
  <Svg {...p} sw={2}><P d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 15a3 3 0 100-6 3 3 0 000 6z" /></Svg>
);

export const PrevIcon = (p: IconProps) => (
  <Svg {...p} sw={2.2}><P d="M15 18l-6-6 6-6" /></Svg>
);

export const NextIcon = (p: IconProps) => (
  <Svg {...p} sw={2.2}><P d="M9 18l6-6-6-6" /></Svg>
);

export const LinkIcon = (p: IconProps) => (
  <Svg {...p} sw={2}><P d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" /></Svg>
);

export const MicIcon = (p: IconProps) => (
  <Svg {...p} sw={2}><P d="M12 15a3 3 0 003-3V6a3 3 0 00-6 0v6a3 3 0 003 3zM19 11a7 7 0 01-14 0M12 18v4M8 22h8" /></Svg>
);

export const StopIcon = (p: IconProps) => (
  <svg width={p.size ?? 18} height={p.size ?? 18} viewBox="0 0 24 24" fill="currentColor" className={p.className} style={p.style} aria-hidden="true">
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
);

export const DiceIcon = (p: IconProps) => (
  <Svg {...p} sw={2}><P d="M12 2l3 3-3 3-3-3 3-3zM5 9l3 3-3 3-3-3 3-3zM19 9l3 3-3 3-3-3 3-3zM12 16l3 3-3 3-3-3 3-3z" /></Svg>
);

export const BoltIcon = (p: IconProps) => (
  <Svg {...p} sw={2.2}><P d="M13 10V3L4 14h7v7l9-11h-7z" /></Svg>
);

export const WarningIcon = (p: IconProps) => (
  <Svg {...p} sw={2.2}><P d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></Svg>
);

export const TrashIcon = (p: IconProps) => (
  <Svg {...p} sw={2.2}><P d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /></Svg>
);

export const UploadIcon = (p: IconProps) => (
  <Svg {...p} sw={2.2}><P d="M12 21V9M12 9L8 13M12 9l4 4M4 7V5a2 2 0 012-2h12a2 2 0 012 2v2" /></Svg>
);

export const ArrowUpIcon = (p: IconProps) => (
  <Svg {...p} sw={2.4}><P d="M12 19V5M5 12l7-7 7 7" /></Svg>
);

export const ArrowDownIcon = (p: IconProps) => (
  <Svg {...p} sw={2.4}><P d="M12 5v14M19 12l-7 7-7-7" /></Svg>
);

/** File-type glyph for a row thumbnail. */
export const fileGlyph = (name: string): React.ReactNode => {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'heic', 'avif'].includes(ext)) return <ImageIcon size={17} />;
  if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'webm'].includes(ext)) return <MusicIcon size={17} />;
  if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) return <VideoIcon size={17} />;
  return <FileIcon size={17} />;
};

export const isImage = (name: string) =>
  ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'heic', 'avif'].includes((name.split('.').pop() || '').toLowerCase());
export const isVideo = (name: string) =>
  ['mp4', 'mov', 'avi', 'mkv', 'webm'].includes((name.split('.').pop() || '').toLowerCase());
export const isAudio = (name: string) =>
  ['mp3', 'wav', 'ogg', 'm4a', 'aac'].includes((name.split('.').pop() || '').toLowerCase());