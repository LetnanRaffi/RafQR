'use client';

import { Html5QrcodeScanner, Html5QrcodeScannerState } from 'html5-qrcode';

/**
 * Single owner of the camera lifecycle.
 *
 * Why this exists: `Html5QrcodeScanner.clear()` returns a Promise that only
 * resolves once the camera has actually stopped. Calling it fire-and-forget
 * (or more than once per navigation) lets the next `render()` request the
 * camera while the previous stream is still shutting down — two concurrent
 * getUserMedia calls, two permission dialogs on Android. Everything here is
 * therefore serialised through one promise chain and there is never more than
 * one scanner instance.
 */

let scanner: Html5QrcodeScanner | null = null;
let queue: Promise<void> = Promise.resolve();

const config = {
  fps: 10,
  // A fixed px box overflows small phone viewports and gets silently cropped.
  qrbox: (w: number, h: number) => {
    const side = Math.floor(Math.min(w, h) * 0.75);
    return { width: side, height: side };
  },
  // Reuse the previously granted camera instead of re-enumerating devices.
  rememberLastUsedCamera: true,
  supportedScanTypes: [0 as const], // QR only
  videoConstraints: { facingMode: 'environment' } as MediaTrackConstraints,
};

function serialise<T>(task: () => Promise<T>): Promise<T> {
  const next = queue.then(task, task);
  // Keep the chain alive even when a task rejects.
  queue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

export function startScanner(
  elementId: string,
  onSuccess: (decoded: string) => void,
  onFail: () => void,
): Promise<void> {
  return serialise(async () => {
    if (scanner) return; // already running — never stack a second getUserMedia
    const el = document.getElementById(elementId);
    if (!el) return;

    const instance = new Html5QrcodeScanner(elementId, config, false);
    // Assign before render so a concurrent stop() has something to clear.
    scanner = instance;
    try {
      instance.render(onSuccess, onFail);
    } catch (err) {
      scanner = null;
      throw err;
    }
  });
}

/** Idempotent teardown. Safe to call when nothing is running. */
export function stopScanner(): Promise<void> {
  return serialise(async () => {
    const instance = scanner;
    scanner = null;
    if (!instance) return;
    try {
      await instance.clear();
    } catch {
      // clear() rejects only when the underlying camera refuses to stop; the
      // stream is gone either way.
    }
  });
}

/**
 * Hide the preview when the tab is backgrounded. This releases the camera
 * light and battery without discarding the granted permission — unlike a full
 * stop/render cycle, which makes the browser ask again.
 */
export function pauseScanner(): void {
  const instance = scanner;
  if (!instance) return;
  try {
    if (instance.getState() === Html5QrcodeScannerState.SCANNING) instance.pause(true);
  } catch {
    // Not running yet, or already torn down.
  }
}

export function resumeScanner(): void {
  const instance = scanner;
  if (!instance) return;
  try {
    if (instance.getState() === Html5QrcodeScannerState.PAUSED) instance.resume();
  } catch {
    // Nothing to resume.
  }
}