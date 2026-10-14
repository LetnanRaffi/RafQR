'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { uploadFileToR2 } from '../lib/r2-client';
import { encryptData } from '../lib/crypto';
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
import { MAX_FILE_BYTES, purgeUploads, trackTransfer, trackVisit } from '../lib/session';
import { formatLimit } from '../lib/limits';

type Mode = 'send' | 'receive';
type SendTab = 'files' | 'text';
type Step = 'input' | 'uploading' | 'success' | 'waiting';
type RowStatus = 'queued' | 'uploading' | 'done' | 'error';

interface Row {
  key: string;
  file: File;
  status: RowStatus;
  progress: number;
  error?: string;
}

interface UploadedFile { fileName: string; fileSize: number; fileType: string; firebaseUrl: string; storageRef: string; }

export default function HomePage() {
  const [mode, setMode] = useState<Mode>('send');
  const [sendTab, setSendTab] = useState<SendTab>('files');
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

  const [optionsOpen, setOptionsOpen] = useState(false);
  const [pinMode, setPinMode] = useState(false);
  const [pinCode, setPinCode] = useState('');
  const [e2eeEnabled, setE2eeEnabled] = useState(false);
  const [encryptionKey, setEncryptionKey] = useState('');
  const [customId, setCustomId] = useState('');
  const [useCustomId, setUseCustomId] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const totalSize = rows.reduce((s, r) => s + r.file.size, 0);
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

  /* ── session polling ──────────────────────────────────────────── */
  useEffect(() => {
    trackVisit();
    const saved = localStorage.getItem('rafqr_history');
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved).filter((i: { createdAt: number }) => Date.now() - i.createdAt < 1800000);
      localStorage.setItem('rafqr_history', JSON.stringify(parsed));
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
    setTextContent('');
    setError(null);
    setUniqueId(null);
    setTtl(null);
    setRecipientOpened(false);
    setSendTab('files');
  };

  /* ── upload ───────────────────────────────────────────────────── */
  const handleUpload = async () => {
    setError(null);
    const hasText = !!textContent.trim();
    if (rows.length === 0 && !hasText) { setError('Pilih file atau tulis pesan dulu.'); return; }
    if (pinMode && pinCode.length < 4) { setError('PIN minimal 4 digit.'); return; }
    if (e2eeEnabled && encryptionKey.length < 8) { setError('Kunci E2EE minimal 8 karakter.'); return; }

    setStep('uploading');
    const uploaded: UploadedFile[] = [];
    const abort = new AbortController();
    abortRef.current = abort;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, status: 'uploading' } : r)));
      try {
        const blob = e2eeEnabled ? await encryptData(row.file, encryptionKey) : row.file;
        const { downloadURL, storagePath } = await uploadFileToR2(
          blob,
          (p) => setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, progress: p } : r))),
          row.file.name,
          abort.signal,
        );
        uploaded.push({
          fileName: row.file.name,
          fileSize: blob.size,
          fileType: row.file.type,
          firebaseUrl: downloadURL,
          storageRef: storagePath,
        });
        setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, status: 'done', progress: 100 } : r)));
      } catch (err) {
        if ((err as Error).name === 'AbortError') throw err;
        // One bad file must not sink the whole batch.
        setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, status: 'error', error: (err as Error).message } : r)));
      }
    }

    setError(null);
    setTtl(1800);
    const senderId = customId.trim() || nanoid(10);
    const res = await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: senderId,
        files: uploaded.length > 0 ? uploaded : undefined,
        textContent: hasText ? textContent.trim() : undefined,
        pin: pinMode ? pinCode : undefined,
        e2ee: e2eeEnabled,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      // Blobs already in storage have no session pointing at them; drop them.
      // Deliberately no `?id=` — on a 409 that id belongs to someone else.
      await purgeUploads(uploaded.map((f) => f.storageRef));
      setError(body.error || 'Gagal membuat sesi.');
      setStep('input');
      return;
    }

    setUniqueId(senderId);
    setStep('success');
    trackTransfer(senderId, uploaded.length > 0 ? uploaded : [{ fileName: 'Pesan teks', fileSize: new Blob([textContent]).size }]);
  };

  const cancelUpload = async () => {
    abortRef.current?.abort();
    setRows((prev) => prev.filter((r) => r.status !== 'done'));
    setStep('input');
  };

  const startReceiving = async () => {
    setError(null);
    const id = customId.trim();
    if (!id) { setError('ID penerimaan belum dibuat.'); return; }
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

  /* ── render: send ─────────────────────────────────────────────── */
  const renderSend = () => {
    const doneCount = rows.filter((r) => r.status === 'done').length;
    const failed = rows.filter((r) => r.status === 'error');
    const busy = step === 'uploading';

    return (
      <>
        <div className="page narrow stack">
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
                            r.file.type.startsWith('image/') ? (
                              <span className="img"><img src={URL.createObjectURL(r.file)} alt="" /></span>
                            ) : undefined
                          }
                          meta={
                            r.status === 'error' ? <span style={{ color: 'var(--danger)' }}>{r.error}</span>
                            : r.status === 'uploading' ? `${formatSize(r.file.size)} · uploading`
                            : r.status === 'done' ? `${formatSize(r.file.size)} · ${r.file.name.split('.').pop()?.toUpperCase()} · selesai`
                            : `${formatSize(r.file.size)} · ${r.file.name.split('.').pop()?.toUpperCase()}${busy ? ' · antre' : ''}`
                          }
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
          </div>

          <Disclosure open={optionsOpen} onToggle={() => setOptionsOpen(!optionsOpen)}>
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
          </Disclosure>

          <p className="hint" style={{ textAlign: 'center' }}>
            Sesi &amp; file terhapus otomatis 30 menit setelah dibuat.
          </p>
        </div>

        {busy ? (
          <div className="dock">
            <div className="sum"><span>{doneCount} dari {rows.length} file terkirim</span><span>aman</span></div>
            <Btn variant="white" block onClick={cancelUpload}>Batalkan &amp; bersihkan</Btn>
          </div>
        ) : (
          <div className="dock">
            <div className="sum">
              <span>{rows.length > 0 ? `${rows.length} file · ${formatSize(totalSize)}` : (textContent.trim() ? '1 pesan teks' : 'Belum ada file')}</span>
              <span className="muted">kirim instan</span>
            </div>
            <Btn block size="lg" onClick={handleUpload} disabled={rows.length === 0 && !textContent.trim()}>
              Buat sesi transfer
            </Btn>
          </div>
        )}
      </>
    );
  };

  /* ── render: receive ──────────────────────────────────────────── */
  const renderReceive = () => (
    <>
      <div className="page narrow stack">
        <div className="stack" style={{ gap: 7 }}>
          <h1 className="big">Terima di<br />perangkat ini.</h1>
          <p className="lead">Aktifkan penerimaan, lalu kirim ID ini ke pengirim. File-nya muncul sendiri.</p>
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

          <div className="card flat" style={{ background: 'var(--soft)', display: 'grid', justifyItems: 'center', gap: 10, padding: 22 }}>
            <span className="tiny muted" style={{ fontWeight: 600 }}>ID PENERIMAAN</span>
            <span className="mono num" style={{ fontSize: 30, fontWeight: 700, letterSpacing: '.16em' }}>{customId}</span>
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

          <p className="hint">Atau pakai ID sendiri supaya penerima bisa mengetik, bukan scan.</p>
          <div className="row" style={{ gap: 10 }}>
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
                placeholder="mis. RAF-123"
                aria-label="ID kustom"
              />
            )}
          </div>
          {error && <p className="err" role="alert">{error}</p>}
        </div>

        <div className="info"><BoltIcon size={15} /> Halaman ini boleh ditutup — incoming tetap masuk, cukup buka lagi.</div>
      </div>
      <div className="dock">
        <Btn block size="lg" onClick={startReceiving}>Aktifkan penerimaan</Btn>
      </div>
    </>
  );

  /* ── render: session active / waiting ─────────────────────────── */
  const renderActive = () => {
    const waiting = step === 'waiting';
    return (
      <>
        <div className="page">
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
      {step === 'success' || step === 'waiting'
        ? renderActive()
        : mode === 'receive'
          ? renderReceive()
          : renderSend()}

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
    <div className="page narrow stack" style={{ paddingTop: 0 }}>
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