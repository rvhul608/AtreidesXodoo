import {
  Activity,
  BadgePercent,
  BookOpen,
  CalendarClock,
  ClipboardList,
  CreditCard,
  FileText,
  Layers,
  LayoutDashboard,
  Mail,
  Package,
  RefreshCw,
  Settings,
  TrendingDown,
  Users,
  History,
  LifeBuoy,
  ReceiptText,
  CircleUserRound,
} from 'lucide-react';
import type { Role } from '../lib/types';

export interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles: Role[];
  badge?: 'overdue' | 'questions' | 'renewals';
  end?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const navGroups: NavGroup[] = [
  {
    label: 'Workspace',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'staff'], end: true },
      { to: '/subscriptions', label: 'Subscriptions', icon: RefreshCw, roles: ['admin', 'staff'] },
      { to: '/invoices', label: 'Invoices', icon: FileText, roles: ['admin', 'staff'], badge: 'overdue' },
      { to: '/payments', label: 'Payments', icon: CreditCard, roles: ['admin', 'staff'] },
    ],
  },
  {
    label: 'Catalog',
    items: [
      { to: '/products', label: 'Products', icon: Package, roles: ['admin', 'staff'] },
      { to: '/plans', label: 'Plans', icon: Layers, roles: ['admin', 'staff'] },
      { to: '/templates', label: 'Templates', icon: ClipboardList, roles: ['admin', 'staff'] },
      { to: '/discounts', label: 'Discounts', icon: BadgePercent, roles: ['admin'] },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: '/renewals', label: 'Renewal queue', icon: CalendarClock, roles: ['admin', 'staff'], badge: 'renewals' },
      { to: '/leakage', label: 'Revenue leakage', icon: TrendingDown, roles: ['admin'] },
      { to: '/time-machine', label: 'Billing time machine', icon: History, roles: ['admin'] },
      { to: '/ops', label: 'Billing ops monitor', icon: Activity, roles: ['admin'] },
    ],
  },
  {
    label: 'Support',
    items: [
      { to: '/support', label: 'Support content', icon: BookOpen, roles: ['admin', 'staff'], badge: 'questions' },
      { to: '/tickets', label: 'Tickets', icon: LifeBuoy, roles: ['admin', 'staff'] },
    ],
  },
  {
    label: 'Admin',
    items: [
      { to: '/staff', label: 'Staff', icon: Users, roles: ['admin'] },
      { to: '/outbox', label: 'Outbox', icon: Mail, roles: ['admin'] },
      { to: '/settings', label: 'Settings', icon: Settings, roles: ['admin', 'staff'] },
    ],
  },
  {
    label: 'My account',
    items: [
      { to: '/portal', label: 'Overview', icon: LayoutDashboard, roles: ['customer'], end: true },
      { to: '/portal/subscriptions', label: 'My subscriptions', icon: RefreshCw, roles: ['customer'] },
      { to: '/portal/invoices', label: 'Invoices', icon: ReceiptText, roles: ['customer'] },
      { to: '/portal/account', label: 'Account', icon: CircleUserRound, roles: ['customer'] },
    ],
  },
];

export function navForRole(role: Role): NavGroup[] {
  return navGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => item.roles.includes(role)) }))
    .filter((group) => group.items.length > 0);
}

export const roleLabel: Record<Role, string> = {
  admin: 'Admin',
  staff: 'Staff',
  customer: 'Customer',
};

