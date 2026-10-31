import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Info,
  Search,
  X,
  type LucideIcon,
} from 'lucide-react';
import { initials } from '../lib/format';

/* ---------- Button ---------- */
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  block?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  icon: Icon,
  iconRight: IconRight,
  block,
  className = '',
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = [
    'btn',
    variant !== 'primary' ? `btn-${variant}` : '',
    size !== 'md' ? `btn-${size}` : '',
    block ? 'btn-block' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button type={type} className={classes} {...rest}>
      {Icon ? <Icon aria-hidden="true" /> : null}
      {children}
      {IconRight ? <IconRight aria-hidden="true" /> : null}
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  label: string;
  size?: 'sm' | 'md';
  active?: boolean;
}

export function IconButton({ icon: Icon, label, size = 'md', active, className = '', ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      className={`icon-btn ${size === 'sm' ? 'sm' : ''} ${active ? 'active' : ''} ${className}`}
      aria-label={label}
      title={label}
      {...rest}
    >
      <Icon aria-hidden="true" />
    </button>
  );
}

/* ---------- Form ---------- */
export function Field({
  label,
  hint,
  error,
  optional,
  htmlFor,
  children,
  className = '',
}: {
  label: string;
  hint?: string;
  error?: string | null;
  optional?: boolean;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`field ${error ? 'invalid' : ''} ${className}`}>
      <label className="label" htmlFor={htmlFor}>
        {label}
        {optional ? <span className="optional"> (optional)</span> : null}
      </label>
      {children}
      {error ? (
        <span className="error-text">
          <AlertCircle aria-hidden="true" />
          {error}
        </span>
      ) : hint ? (
        <span className="hint">{hint}</span>
      ) : null}
    </div>
  );
}

export function Input({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`input ${className}`} {...rest} />;
}

export function Textarea({ className = '', ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`textarea ${className}`} {...rest} />;
}

export function Select({ className = '', children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`select ${className}`} {...rest}>
      {children}
    </select>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search',
  className = '',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={`input-icon ${className}`}>
      <Search aria-hidden="true" />
      <input
        className="input"
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <label className="switch" aria-disabled={disabled}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
      />
      <span className="track" />
      {label ? <span>{label}</span> : null}
    </label>
  );
}

export function PasswordRule({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <span className={`checkline ${ok ? 'ok' : 'pending'}`}>
      {ok ? <Check aria-hidden="true" /> : <span style={{ width: 15, height: 15 }} />}
      {children}
    </span>
  );
}

/* ---------- Status pill ---------- */
const toneByStatus: Record<string, 'good' | 'warn' | 'bad' | 'info' | 'neutral'> = {
  Active: 'good',
  Paid: 'good',
  Received: 'good',
  Sent: 'good',
  Resolved: 'good',
  Succeeded: 'good',
  Recovered: 'good',
  'Due soon': 'warn',
  Paused: 'warn',
  Queued: 'warn',
  'In progress': 'warn',
  Running: 'info',
  Quotation: 'info',
  Confirmed: 'info',
  Open: 'info',
  Draft: 'neutral',
  Closed: 'neutral',
  Ignored: 'neutral',
  Overdue: 'bad',
  Failed: 'bad',
  Reversed: 'bad',
  Cancelled: 'bad',
};

export function StatusPill({
  status,
  label,
  tone,
  dot = true,
  className = '',
}: {
  status?: string;
  label?: string;
  tone?: 'good' | 'warn' | 'bad' | 'info' | 'neutral';
  dot?: boolean;
  className?: string;
}) {
  const key = status ?? label ?? 'Draft';
  const resolved = tone ?? toneByStatus[key] ?? 'neutral';
  return (
    <span className={`pill ${resolved} ${className}`}>
      {dot ? <span className="dot" aria-hidden="true" /> : null}
      {label ?? key}
    </span>
  );
}

/* ---------- Avatar ---------- */
export function Avatar({
  name,
  size = 'md',
  muted,
}: {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  muted?: boolean;
}) {
  return (
    <span className={`avatar ${size === 'lg' ? 'lg' : size === 'sm' ? 'sm' : ''} ${muted ? 'muted' : ''}`} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

/* ---------- Empty state ---------- */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon aria-hidden="true" />
      </span>
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
      {action}
    </div>
  );
}

/* ---------- Tabs ---------- */
export function Tabs({
  tabs,
  value,
  onChange,
}: {
  tabs: Array<{ value: string; label: string; count?: number }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          role="tab"
          className="tab"
          aria-selected={value === tab.value}
          onClick={() => onChange(tab.value)}
        >
          {tab.label}
          {tab.count !== undefined ? <span className="count">{tab.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

/* ---------- Pagination ---------- */
export function Pagination({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  return (
    <div className="table-foot">
      <span>
        {start}–{end} of {total}
      </span>
      <div className="pagination">
        <button type="button" onClick={() => onChange(page - 1)} disabled={page <= 1} aria-label="Previous page">
          <ChevronLeft aria-hidden="true" />
        </button>
        {Array.from({ length: Math.min(pages, 5) }, (_, index) => {
          const target = pages <= 5 ? index + 1 : Math.min(Math.max(1, page - 2), pages - 4) + index;
          return (
            <button
              key={target}
              type="button"
              aria-current={target === page ? 'page' : undefined}
              onClick={() => onChange(target)}
            >
              {target}
            </button>
          );
        })}
        <button type="button" onClick={() => onChange(page + 1)} disabled={page >= pages} aria-label="Next page">
          <ChevronRight aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/* ---------- Modal ---------- */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          <IconButton icon={X} label="Close" onClick={onClose} />
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="drawer-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="drawer" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          <IconButton icon={X} label="Close" onClick={onClose} />
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

/* ---------- Toasts ---------- */
type ToastTone = 'good' | 'bad' | 'info';
interface ToastItem {
  id: number;
  title: string;
  description?: string;
  tone: ToastTone;
}

interface ToastContextValue {
  push: (toast: { title: string; description?: string; tone?: ToastTone }) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const push = useCallback((toast: { title: string; description?: string; tone?: ToastTone }) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((current) => [...current, { id, tone: 'good', ...toast }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 4000);
  }, []);

  const remove = (id: number) => setToasts((current) => current.filter((item) => item.id !== id));
  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className="toast" role="status">
            <span className={`toast-icon ${toast.tone}`}>
              {toast.tone === 'bad' ? (
                <AlertCircle aria-hidden="true" />
              ) : toast.tone === 'info' ? (
                <Info aria-hidden="true" />
              ) : (
                <CheckCircle2 aria-hidden="true" />
              )}
            </span>
            <div>
              <strong>{toast.title}</strong>
              {toast.description ? <p>{toast.description}</p> : null}
            </div>
            <button type="button" className="toast-close" onClick={() => remove(toast.id)} aria-label="Dismiss">
              <X size={13} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast must be used inside ToastProvider');
  return value;
}
