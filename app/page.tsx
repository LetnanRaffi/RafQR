'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CloudProvider } from '../lib/transfer/cloud-provider';
import P2PSender from '../components/P2PSender';
import P2PReceiver from '../components/P2PReceiver';
import LivePhotoHint from '../components/LivePhotoHint';
import { nanoid } from 'nanoid';
import QrBox from '../components/BrandedQR';
import SiteFooter from '../components/Footer';
import { toast } from '../components/toast';
import {
  AppShell, TopBar, Btn, Segmented, Tabs, Dropzone, FileRow, Toggle, Disclosure,
  Field, Countdown, useCountdown, Copied,
} from '../components/ui';
import {
  ScanIcon, CloudUpIcon, DownloadIcon, ShareIcon, MicIcon, StopIcon, RefreshIcon,
  CopyIcon, CheckIcon, BoltIcon, ShieldIcon, ClockIcon, XIcon,
} from '../components/icons';
import { formatSize } from '../lib/format';
import { useFilePreviews, fileKey } from '../lib/preview';
import { MAX_FILE_BYTES, trackVisit } from '../lib/session';
import { formatLimit } from '../lib/limits';

type Mode = 'send' | 'receive';
type SendTab = 'files' | 'text';
type Step = 'input' | 'uploading' | 'success' | 'waiting' | 'p2p' | 'p2p-receive';
type RowStatus = 'queued' | 'uploading' | 'done' | 'error';
const P2P_ENABLED = process.env.NEXT_PUBLIC_P2P_ENABLED !== 'false' && Boolean(process.env.NEXT_PUBLIC_P2P_SIGNALING_URL);

interface Row {
  key: string;
  file: File;
  status: RowStatus;
  progress: number;
  error?: string;
}

interface RecentTransfer { id: string; createdAt: number; fileCount: number; }

