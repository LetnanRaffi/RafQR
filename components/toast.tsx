'use client';

import { useEffect, useRef, useState } from 'react';

type ToastType = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

const listeners = new Set<(items: ToastItem[]) => void>();
let items: ToastItem[] = [];
let counter = 0;

function emit() {
  listeners.forEach((l) => l([...items]));
}

/**
 * Only for failures that have no element of their own (PRD §7.3).
 * Copy/save feedback is inline — see `<Copied>` in components/ui.tsx.
 */
export function toast(message: string, type: ToastType = 'info', duration = 4000) {
  const id = ++counter;
  items.push({ id, message, type });
  emit();
  setTimeout(() => {
    items = items.filter((t) => t.id !== id);
    emit();
  }, duration);
}

export function ToastHost() {
  const [list, setList] = useState<ToastItem[]>([]);

  useEffect(() => {
    const listener = (next: ToastItem[]) => setList(next);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return (
    <div className="toast-host" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} role={t.type === 'error' ? 'alert' : 'status'} className={`toast ${t.type}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}