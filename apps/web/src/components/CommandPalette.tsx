import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Building2,
  FileText,
  LogOut,
  Moon,
  RefreshCw,
  Repeat2,
  Search,
  Sparkles,
  Sun,
  type LucideIcon,
} from 'lucide-react';
import { useStore, customerName } from '../lib/store';
import { homeForRole } from '../lib/routes';
import { navForRole } from './nav';

interface Result {
  id: string;
  group: string;
  label: string;
  sub?: string;
  icon: LucideIcon;
  run: () => void;
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, login, logout, toggleTheme, openChat } = useStore();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const role = state.session?.role ?? 'admin';

  const results = useMemo<Result[]>(() => {
    if (!state.session) return [];
    const term = query.trim().toLowerCase();
    const out: Result[] = [];
    const match = (...values: Array<string | number | null | undefined>) =>
      !term || values.some((value) => String(value ?? '').toLowerCase().includes(term));

    for (const group of navForRole(role)) {
      for (const item of group.items) {
        if (!match(item.label, group.label)) continue;
        out.push({
          id: `nav-${item.to}`,
          group: group.label,
          label: item.label,
          sub: group.label,
          icon: item.icon,
          run: () => navigate(item.to),
        });
      }
    }

    if (role !== 'customer') {
      for (const customer of state.customers) {
        if (!match(customer.legal_name, customer.contact, customer.email)) continue;
        out.push({
          id: `customer-${customer.id}`,
          group: 'Customers',
          label: customer.legal_name,
          sub: `${customer.contact} · ${customer.city}`,
          icon: Building2,
          run: () => navigate(`/subscriptions?customer=${customer.id}`),
        });
      }
      for (const subscription of state.subscriptions) {
        if (!match(subscription.subscription_number, customerName(state, subscription.customerId))) continue;
        out.push({
          id: `sub-${subscription.id}`,
          group: 'Subscriptions',
          label: subscription.subscription_number,
          sub: `${customerName(state, subscription.customerId)} · ${subscription.status}`,
          icon: RefreshCw,
          run: () => navigate(`/subscriptions/${subscription.id}`),
        });
      }
      for (const invoice of state.invoices) {
        if (!match(invoice.invoice_number, customerName(state, invoice.customerId))) continue;
        out.push({
          id: `invoice-${invoice.id}`,
          group: 'Invoices',
          label: invoice.invoice_number,
          sub: `${customerName(state, invoice.customerId)} · ${invoice.status}`,
          icon: FileText,
          run: () => navigate(`/invoices/${invoice.id}`),
        });
      }
    } else {
      const customerId = state.session.customerId;
      for (const subscription of state.subscriptions.filter((item) => item.customerId === customerId)) {
        if (!match(subscription.subscription_number, subscription.status)) continue;
        out.push({
          id: `psub-${subscription.id}`,
          group: 'My subscriptions',
          label: subscription.subscription_number,
          sub: subscription.status,
          icon: RefreshCw,
          run: () => navigate('/portal/subscriptions'),
        });
      }
      for (const invoice of state.invoices.filter((item) => item.customerId === customerId)) {
        if (!match(invoice.invoice_number, invoice.status)) continue;
        out.push({
          id: `pinvoice-${invoice.id}`,
          group: 'My invoices',
          label: invoice.invoice_number,
          sub: `${invoice.status} · due ${invoice.due_date}`,
          icon: FileText,
          run: () => navigate(`/portal/invoices/${invoice.id}`),
        });
      }
    }

    if (match('support assistant chat ask brightloop')) {
      out.push({
        id: 'action-chat',
        group: 'Actions',
        label: 'Ask the support assistant',
        sub: 'Open the chatbot',
        icon: Sparkles,
        run: () => openChat(),
      });
    }
    if (match('theme dark light appearance')) {
      out.push({
        id: 'action-theme',
        group: 'Actions',
        label: `Switch to ${state.theme === 'light' ? 'dark' : 'light'} theme`,
        icon: state.theme === 'light' ? Moon : Sun,
        run: () => toggleTheme(),
      });
    }
    if (match('switch role demo admin staff customer')) {
      for (const next of ['admin', 'staff', 'customer'] as const) {
        if (next === role) continue;
        out.push({
          id: `role-${next}`,
          group: 'Demo',
          label: `Switch to ${next}`,
          sub: 'Demo role switch',
          icon: Repeat2,
          run: () => {
            login(next);
            navigate(homeForRole(next));
          },
        });
      }
    }
    if (match('sign out log out')) {
      out.push({
        id: 'action-logout',
        group: 'Actions',
        label: 'Sign out',
        icon: LogOut,
        run: () => {
          logout();
          navigate('/login');
        },
      });
    }

    return out.slice(0, 18);
  }, [query, role, state, navigate, openChat, toggleTheme, login, logout]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      window.setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    node?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const choose = (result: Result | undefined) => {
    if (!result) return;
    result.run();
    onClose();
  };

  return (
    <div
      className="cmd-overlay"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="Search Brightloop"
    >
      <div className="cmd">
        <div className="cmd-input">
          <Search aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            placeholder="Search pages, customers, invoices…"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') onClose();
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActive((current) => Math.min(results.length - 1, current + 1));
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActive((current) => Math.max(0, current - 1));
              }
              if (event.key === 'Enter') {
                event.preventDefault();
                choose(results[active]);
              }
            }}
            aria-label="Search"
          />
          <kbd>Esc</kbd>
        </div>
        <div className="cmd-results" ref={listRef}>
          {results.length === 0 ? (
            <div className="cmd-empty">No matches. Try a customer name, invoice number or page.</div>
          ) : (
            results.map((result, index) => {
              const Icon = result.icon;
              const showGroup = index === 0 || results[index - 1].group !== result.group;
              return (
                <div key={result.id}>
                  {showGroup ? <div className="cmd-group">{result.group}</div> : null}
                  <button
                    type="button"
                    className="cmd-item"
                    data-index={index}
                    data-active={index === active}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => choose(result)}
                  >
                    <Icon aria-hidden="true" />
                    <span>{result.label}</span>
                    {result.sub ? <span className="cmd-sub">{result.sub}</span> : null}
                    <ArrowRight aria-hidden="true" style={{ marginLeft: 'auto', opacity: 0.4 }} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
