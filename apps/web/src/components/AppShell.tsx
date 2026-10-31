import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Home,
  Info,
  LogOut,
  Menu,
  Moon,
  RotateCcw,
  Search,
  Settings as SettingsIcon,
  Sun,
  XCircle,
} from 'lucide-react';
import { useStore, invoiceDisplayStatus, daysUntil } from '../lib/store';
import { homeForRole } from '../lib/routes';
import { relativeTime } from '../lib/format';
import { navForRole, roleLabel } from './nav';
import { Avatar, IconButton, StatusPill } from './ui';
import { LoopMark } from './brand';
import { CommandPalette } from './CommandPalette';
import { ChatWidget } from './ChatWidget';

export function AppShell() {
  const { state, logout, setTheme, markNotificationsRead, openChat, resetDemo, login } = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  const session = state.session;
  const role = session?.role ?? 'admin';
  const groups = useMemo(() => navForRole(role), [role]);

  const badges = useMemo(
    () => ({
      overdue: state.invoices.filter((invoice) => invoiceDisplayStatus(invoice) === 'Overdue').length,
      questions: state.questions.filter((question) => question.status === 'open').length,
      renewals: state.subscriptions.filter(
        (subscription) =>
          subscription.status === 'Active' &&
          ((subscription.expiry_date && (daysUntil(subscription.expiry_date) ?? 99) <= 14) ||
            (subscription.next_billing_date && (daysUntil(subscription.next_billing_date) ?? 99) <= 14)),
      ).length,
    }),
    [state.invoices, state.questions, state.subscriptions],
  );

  const current = useMemo(() => {
    const items = groups.flatMap((group) => group.items.map((item) => ({ ...item, group: group.label })));
    return (
      items.find((item) => (item.end ? location.pathname === item.to : location.pathname.startsWith(item.to))) ??
      items[0]
    );
  }, [groups, location.pathname]);

  const unread = state.notifications.filter((item) => !item.read).length;

  useEffect(() => {
    setNavOpen(false);
    setNotifOpen(false);
    setUserOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCmdOpen((open) => !open);
      }
      if (event.key === 'Escape') setCmdOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!notifOpen && !userOpen) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (notifOpen && !notifRef.current?.contains(target)) setNotifOpen(false);
      if (userOpen && !userRef.current?.contains(target)) setUserOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [notifOpen, userOpen]);

  if (!session) return null;

  const home = homeForRole(role);

  const switchRole = (next: 'admin' | 'staff' | 'customer') => {
    login(next);
    navigate(homeForRole(next));
    setUserOpen(false);
  };

  return (
    <div className={`shell ${navOpen ? 'nav-open' : ''}`}>
      <aside className="sidebar" aria-label="Primary navigation">
        <Link to={home} className="brand">
          <span className="brand-mark">
            <LoopMark />
          </span>
          <span className="brand-name">
            Brightloop
            <small>Subscription operations</small>
          </span>
        </Link>

        <nav className="sidebar-nav">
          {groups.map((group) => (
            <div className="nav-group" key={group.label}>
              <div className="nav-label">{group.label}</div>
              {group.items.map((item) => {
                const Icon = item.icon;
                const count = item.badge ? badges[item.badge] : 0;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                  >
                    <Icon aria-hidden="true" />
                    <span>{item.label}</span>
                    {item.badge && count > 0 ? (
                      <span className={`nav-badge ${item.badge === 'overdue' ? 'bad' : ''}`}>{count}</span>
                    ) : null}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="help-card">
            <span className="help-icon">
              <CircleHelp aria-hidden="true" />
            </span>
            <div>
              <strong>Need a hand?</strong>
              <span>Answers come from our support articles.</span>
              <button type="button" onClick={openChat}>
                Ask the assistant
              </button>
            </div>
          </div>
        </div>
      </aside>

      <div className="nav-scrim" onClick={() => setNavOpen(false)} aria-hidden="true" />

      <div className="main">
        <header className="topbar">
          <IconButton
            className="mobile-menu-btn"
            icon={Menu}
            label="Open navigation"
            onClick={() => setNavOpen(true)}
          />
          <div className="crumb">
            <Home aria-hidden="true" />
            <ChevronRight aria-hidden="true" />
            <span>{current?.group ?? 'Workspace'}</span>
            <ChevronRight aria-hidden="true" />
            <strong>{current?.label ?? 'Brightloop'}</strong>
          </div>

          <button type="button" className="topbar-search" onClick={() => setCmdOpen(true)}>
            <Search aria-hidden="true" />
            <span className="placeholder">Search Brightloop</span>
            <span className="kbd">⌘K</span>
          </button>

          <div className="topbar-actions">
            <IconButton
              icon={state.theme === 'light' ? Moon : Sun}
              label={state.theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
              onClick={() => setTheme(state.theme === 'light' ? 'dark' : 'light')}
            />
            <div className="notif-wrap" ref={notifRef}>
              <IconButton
                className="notif-btn"
                icon={Bell}
                label={`Notifications${unread ? ` (${unread} unread)` : ''}`}
                onClick={() => {
                  setNotifOpen((open) => !open);
                  setUserOpen(false);
                }}
              />
              {unread > 0 ? <span className="notif-dot" aria-hidden="true" /> : null}
              {notifOpen ? (
                <div className="notif-menu">
                  <div className="notif-head">
                    <span>Notifications</span>
                    <button type="button" className="btn-link" onClick={markNotificationsRead}>
                      Mark all read
                    </button>
                  </div>
                  <div className="notif-list">
                    {state.notifications.length === 0 ? (
                      <div className="cmd-empty">You are all caught up.</div>
                    ) : (
                      state.notifications.slice(0, 7).map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={`notif-item ${item.read ? '' : 'unread'}`}
                          onClick={markNotificationsRead}
                        >
                          <span className={`notif-icon ${item.tone}`}>
                            {item.tone === 'good' ? (
                              <CheckCircle2 aria-hidden="true" />
                            ) : item.tone === 'warn' ? (
                              <AlertTriangle aria-hidden="true" />
                            ) : item.tone === 'danger' ? (
                              <XCircle aria-hidden="true" />
                            ) : (
                              <Info aria-hidden="true" />
                            )}
                          </span>
                          <span className="notif-text">
                            <strong>{item.title}</strong>
                            <span>{item.detail}</span>
                          </span>
                          <span className="notif-time">{relativeTime(item.time)}</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            <span className="topbar-sep" aria-hidden="true" />

            <div className="notif-wrap" ref={userRef}>
              <button
                type="button"
                className="user-btn"
                onClick={() => {
                  setUserOpen((open) => !open);
                  setNotifOpen(false);
                }}
                aria-expanded={userOpen}
                aria-haspopup="menu"
              >
                <Avatar name={session.name} size="sm" />
                <span className="user-meta">
                  <strong>{session.name}</strong>
                  <span>
                    {roleLabel[role]} · {session.title}
                  </span>
                </span>
                <ChevronDown aria-hidden="true" />
              </button>
              {userOpen ? (
                <div className="user-menu" role="menu">
                  <div className="menu-head">
                    <strong style={{ display: 'block', color: 'var(--ink)', fontSize: 13 }}>{session.name}</strong>
                    <span style={{ fontWeight: 400 }}>{session.email}</span>
                  </div>
                  <div style={{ padding: '2px 10px 8px' }}>
                    <StatusPill status={roleLabel[role]} tone="info" dot={false} />
                  </div>
                  <div className="menu-sep" />
                  <button
                    type="button"
                    className="menu-item"
                    onClick={() => {
                      navigate(role === 'customer' ? '/portal/account' : '/settings');
                      setUserOpen(false);
                    }}
                  >
                    <SettingsIcon aria-hidden="true" />
                    {role === 'customer' ? 'Account settings' : 'Workspace settings'}
                  </button>
                  <div className="menu-sep" />
                  <div className="menu-head">Switch demo role</div>
                  {(['admin', 'staff', 'customer'] as const).map((next) => (
                    <button
                      key={next}
                      type="button"
                      className="menu-item"
                      disabled={next === role}
                      onClick={() => switchRole(next)}
                      style={next === role ? { opacity: 0.45 } : undefined}
                    >
                      <Avatar name={next === 'admin' ? 'Aarav Shah' : next === 'staff' ? 'Diya Raman' : 'Priya Menon'} size="sm" />
                      {roleLabel[next]}
                      {next === role ? <span className="cmd-sub">Current</span> : null}
                    </button>
                  ))}
                  <div className="menu-sep" />
                  <button
                    type="button"
                    className="menu-item"
                    onClick={() => {
                      if (window.confirm('Reset all demo data? This clears local changes in this browser.')) {
                        resetDemo();
                        setUserOpen(false);
                      }
                    }}
                  >
                    <RotateCcw aria-hidden="true" />
                    Reset demo data
                  </button>
                  <button
                    type="button"
                    className="menu-item danger"
                    onClick={() => {
                      logout();
                      navigate('/login');
                    }}
                  >
                    <LogOut aria-hidden="true" />
                    Sign out
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <Outlet />
      </div>

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
      <ChatWidget />
    </div>
  );
}
