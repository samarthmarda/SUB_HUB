// Reusable UI primitives + a small design-system layer (tokens come from index.css).
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { formatMoney } from '../lib/format';

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------
export function Button({ variant = 'primary', size = 'md', icon, loading, children, className = '', ...rest }) {
  const cls = ['btn', `btn-${variant}`, size !== 'md' ? `btn-${size}` : '', loading ? 'is-loading' : '', className].filter(Boolean).join(' ');
  return (
    <button className={cls} disabled={rest.disabled || loading} {...rest}>
      {!loading && icon && <span className="btn-icon" aria-hidden="true">{icon}</span>}
      <span>{children}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Card / Panel
// ---------------------------------------------------------------------------
export function Panel({ title, subtitle, action, children, className = '', bodyClassName = '' }) {
  return (
    <section className={`panel ${className}`}>
      {(title || action) && (
        <header className="panel-head">
          <div>
            {title && <h3 className="panel-title">{title}</h3>}
            {subtitle && <p className="panel-sub">{subtitle}</p>}
          </div>
          {action && <div className="panel-action">{action}</div>}
        </header>
      )}
      <div className={`panel-body ${bodyClassName}`}>{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Badge / status tone
// ---------------------------------------------------------------------------
const TONE = {
  success: ['Paid', 'Approved', 'Active', 'Renewed', 'Manually Marked Sent', 'Customer Responded', 'Completed'],
  warning: ['Partially Paid', 'Pending Approval', 'WhatsApp Clicked', 'Upcoming', 'Payment Pending', 'Pending'],
  danger: ['Unpaid', 'Expired', 'Rejected', 'Not Renewing', 'Cancelled'],
  neutral: ['Archived', 'No Subscription', 'None', 'Credit Balance'],
};
function toneFor(status) {
  if (!status) return 'neutral';
  for (const [tone, list] of Object.entries(TONE)) {
    if (list.some((s) => s.toLowerCase() === String(status).toLowerCase())) return tone;
  }
  return 'neutral';
}
export function Badge({ status, children }) {
  const label = children || status;
  return <span className={`badge badge-${toneFor(status)}`}>{label}</span>;
}

export function Money({ amount, symbol }) {
  return <span className="money">{formatMoney(amount, symbol)}</span>;
}

// ---------------------------------------------------------------------------
// Spinner / states
// ---------------------------------------------------------------------------
export function Spinner({ label }) {
  return (
    <div className="spinner-wrap">
      <span className="spinner" aria-hidden="true" />
      {label && <span className="spinner-label">{label}</span>}
    </div>
  );
}
export function EmptyState({ icon, title, hint, action }) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-icon" aria-hidden="true">{icon}</div>}
      <p className="empty-title">{title}</p>
      {hint && <p className="empty-hint">{hint}</p>}
      {action}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------
export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md' }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose && onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose && onClose(); }}>
      <div className={`modal modal-${size}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <div>
            <h2 className="modal-title">{title}</h2>
            {subtitle && <p className="modal-sub">{subtitle}</p>}
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form fields
// ---------------------------------------------------------------------------
export function Field({ label, required, error, hint, children, className = '' }) {
  return (
    <label className={`field ${className}`}>
      {label && <span className="field-label">{label}{required && <em className="req">*</em>}</span>}
      {children}
      {hint && !error && <span className="field-hint">{hint}</span>}
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}
export function TextInput(props) { return <input className="input" {...props} />; }
export function NumberInput(props) {
  return <input className="input" type="number" inputMode="decimal" step="0.01" {...props} />;
}
export function DateInput(props) { return <input className="input" type="date" {...props} />; }
export function Select({ children, ...props }) { return <select className="input select" {...props}>{children}</select>; }
export function Textarea(props) { return <textarea className="input textarea" rows={3} {...props} />; }

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------
const ToastCtx = createContext(null);
let toastId = 0;
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const remove = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const show = useCallback((message, type = 'success') => {
    const id = ++toastId;
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => remove(id), type === 'error' ? 6000 : 4000);
  }, [remove]);
  const value = useMemo(() => ({ show, success: (m) => show(m, 'success'), error: (m) => show(m, 'error'), info: (m) => show(m, 'info') }), [show]);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <span className="toast-icon">{t.type === 'error' ? '⚠' : t.type === 'info' ? 'ℹ' : '✓'}</span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export function useToast() { return useContext(ToastCtx); }

// ---------------------------------------------------------------------------
// Confirm dialog
// ---------------------------------------------------------------------------
export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', danger, loading }) {
  const toast = useToast();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={() => onConfirm()}>{confirmLabel}</Button>
        </>
      }
    >
      <p className="confirm-message">{message}</p>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Debounced value
// ---------------------------------------------------------------------------
export function useDebounced(value, delay = 350) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), delay); return () => clearTimeout(t); }, [value, delay]);
  return v;
}
