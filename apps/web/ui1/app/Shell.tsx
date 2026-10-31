import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BadgePercent, BookOpen, CreditCard, FileText, Layers, LayoutDashboard,
  LogOut, Moon, Package, Package2, RefreshCw, Sun, Users,
} from 'lucide-react';
import { Logo } from '../ui/Logo';
import { useAuth } from './AuthContext';
import type { Role } from './AuthContext';
import { SupportChat } from '../live/Support';

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
      { to: '/renewals', label: 'Renewals', icon: RefreshCw, roles: ['admin', 'staff'] },
    ],
  },
  {
    section: 'Catalog',
    items: [
      { to: '/catalog', label: 'Products & plans', icon: Package, roles: ['admin', 'staff'] },
      { to: '/plans-templates', label: 'Plans & templates', icon: Layers, roles: ['admin', 'staff'] },
      { to: '/discounts', label: 'Discounts', icon: BadgePercent, roles: ['admin'] },
      { to: '/users', label: 'Users', icon: Users, roles: ['admin'] },
    ],
  },
  {
    section: 'Support',
    items: [{ to: '/support-content', label: 'Support knowledge', icon: BookOpen, roles: ['admin', 'staff'] }],
  },
  {
    section: 'Portal',
    items: [
      { to: '/portal', label: 'My subscriptions', icon: Package2, roles: ['customer'] },
      { to: '/portal/invoices', label: 'My invoices', icon: FileText, roles: ['customer'] },
    ],
  },
];

export function Shell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
  );
  const role = (user?.role ?? 'staff') as Role;
  const isCustomer = role === 'customer';

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  if (!user) return null;

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
                      aria-label={item.label}
                      title={item.label}
                      className={({ isActive }) => `navitem${isActive ? ' is-active' : ''}`}
                    >
                      <span className="navitem__icon"><Icon size={18} strokeWidth={1.75} /></span>
                      <span className="sr-only">{item.label}</span>
                    </NavLink>
                  );
                })}
            </div>
          ))}
        </nav>
        <span className="sidebar-footnote">Live account</span>
      </aside>

      <div className="shell__main">
        <header className="topbar">
          <div className="topbar-context">{isCustomer ? 'Customer portal' : 'Subscription operations'}</div>
          <div className="topbar__right">
            <button
              className="iconbtn"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            <div className="menu-activewrap">
              <button className="userchip" onClick={() => setMenuOpen((v) => !v)} aria-haspopup="menu">
                <span className="avatar">{(user.name ?? user.email).slice(0, 1).toUpperCase()}</span>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{(user.name ?? user.email).split(' ')[0]}</span>
                <span className="caption" style={{ textTransform: 'capitalize' }}>{role}</span>
              </button>
              {menuOpen && (
                <div className="menu" role="menu">
                  <div className="menu__item" style={{ cursor: 'default' }}>
                    <span style={{ minWidth: 0 }}>
                      <strong style={{ fontWeight: 600 }}>{user.name ?? user.email}</strong>
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
        <SupportChat />
      </div>
    </div>
  );
}
