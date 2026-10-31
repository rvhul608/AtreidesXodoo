import { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { CheckCircle2, CircleAlert } from 'lucide-react';

export type ToastFn = (text: string, tone?: 'ok' | 'warn') => void;

interface ToastState {
  id: number;
  text: string;
  tone: 'ok' | 'warn';
}

const ToastContext = createContext<ToastFn>(() => undefined);

export function useToast() {
  return useContext(ToastContext);
}

/** Bottom-left toasts, 4s, stating exactly what changed. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastState[]>([]);
  const idRef = useRef(1);

  const toast = useCallback<ToastFn>((text, tone = 'ok') => {
    const id = idRef.current++;
    setItems((prev) => [...prev.slice(-3), { id, text, tone }]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-stack" role="status">
        {items.map((t) => (
          <div key={t.id} className="toast">
            {t.tone === 'ok' ? (
              <CheckCircle2 size={18} aria-hidden="true" />
            ) : (
              <CircleAlert size={18} aria-hidden="true" />
            )}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
