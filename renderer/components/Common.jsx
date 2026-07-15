// =============================================================================
// renderer/components/Common.jsx — مكوّنات واجهة مشتركة
// Spinner, EmptyState, Modal, Toast provider, StatusBadge — all RTL/Cairo.
// =============================================================================

import React, { createContext, useContext, useState, useCallback } from 'react';
import { statusClass, statusLabel } from '../lib/format.js';

export function Spinner({ label = 'جارٍ التحميل...' }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-slate-500">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-sky-500" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ icon = '📭', title = 'لا توجد بيانات', hint }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center text-slate-400">
      <div className="mb-2 text-4xl">{icon}</div>
      <div className="text-lg font-medium text-slate-500">{title}</div>
      {hint && <div className="mt-1 text-sm">{hint}</div>}
    </div>
  );
}

export function StatusBadge({ status }) {
  return <span className={`badge ${statusClass(status)}`}>{statusLabel(status)}</span>;
}

export function Modal({ open, title, children, onClose, size = 'md' }) {
  if (!open) return null;
  const width = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl' }[size] || 'max-w-2xl';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className={`w-full ${width} max-h-[90vh] overflow-auto rounded-xl bg-white shadow-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button className="btn-ghost !px-2 !py-1" onClick={onClose} aria-label="إغلاق">
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ---- Toast -----------------------------------------------------------------
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  // push(message, type, opts?) — opts.action = { label, onClick } renders a
  // button inside the toast (e.g. "طباعة الآن؟"); opts.duration overrides ms.
  const push = useCallback((message, type = 'info', opts = {}) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const action = opts.action || null;
    setToasts((t) => [...t, { id, message, type, action }]);
    const duration = opts.duration || (action ? 8000 : 4000);
    setTimeout(() => dismiss(id), duration);
  }, [dismiss]);

  const colors = {
    info: 'bg-slate-800',
    success: 'bg-emerald-600',
    error: 'bg-rose-600',
    warn: 'bg-amber-600',
  };

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 left-4 z-[60] flex flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className={`flex items-center gap-3 rounded-lg px-4 py-2 text-sm text-white shadow-lg ${colors[t.type] || colors.info}`}>
            <span>{t.message}</span>
            {t.action && (
              <button
                className="rounded bg-white/20 px-2 py-1 text-xs font-semibold hover:bg-white/30"
                onClick={() => { t.action.onClick(); dismiss(t.id); }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