export default function HomePage() {
  const [mode, setMode] = useState<Mode>('send');
  const [sendTab, setSendTab] = useState<SendTab>('files');
  const [transferMode, setTransferMode] = useState<'p2p' | 'cloud'>('cloud');
  const [receiveMode, setReceiveMode] = useState<'p2p' | 'cloud'>('cloud');
  const [step, setStep] = useState<Step>('input');

  const [rows, setRows] = useState<Row[]>([]);
  const [textContent, setTextContent] = useState('');
  const [isRecording, setIsRecording] = useState(false);

  const [uniqueId, setUniqueId] = useState<string | null>(null);
  const [ttl, setTtl] = useState<number | null>(null);
  const secondsLeft = useCountdown(ttl);
  const [recipientOpened, setRecipientOpened] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [recent, setRecent] = useState<RecentTransfer[]>([]);
  const [finalizing, setFinalizing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [openCode, setOpenCode] = useState('');
  const [openCodeError, setOpenCodeError] = useState<string | null>(null);

  const [optionsOpen, setOptionsOpen] = useState(false);
  const [pinMode, setPinMode] = useState(false);
  const [pinCode, setPinCode] = useState('');
  const [e2eeEnabled, setE2eeEnabled] = useState(false);
  const [encryptionKey, setEncryptionKey] = useState('');
  const [customId, setCustomId] = useState('');
  const [useCustomId, setUseCustomId] = useState(false);

  const cloudRef = useRef<CloudProvider | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const previewFiles = useMemo(() => rows.map((r) => r.file), [rows]);
  const previews = useFilePreviews(previewFiles);
  // Desktop: once files are selected the dropzone is replaced by a button, so
  // there would otherwise be no drop target left on the page at all.
  const [pageDrag, setPageDrag] = useState(false);
  const dragDepth = useRef(0);

  const totalSize = rows.reduce((s, r) => s + r.file.size, 0);
  const sentSize = rows.reduce((s, r) => s + r.file.size * (r.status === 'done' ? 1 : r.status === 'uploading' ? r.progress / 100 : 0), 0);
  const uploadPercent = rows.length === 0 ? 0 : totalSize > 0
    ? Math.round((sentSize / totalSize) * 100)
    : Math.round(rows.reduce((s, r) => s + (r.status === 'done' ? 100 : r.progress), 0) / rows.length);
  const shareUrl = typeof window !== 'undefined' && uniqueId ? `${window.location.origin}/d/${uniqueId}` : '';
  const receiveUrl = typeof window !== 'undefined' && uniqueId ? `${window.location.origin}/u/${uniqueId}` : '';
  const activeUrl = step === 'waiting' ? receiveUrl : shareUrl;

  /* ── audio note ───────────────────────────────────────────────── */
  const startRecording = async () => {
    const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      toast('Browser ini tidak mendukung rekam audio.', 'error');
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast('Izin mikrofon ditolak. Aktifkan izin mikrofon di pengaturan browser.', 'error');
      return;
    }
    const rec = new MediaRecorder(stream, { mimeType });
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    rec.onstop = () => {
      const ext = mimeType === 'audio/mp4' ? 'm4a' : 'webm';
      const file = new File(chunksRef.current as unknown as BlobPart[], `Catatan-${nanoid(6)}.${ext}`, { type: mimeType });
      addFiles([file]);
      chunksRef.current = [];
      stream.getTracks().forEach((t) => t.stop());
    };
    chunksRef.current = [];
    rec.start();
    mediaRef.current = rec;
    setIsRecording(true);
  };

  /* ── file list ────────────────────────────────────────────────── */
  const addFiles = useCallback((files: File[]) => {
    setError(null);
    setRows((prev) => [
      ...prev,
      ...files.map((file) => ({ key: `${file.name}-${file.size}-${nanoid(6)}`, file, status: 'queued' as RowStatus, progress: 0 })),
    ]);
  }, []);

  const removeRow = (key: string) => setRows((prev) => prev.filter((r) => r.key !== key));

  // Ctrl+V anywhere on the page drops files into the list.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (step !== 'input' || mode !== 'send') return;
      const files = Array.from(e.clipboardData?.files || []);
      if (files.length > 0) { e.preventDefault(); addFiles(files); }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [addFiles, mode, step]);

  // Desktop: Cmd/Ctrl+Enter submits, so the mouse is not the only way.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || !(e.metaKey || e.ctrlKey)) return;
      if (step !== 'input' || mode !== 'send') return;
      if (e.target instanceof HTMLElement && e.target.closest('.open-session-form')) return;
      e.preventDefault();
      void handleUpload();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /* ── session polling ──────────────────────────────────────────── */
  useEffect(() => {
    trackVisit();
    const saved = localStorage.getItem('rafqr_history');
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved);
      const valid = Array.isArray(parsed) ? parsed.filter((i: RecentTransfer) =>
        typeof i.id === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(i.id) &&
        typeof i.fileCount === 'number' &&
        typeof i.createdAt === 'number' && i.createdAt <= Date.now() && Date.now() - i.createdAt < 1800000,
      ).slice(0, 3) : [];
      setRecent(valid);
      localStorage.setItem('rafqr_history', JSON.stringify(valid));
    } catch { /* corrupt history is not worth a dialog */ }
  }, []);

  useEffect(() => {
    if ((step !== 'waiting' && step !== 'success') || !uniqueId) return;

    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (!document.hidden) {
        try {
          const res = await fetch(`/api/session?id=${uniqueId}`);
          const result = await res.json();
          if (typeof result.ttl === 'number') setTtl(result.ttl);
          const hasData = result.data && (result.data.files || (result.data.textContent && result.data.textContent !== 'WAITING_FOR_UPLOAD'));
          if (step === 'waiting' && res.ok && hasData) {
            window.location.href = `/d/${uniqueId}`;
            return;
          }
          if (step === 'success' && res.ok && result.data?.isDownloaded) setRecipientOpened(true);
        } catch { /* transient: the next tick tries again */ }
      }
      timer = setTimeout(tick, 3000);
    };
    tick();
    const onVisible = () => { if (!document.hidden) { clearTimeout(timer); tick(); } };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [step, uniqueId]);

  /* ── receive ID ───────────────────────────────────────────────── */
  useEffect(() => {
    if (mode === 'receive' && !useCustomId) setCustomId(nanoid(8).toUpperCase());
  }, [mode, useCustomId]);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast('Tidak bisa menyalin. Salin manual dari kotak tautan.', 'error');
    }
  };

  const resetAll = () => {
    setStep('input');
    setRows([]);
    setTransferMode('cloud');
    setReceiveMode('cloud');
    setTextContent('');
    setError(null);
    setUniqueId(null);
    setTtl(null);
    setRecipientOpened(false);
    setSendTab('files');
    setFinalizing(false);
    setCancelling(false);
  };

  const openSession = (event: React.FormEvent) => {
    event.preventDefault();
    const value = openCode.trim();
    let path: string | null = null;
    if (/^p2p:[A-Za-z0-9_-]{16}$/.test(value)) {
      path = `/p/${value.slice(4)}`;
    } else if (/^[a-zA-Z0-9_-]{1,64}$/.test(value)) {
      path = `/d/${value}`;
    } else {
      try {
        const url = new URL(value);
        if (url.origin === window.location.origin && (/^\/(d|u)\/[a-zA-Z0-9_-]{1,64}\/?$/.test(url.pathname) || /^\/p\/[A-Za-z0-9_-]{16}\/?$/.test(url.pathname))) {
          path = url.pathname;
        } else if (url.origin === window.location.origin && /^\/p\/[A-Za-z0-9_-]{16}\/send\/?$/.test(url.pathname) && /^#token=[A-Za-z0-9_-]{40,60}$/.test(url.hash)) {
          path = url.pathname + url.hash;
        }
      } catch { /* invalid input is explained below */ }
    }
    if (!path) {
      setOpenCodeError('Masukkan kode sesi atau tautan QRData yang valid.');
      return;
    }
    window.location.assign(path);
  };

  /* ── upload ───────────────────────────────────────────────────── */
  const handleCloudUpload = async () => {
    setError(null);
    const hasText = !!textContent.trim();
    if (rows.length === 0 && !hasText) { setError('Pilih file atau tulis pesan dulu.'); return; }
    if (pinMode && pinCode.length < 4) { setError('PIN minimal 4 digit.'); return; }
    if (e2eeEnabled && encryptionKey.length < 8) { setError('Kunci E2EE minimal 8 karakter.'); return; }

    setStep('uploading');
    setFinalizing(false);
    setCancelling(false);
    const provider = new CloudProvider();
    cloudRef.current = provider;

    try {
      const { id: senderId, uploaded, failedKeys } = await provider.send({
        files: rows.map(({ key, file }) => ({ key, file })),
        textContent,
        customId,
        pin: pinMode ? pinCode : undefined,
        encryptionKey: e2eeEnabled ? encryptionKey : undefined,
      }, (event) => {
        if (event.type === 'finalizing') { setFinalizing(true); return; }
        setRows((prev) => prev.map((row) => {
          if (row.key !== event.key) return row;
          if (event.type === 'file-start') return { ...row, status: 'uploading' };
          if (event.type === 'file-progress') return { ...row, progress: event.percent };
          if (event.type === 'file-done') return { ...row, status: 'done', progress: 100 };
          return { ...row, status: 'error', progress: 0, error: event.message };
        }));
      });

      setRows((prev) => prev.filter((r) => r.status === 'done'));
      setTtl(1800);
      setUniqueId(senderId);
      setStep('success');
      const nextRecent = [{ id: senderId, createdAt: Date.now(), fileCount: uploaded.length }, ...recent.filter((r) => r.id !== senderId)].slice(0, 3);
      setRecent(nextRecent);
      try { localStorage.setItem('rafqr_history', JSON.stringify(nextRecent)); } catch { /* storage may be disabled */ }
      if (failedKeys.length > 0) toast(`${failedKeys.length} file gagal; yang berhasil tetap terkirim.`, 'error');
    } catch (err) {
      setRows((prev) => prev.map((r) => ({ ...r, status: 'queued', progress: 0, error: undefined })));
      setError((err as Error).name === 'AbortError' ? 'Transfer dibatalkan.' : (err as Error).message || 'Gagal membuat sesi.');
      setStep('input');
    } finally {
      cloudRef.current = null;
      setFinalizing(false);
      setCancelling(false);
    }
  };

  const handleUpload = async () => {
    if (transferMode === 'p2p' && P2P_ENABLED) {
      if (rows.length === 0 && !textContent.trim()) { setError('Pilih file atau tulis pesan dulu.'); return; }
      const oversized = rows.find((row) => row.file.size > MAX_FILE_BYTES);
      if (oversized) { setError(`File ${oversized.file.name} melebihi batas ${formatLimit(MAX_FILE_BYTES)}.`); return; }
      if (new TextEncoder().encode(textContent.trim()).byteLength > 16 * 1024) { setError('Pesan P2P maksimal 16 KB. Gunakan Cloud untuk pesan lebih panjang.'); return; }
      setError(null);
      setStep('p2p');
      return;
    }
    await handleCloudUpload();
  };

  const cancelUpload = () => {
    if (finalizing) return;
    setCancelling(true);
    cloudRef.current?.cancel();
  };

  const startReceiving = async () => {
    setError(null);
    if (receiveMode === 'p2p' && P2P_ENABLED) { setStep('p2p-receive'); return; }
    const id = customId.trim();
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) { setError('ID penerimaan harus 1–64 huruf, angka, tanda hubung, atau garis bawah.'); return; }
    const res = await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, textContent: 'WAITING_FOR_UPLOAD' }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || 'Gagal mengaktifkan penerimaan.');
      return;
    }
    setUniqueId(id);
    setTtl(1800);
    setStep('waiting');
  };

  const stopReceiving = async () => {
    if (uniqueId) await fetch(`/api/session?id=${uniqueId}`, { method: 'DELETE' }).catch(() => {});
    resetAll();
  };

  /* ── page-level drop (desktop) ────────────────────────────────── */
  const dragProps = step === 'input' && mode === 'send' && sendTab === 'files'
    ? {
        onDragEnter: (e: React.DragEvent) => {
          if (!e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
          dragDepth.current += 1;
          setPageDrag(true);
        },
        onDragOver: (e: React.DragEvent) => {
          if (e.dataTransfer.types.includes('Files')) e.preventDefault();
        },
        onDragLeave: () => {
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setPageDrag(false);
        },
        onDrop: (e: React.DragEvent) => {
          e.preventDefault();
          dragDepth.current = 0;
          setPageDrag(false);
          addFiles(Array.from(e.dataTransfer.files));
        },
      }
    : {};

  /* ── render: send ─────────────────────────────────────────────── */
  const renderSend = () => {
    const doneCount = rows.filter((r) => r.status === 'done').length;
    const failed = rows.filter((r) => r.status === 'error');
    const busy = step === 'uploading';

    return (
      <>
        <div className="page narrow stack send-page">
          <div className="stack" style={{ gap: 7 }}>
            <h1 className="big">
              {busy ? <>Mengirim…</> : <>Kirim file ke<br />perangkat lain.</>}
            </h1>
            <p className="lead">
              {busy
                ? 'Jangan tutup halaman. File sudah aman di perangkatmu, tinggal menunggu naik.'
                : 'Seret file atau paste apa pun. HP cukup scan QR-nya.'}
            </p>
          </div>

          <div className="card pad stack">
            <Segmented
              value={mode}
              onChange={(v) => { setMode(v); setError(null); }}
              options={[
                { value: 'send', label: 'Kirim', icon: <CloudUpIcon size={15} /> },
                { value: 'receive', label: 'Terima', icon: <DownloadIcon size={15} /> },
              ]}
            />

            <Tabs
              value={sendTab}
              onChange={setSendTab}
              tabs={[
                { value: 'files', label: `File · ${rows.length}` },
                { value: 'text', label: 'Teks' },
              ]}
            />

            {P2P_ENABLED && <div className="p2p-mode-choice">
              <Toggle
                label="Transfer langsung (P2P)"
                hint={transferMode === 'p2p' ? 'File dan teks dikirim langsung setelah penerima terhubung.' : 'Nonaktif: kiriman disimpan di Cloud selama 30 menit.'}
                checked={transferMode === 'p2p'}
                onChange={() => {
                  const next = transferMode === 'p2p' ? 'cloud' : 'p2p';
                  setTransferMode(next);
                  if (next === 'p2p') { setPinMode(false); setE2eeEnabled(false); setOptionsOpen(false); }
                }}
              />
            </div>}

            {sendTab === 'files' ? (
              <>
                {rows.length === 0 && !busy ? (
                  <Dropzone
                    title="Seret file ke sini"
                    sub={`atau klik pilih · maks ${formatLimit(MAX_FILE_BYTES)} per file`}
                    cta="Pilih file"
                    onFiles={addFiles}
                  />
                ) : (
                  <>
                    <div className="rows">
                      {rows.map((r) => (
                        <FileRow
                          key={r.key}
                          name={r.file.name}
                          dim={r.status === 'queued' && busy}
                          thumb={
                            r.file.type.startsWith('image/') && previews[fileKey(r.file)]
                              ? <span className="img"><img src={previews[fileKey(r.file)]} alt="" /></span>
                              : undefined
                          }
                          meta={
                            r.status === 'error' ? <span style={{ color: 'var(--danger)' }}>{r.error}</span>
                            : r.status === 'uploading' ? `${formatSize(r.file.size)} · mengunggah ${r.progress}%`
                            : r.status === 'done' ? `${formatSize(r.file.size)} · ${r.file.name.split('.').pop()?.toUpperCase()} · selesai`
                            : `${formatSize(r.file.size)} · ${r.file.name.split('.').pop()?.toUpperCase()}${busy ? ' · antre' : ''}`
                          }
                          progress={busy && (r.status === 'uploading' || r.status === 'done') ? r.progress : undefined}
                          actions={
                            busy && r.status === 'uploading' ? (
                              <svg width="16" height="16" className="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-label="Mengunggah">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-3-6.7M21 3v6h-6" />
                              </svg>
                            ) : busy ? undefined : (
                              <Btn size="icon" onClick={() => removeRow(r.key)} aria-label={`Hapus ${r.file.name}`}>
                                <XIcon size={15} />
                              </Btn>
                            )
                          }
                        />
                      ))}
                    </div>
                    {!busy && (
                      <Btn variant="white" block onClick={() => fileRef.current?.click()}>Tambah file lain</Btn>
                    )}
                  </>
                )}
                {!busy && <LivePhotoHint files={rows.map((row) => row.file)} onAddFiles={addFiles} />}
              </>
            ) : (
              <div className="stack tight">
                <div className="relative">
                  <textarea
                    className="inp"
                    style={{ minHeight: 110, paddingRight: 52 }}
                    value={textContent}
                    onChange={(e) => setTextContent(e.target.value)}
                    placeholder="Tulis pesan untuk perangkat tujuan…"
                    disabled={busy}
                  />
                  <Btn
                    size="icon"
                    variant={isRecording ? 'solid' : 'white'}
                    onClick={isRecording ? () => { mediaRef.current?.stop(); setIsRecording(false); } : startRecording}
                    aria-label={isRecording ? 'Stop rekam' : 'Rekam suara'}
                    style={{ position: 'absolute', right: 8, bottom: 8 }}
                  >
                    {isRecording ? <StopIcon size={15} /> : <MicIcon size={16} />}
                  </Btn>
                </div>
                <p className="hint">
                  {isRecording ? 'Merekam… tekan sekali lagi untuk berhenti.' : 'Bisa juga rekam catatan suara dan dikirim sebagai file.'}
                </p>
              </div>
            )}

            {failed.length > 0 && (
              <div className="alert">
                <span>
                  Gagal: {failed.map((f) => f.file.name).join(', ')}. {failed.length === rows.length ? 'Tidak ada file yang terkirim.' : 'File lain tetap terkirim.'}
                </span>
              </div>
            )}
            {error && <p className="err" role="alert">{error}</p>}

            <div className="send-action">
              {busy ? (
                <>
                  <div className="progcard" role="status" aria-live="polite">
                    <div className="lbl">
                      <span>{finalizing ? 'Membuat sesi…' : cancelling ? 'Membersihkan file…' : `${doneCount} dari ${rows.length} file selesai`}</span>
                      <span className="num">{uploadPercent}%</span>
                    </div>
                    <div className="progline" role="progressbar" aria-label="Progres transfer" aria-valuenow={uploadPercent} aria-valuemin={0} aria-valuemax={100}>
                      <i style={{ width: `${uploadPercent}%` }} />
                    </div>
                  </div>
                  <Btn variant="white" block onClick={cancelUpload} disabled={finalizing || cancelling}>
                    {finalizing ? 'Menyimpan sesi' : cancelling ? 'Membatalkan…' : 'Batalkan & bersihkan'}
                  </Btn>
                </>
              ) : (
                <>
                  <div className="sum">
                    <span>{rows.length > 0 ? `${rows.length} file · ${formatSize(totalSize)}${textContent.trim() ? ' + pesan teks' : ''}` : (textContent.trim() ? '1 pesan teks' : 'Belum ada file')}</span>
                    <span className="muted">{rows.length > 0 || textContent.trim() ? 'Ctrl/⌘ + Enter' : 'kirim instan'}</span>
                  </div>
                  <Btn block size="lg" onClick={handleUpload} disabled={rows.length === 0 && !textContent.trim()}>
                    Buat sesi transfer
                  </Btn>
                </>
              )}
            </div>
          </div>

          {!busy && <form className="card pad stack open-session-form" onSubmit={openSession}>
            <div className="stack tight">
              <h2 className="sml">Sudah punya kode atau tautan?</h2>
              <p className="hint">Tempel tautan QRData atau ketik kode sesi untuk membuka kiriman atau mengirim ke penerima.</p>
            </div>
            <div className="row open-session">
              <input
                className="inp"
                value={openCode}
                onChange={(e) => { setOpenCode(e.target.value); setOpenCodeError(null); }}
                placeholder="Kode sesi atau tautan QRData"
                aria-label="Kode sesi atau tautan QRData"
                autoComplete="off"
                spellCheck={false}
              />
              <Btn type="submit">Buka sesi</Btn>
            </div>
            {openCodeError && <p className="err" role="alert">{openCodeError}</p>}
          </form>}

          <input
            ref={fileRef}
            type="file"
            multiple
            className="sr-only"
            aria-label="Pemilih file tambahan"
            onChange={(e) => { addFiles(Array.from(e.target.files || [])); e.target.value = ''; }}
          />

          {transferMode === 'cloud' && <Disclosure open={optionsOpen} onToggle={() => setOptionsOpen(!optionsOpen)}>
            <div className="stack tight" style={{ paddingTop: 8 }}>
              <Toggle
                label="Enkripsi E2EE"
                hint="Kunci tidak pernah dikirim ke server"
                checked={e2eeEnabled}
                disabled={busy}
                onChange={() => setE2eeEnabled(!e2eeEnabled)}
              />
              {e2eeEnabled && (
                <Field label="Kunci rahasia" htmlFor="e2ee-key">
                  <div className="row" style={{ gap: 8 }}>
                    <input
                      id="e2ee-key"
                      className="inp m"
                      value={encryptionKey}
                      onChange={(e) => setEncryptionKey(e.target.value)}
                      placeholder="minimal 8 karakter"
                      disabled={busy}
                    />
                    <Btn size="icon" onClick={() => setEncryptionKey(nanoid(16))} aria-label="Buat kunci acak">
                      <RefreshIcon size={16} />
                    </Btn>
                  </div>
                </Field>
              )}
              <Toggle
                label="Kunci PIN"
                hint="Penerima harus mengetik 4 digit"
                checked={pinMode}
                disabled={busy}
                onChange={() => setPinMode(!pinMode)}
              />
              {pinMode && (
                <Field label="PIN 4 digit" htmlFor="pin">
                  <div className="row" style={{ gap: 8 }}>
                    <input
                      id="pin"
                      className="inp m"
                      style={{ letterSpacing: '.4em' }}
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      value={pinCode}
                      onChange={(e) => setPinCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      disabled={busy}
                    />
                    <Btn size="icon" onClick={() => setPinCode(String(Math.floor(1000 + Math.random() * 9000)))} aria-label="Buat PIN acak">
                      <RefreshIcon size={16} />
                    </Btn>
                  </div>
                </Field>
              )}
              <Field label="ID sesi (opsional)" htmlFor="sid">
                <input
                  id="sid"
                  className="inp m"
                  value={customId}
                  onChange={(e) => setCustomId(e.target.value.replace(/[^a-zA-Z0-9-]/g, '').toUpperCase())}
                  placeholder="otomatis — RAF7K2X"
                  disabled={busy}
                />
              </Field>
            </div>
          </Disclosure>}

          <p className="hint" style={{ textAlign: 'center' }}>
            {transferMode === 'p2p' && P2P_ENABLED
              ? 'Sesi menunggu penerima hingga 10 menit. File dan teks tidak diunggah ke Cloud.'
              : 'Sesi tersedia 30 menit. File Cloud mengikuti kebijakan pembersihan R2.'}
          </p>

          {!busy && recent.length > 0 && (
            <div className="card pad stack recent-card">
              <div className="stack tight">
                <h2 className="sml">Kiriman terakhir di perangkat ini</h2>
                <p className="hint">Tautan tersimpan lokal sampai sesi berakhir, tanpa menyimpan file di perangkat ini.</p>
              </div>
              <div className="recent-actions">
                <span className="mono recent-id">{recent[0].id} · {recent[0].fileCount > 0 ? `${recent[0].fileCount} file` : 'pesan teks'}</span>
                <Btn size="sm" variant="white" onClick={() => copy(`${window.location.origin}/d/${recent[0].id}`)}>
                  <CopyIcon size={14} /> Salin tautan
                </Btn>
                <Btn size="sm" onClick={() => { window.location.href = `/d/${recent[0].id}`; }}>Buka</Btn>
              </div>
              <button className="recent-clear" type="button" onClick={() => { setRecent([]); localStorage.removeItem('rafqr_history'); }}>Hapus riwayat lokal</button>
            </div>
          )}
        </div>

      </>
    );
  };

  /* ── render: receive ──────────────────────────────────────────── */
  const renderReceive = () => (
    <>
      <div className="page narrow stack dock-page">
        <div className="stack" style={{ gap: 7 }}>
          <h1 className="big">Terima di<br />perangkat ini.</h1>
          <p className="lead">Aktifkan penerimaan, lalu bagikan tautan ke pengirim.</p>
        </div>

        <div className="card pad stack">
          <Segmented
            value={mode}
            onChange={(v) => { setMode(v); setError(null); }}
            options={[
              { value: 'send', label: 'Kirim', icon: <CloudUpIcon size={15} /> },
              { value: 'receive', label: 'Terima', icon: <DownloadIcon size={15} /> },
            ]}
          />

          {P2P_ENABLED && <Toggle
            label="Terima langsung (P2P)"
            hint={receiveMode === 'p2p' ? 'Buat sesi langsung untuk file dan teks. Kedua perangkat perlu tetap online.' : 'Nonaktif: terima lewat Cloud dengan ID penerimaan.'}
            checked={receiveMode === 'p2p'}
            onChange={() => { setReceiveMode(receiveMode === 'p2p' ? 'cloud' : 'p2p'); setError(null); }}
          />}

          {receiveMode === 'cloud' ? <><div className="card flat" style={{ background: 'var(--soft)', display: 'grid', justifyItems: 'center', gap: 10, padding: 22 }}>
            <span className="tiny muted" style={{ fontWeight: 600 }}>ID PENERIMAAN</span>
            <span className="receive-id mono num">{customId}</span>
            <div className="row" style={{ gap: 8 }}>
              <Copied show={copied} />
              {!copied && (
                <Btn size="sm" onClick={() => copy(receiveUrl || customId)}>
                  <CopyIcon size={14} /> Salin
                </Btn>
              )}
              <Btn size="sm" variant="white" onClick={() => setCustomId(nanoid(8).toUpperCase())}>
                <RefreshIcon size={14} /> ID baru
              </Btn>
            </div>
          </div>

          <p className="hint">Atau pakai ID sendiri supaya pengirim bisa mengetik, bukan scan.</p>
          <div className="row receive-custom" style={{ gap: 10 }}>
            <Btn
              size="sm"
              variant="white"
              onClick={() => setUseCustomId(!useCustomId)}
            >
              {useCustomId ? 'Pakai ID otomatis' : 'Pakai ID sendiri'}
            </Btn>
            {useCustomId && (
              <input
                className="inp m"
                value={customId}
                onChange={(e) => setCustomId(e.target.value.replace(/[^a-zA-Z0-9-]/g, '').toUpperCase())}
                placeholder="mis. DATA-123"
                aria-label="ID kustom"
                maxLength={64}
              />
            )}
          </div>
          </> : <p className="hint">Setelah sesi dibuat, QR dan tautan undangan akan muncul. Pengirim bisa memilih file, menulis pesan, atau keduanya.</p>}
          {error && <p className="err" role="alert">{error}</p>}
        </div>

        {receiveMode === 'cloud' ? <div className="info"><BoltIcon size={15} /> Halaman ini boleh ditutup — incoming tetap masuk, cukup buka lagi.</div> : <div className="info"><BoltIcon size={15} /> Biarkan halaman ini terbuka selama menunggu dan menerima kiriman langsung.</div>}
      </div>
      <div className="dock">
        <Btn block size="lg" onClick={startReceiving}>{receiveMode === 'p2p' ? 'Buat sesi P2P' : 'Aktifkan penerimaan'}</Btn>
      </div>
    </>
  );

  /* ── render: session active / waiting ─────────────────────────── */
  const renderActive = () => {
    const waiting = step === 'waiting';
    return (
      <>
        <div className="page dock-page">
          <div className="split">
            <div className="colL stack">
              <div className="stack" style={{ gap: 7 }}>
                {!waiting && recipientOpened && (
                  <span className="badge g"><CheckIcon size={13} /> Sudah dibuka di perangkat lain</span>
                )}
                {waiting && (
                  <span className="badge y">
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', display: 'block' }} />
                    Menunggu pengirim
                  </span>
                )}
                <h1 className="big">{waiting ? <>Siap menerima.</> : <>Sesi aktif.</>}</h1>
                <p className="lead">
                  {waiting
                    ? 'Begitu pengirim kirim, halaman ini otomatis membuka filenya.'
                    : 'Kirim tautan ini ke penerima, atau biarkan dia scan QR di layar.'}
                </p>
              </div>

              <div className="stack tight">
                <div className="linkrow">
                  <span className="u">{activeUrl.replace(/^https?:\/\//, '')}</span>
                  <Copied show={copied} />
                  {!copied && (
                    <Btn size="sm" onClick={() => copy(activeUrl)}>
                      <CopyIcon size={14} /> Salin
                    </Btn>
                  )}
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <Btn
                    variant="white"
                    size="sm"
                    style={{ flex: 1 }}
                    onClick={async () => {
                      if (navigator.share) await navigator.share({ url: activeUrl }).catch(() => {});
                      else copy(activeUrl);
                    }}
                  >
                    <ShareIcon size={15} /> Bagikan
                  </Btn>
                </div>
              </div>

              {e2eeEnabled && !waiting && encryptionKey && (
                <div className="note">
                  <ShieldIcon size={16} />
                  <span>Terenkripsi di browser. Kunci <b className="mono">{encryptionKey}</b> harus kamu kirim terpisah.</span>
                </div>
              )}

              {waiting && (
                <div className="rows">
                  <div className="lrow">
                    <span className="tile y"><DownloadIcon size={17} /></span>
                    <span className="lrow-txt">
                      <span className="t">Menunggu file masuk</span>
                      <span className="s">cek tiap 3 detik · jeda saat tab tidak terlihat</span>
                    </span>
                  </div>
                  <div className="lrow">
                    <span className="tile y"><ShieldIcon size={17} /></span>
                    <span className="lrow-txt">
                      <span className="t">Sesi terenkripsi</span>
                      <span className="s">PIN / E2EE diminta pengirim lewat kunci terpisah</span>
                    </span>
                  </div>
                </div>
              )}

              <p className="hint">
                Sesi <span className="mono">{uniqueId}</span> · {rows.length > 0 && `${rows.length} file · ${formatSize(totalSize)} · `}
                hangus otomatis dalam <span className="mono num">{secondsLeft === null ? '—' : `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`}</span>
              </p>
            </div>

            <QrBox value={activeUrl} size={212} caption={waiting ? 'Pindai untuk mengirim' : 'Pindai untuk membuka'} />
          </div>
        </div>

        <div className="dock">
          {waiting ? (
            <Btn variant="white" block onClick={stopReceiving}>Berhenti menerima</Btn>
          ) : (
            <Btn variant="white" block onClick={resetAll}>Selesai — kirim lagi</Btn>
          )}
        </div>
      </>
    );
  };

  if (step === 'p2p') return <P2PSender
    files={rows.map(({ key, file }) => ({ key, file }))}
    text={textContent}
    onAddFiles={addFiles}
    onRemoveFile={removeRow}
    onCloudFallback={() => { setTransferMode('cloud'); void handleCloudUpload(); }}
    onClose={resetAll}
  />;
  if (step === 'p2p-receive') return <P2PReceiver onClose={resetAll} />;

  return (
    <AppShell>
      <TopBar
        onLogoClick={resetAll}
        right={
          step === 'input' && mode === 'send'
            ? <Btn variant="white" size="sm" onClick={() => { window.location.href = '/scan'; }}><ScanIcon size={16} /> Pindai</Btn>
            : <Countdown seconds={secondsLeft} />
        }
      />
      <div {...dragProps} style={{ display: 'contents' }}>
        {step === 'success' || step === 'waiting'
          ? renderActive()
          : mode === 'receive'
            ? renderReceive()
            : renderSend()}
      </div>

      {pageDrag && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed', inset: 0, zIndex: 50,
            display: 'grid', placeItems: 'center',
            background: 'rgba(254,249,195,.92)', backdropFilter: 'blur(2px)',
            pointerEvents: 'none',
          }}
        >
          <div className="card pad stack" style={{ justifyItems: 'center', gap: 10 }}>
            <CloudUpIcon size={26} />
            <strong>Lepaskan untuk menambah file</strong>
            <span className="tiny muted">Ketik ⌘/Ctrl + Enter untuk kirim setelah ini</span>
          </div>
        </div>
      )}

      {step === 'input' && mode === 'send' && <HowItWorks />}

      {step === 'input' && <SiteFooter />}
    </AppShell>
  );
}

