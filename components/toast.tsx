'use client';

import { useEffect, useState } from 'react';

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

export function toast(message: string, type: ToastType = 'info', duration = 3500) {
  const id = ++counter;
  items.push({ id, message, type });
  emit();
  setTimeout(() => {
    items = items.filter((t) => t.id !== id);
    emit();
  }, duration);
}

const STYLES: Record<ToastType, string> = {
  success: 'bg-ok text-white border-ink',
  error: 'bg-danger text-white border-ink',
  info: 'bg-white text-ink border-ink',
};

const ICONS: Record<ToastType, string> = {
  success: '✓',
  error: '!',
  info: 'i',
};

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
    <div className="fixed bottom-5 right-5 left-5 sm:left-auto z-[999] flex flex-col items-end gap-3 pointer-events-none">
      {list.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-center gap-3 border-2 rounded-md shadow-neo px-4 py-3 font-bold text-sm max-w-full animate-toast-in ${STYLES[t.type]}`}
        >
          <span className="w-6 h-6 shrink-0 border-2 border-ink rounded flex items-center justify-center text-xs font-bold bg-white text-ink">
            {ICONS[t.type]}
          </span>
          <span className="truncate">{t.message}</span>
        </div>
      ))}
    </div>
  );
}
