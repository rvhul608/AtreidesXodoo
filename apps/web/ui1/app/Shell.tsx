import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell, BookOpen, CreditCard, FileText, Layers, LayoutDashboard,
  LogOut, Moon, Package, Package2, Percent, Search, Sun, Users,
} from 'lucide-react';
import { Logo } from '../ui/Logo';
import { Pill } from '../ui/Pill';
import { useAuth } from './AuthContext';
import type { Role } from '../mock/data';

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles: Role[];
}

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: 'Overview',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'staff'] },
    ],
  },
  {
    section: 'Day to day',
    items: [
      { to: '/subscriptions', label: 'Subscriptions', icon: Layers, roles: ['admin', 'staff'] },
      { to: '/invoices', label: 'Invoices', icon: FileText, roles: ['admin', 'staff'] },
      { to: '/payments', label: 'Payments', icon: CreditCard, roles: ['admin', 'staff'] },
    ],
  },
  {
    section: 'Catalog',
    items: [
      { to: '/catalog', label: 'Products & plans', icon: Package, roles: ['admin', 'staff'] },
      { to: '/discounts', label: 'Discounts', icon: Percent, roles: ['admin'] },
    ],
  },
  {
    section: 'Support',
    items: [
      { to: '/support-content', label: 'Support content', icon: BookOpen, roles: ['admin', 'staff'] },
    ],
  },
  {
    section: 'Admin',
    items: [
      { to: '/users', label: 'Staff', icon: Users, roles: ['admin'] },
    ],
  },
  {
    section: 'Portal',
    items: [
      { to: '/portal', label: 'My subscriptions', icon: Package2, roles: ['customer'] },
      { to: '/portal/invoices', label: 'My invoices', icon: FileText, roles: ['customer'] },
    ],
  },
];

interface LiveEvent {
  id: number;
  text: string;
  time: string;
  tone: Parameters<typeof Pill>[0]['tone'];
  label: string;
}

const START_EVENTS: LiveEvent[] = [
  { id: 1, text: 'Invoice INV-1043 sent to Nimbus Retail.', time: '09:12', tone: 'info', label: 'Sent' },
  { id: 2, text: 'Payment PAY-0845 recorded on INV-1041.', time: '09:31', tone: 'good', label: 'Paid' },
];

const LATER_EVENT: LiveEvent = {
  id: 3,
  text: 'Invoice INV-1040 went overdue — Kettle & Co.',
  time: '10:02',
  tone: 'bad',
  label: 'Overdue',
};

export function Shell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [events, setEvents] = useState<LiveEvent[]>(START_EVENTS);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const seenRef = useRef(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
  );
  const role = (user?.role ?? 'staff') as Role;
  const isCustomer = role === 'customer';

  /* Simulated live event stream (SSE in production) so counters and
     lists visibly update without a refresh. */
  useEffect(() => {
    if (seenRef.current) return;
    seenRef.current = true;
    const id = window.setTimeout(() => setEvents((prev) => [...prev, LATER_EVENT]), 9000);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    setMenuOpen(false);
    setNotifOpen(false);
  }, [location.pathname]);

  if (!user) return null;
  const unread = events.length - 2;

  return (
    <div className="shell">
      <aside className="sidebar">
        <Link to={'/' } style={{ textDecoration: 'none', color: 'inherit' }} aria-label="Brightloop home">
          <Logo />
        </Link>
        <nav className="sidebar__nav" aria-label="Main navigation">
          {NAV.filter((s) => s.items.some((i) => i.roles.includes(role))).map((section) => (
            <div key={section.section}>
              <div className="sidebar__section">{section.section}</div>
              {section.items
                .filter((i) => i.roles.includes(role))
                .map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={({ isActive }) => `navitem${isActive ? ' is-active' : ''}`}
                    >
                      <span className="navitem__icon"><Icon size={18} strokeWidth={1.75} /></span>
                      {item.label}
                    </NavLink>
                  );
                })}
            </div>
          ))}
        </nav>
        <span className="caption">Brightloop · demo build</span>
      </aside>

      <div className="shell__main">
        <header className="topbar">
          {!isCustomer && (
            <div className="topbar__search">
              <Search size={16} />
              <input
                className="field__input"
                placeholder="Search customers, invoices…"
                aria-label="Search"
              />
            </div>
          )}
          {isCustomer && (
            <a href="/portal" onClick={(e) => e.preventDefault()} style={{ color: 'inherit' }}>
              <Logo />
            </a>
          )}
          <div className="topbar__right">
            <button
              className="iconbtn"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            <div className="menu-activewrap">
              <button
                className="iconbtn notif-btn"
                onClick={() => setNotifOpen((v) => !v)}
                aria-label={`Notifications, ${events.length} events`}
              >
                <Bell size={18} />
                {unread > 0 && <span className="dot" aria-hidden="true" />}
              </button>
              {notifOpen && (
                <div className="menu" style={{ minWidth: 320 }}>
                  <div className="caption" style={{ padding: '8px 10px' }}>Live updates</div>
                  {events.slice(-4).reverse().map((ev) => (
                    <div key={ev.id} className="menu__item" style={{ cursor: 'default' }}>
                      <span style={{ minWidth: 0 }}>{ev.text}</span>
                      <Pill tone={ev.tone}>{ev.label}</Pill>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="menu-activewrap">
              <button className="userchip" onClick={() => setMenuOpen((v) => !v)} aria-haspopup="menu">
                <span className="avatar">{user.name.slice(0, 1)}</span>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{user.name.split(' ')[0]}</span>
                <span className="caption" style={{ textTransform: 'capitalize' }}>{role}</span>
              </button>
              {menuOpen && (
                <div className="menu" role="menu">
                  <div className="menu__item" style={{ cursor: 'default' }}>
                    <span style={{ minWidth: 0 }}>
                      <strong style={{ fontWeight: 600 }}>{user.name}</strong>
                      <div className="caption">{user.email}</div>
                    </span>
                  </div>
                  <button
                    className="menu__item"
                    onClick={() => {
                      logout();
                      navigate('/login');
                    }}
                  >
                    <span>Log out</span>
                    <LogOut size={16} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="shell__content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