/** Layar 07 — three steps, one line each. No feature grid. */
function HowItWorks() {
  const steps = [
    { t: 'Pilih file di PC', d: 'Seret ke jendela, atau paste Ctrl+V.' },
    { t: 'Tunjukkan QR / kirim tautan', d: 'QR otomatis, bisa disimpan sebagai gambar.' },
    { t: 'HP buka & unduh', d: 'Kalau banyak file, unduh semua lewat satu ZIP.' },
  ];
  return (
    <div className="page narrow stack" style={{ paddingTop: 0, flex: 'none' }}>
      <div className="card pad stack" style={{ gap: 14 }}>
        <h2 className="mid">Cara kerja</h2>
        <div className="stack tight">
          {steps.map((s, i) => (
            <div key={s.t} className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
              <span className="tile y" style={{ borderRadius: 8, fontWeight: 700, fontSize: 13, width: 38, height: 38 }}>{i + 1}</span>
              <span>
                <span style={{ fontWeight: 600 }}>{s.t}</span>
                <span className="muted" style={{ display: 'block', fontSize: 13 }}>{s.d}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="rows">
        <div className="lrow">
          <span className="tile y"><ClockIcon size={17} /></span>
          <span className="lrow-txt">
            <span className="t">Auto-hapus 30 menit</span>
            <span className="s">Tidak ada data yang menetap di server.</span>
          </span>
        </div>
        <div className="lrow">
          <span className="tile y"><ShieldIcon size={17} /></span>
          <span className="lrow-txt">
            <span className="t">Tanpa akun</span>
            <span className="s">Tidak perlu email, tidak ada profil.</span>
          </span>
        </div>
        <div className="lrow">
          <span className="tile y"><BoltIcon size={17} /></span>
          <span className="lrow-txt">
            <span className="t">Transfer langsung ke storage</span>
            <span className="s">File tidak lewat server aplikasi.</span>
          </span>
        </div>
      </div>
    </div>
  );
}
