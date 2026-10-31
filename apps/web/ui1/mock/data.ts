/* ============================================================
   Mock data — a development aid only. Shapes mirror
   docs/api-contract.md so screens switch to the real API
   without redesign. Switch off before the end (03-UI.md rule 1).
   Demo "today" is fixed for stable screenshots: 2026-10-31.
   ============================================================ */

export type Money = string;
export type Role = 'admin' | 'staff' | 'customer' | 'viewer';

export type SubStatus = 'draft' | 'quotation' | 'confirmed' | 'active' | 'paused' | 'closed';
export type InvoiceStatus = 'draft' | 'confirmed' | 'paid' | 'partially_paid' | 'overdue' | 'cancelled';
export type PayStatus = 'succeeded' | 'pending' | 'failed';
export type PayMethod = 'card' | 'upi' | 'bank_transfer' | 'cash';

export interface Subscription {
  id: number;
  ref: string;
  customer: string;
  plan: string;
  period: 'monthly' | 'quarterly' | 'yearly';
  status: SubStatus;
  start_date: string;
  next_bill: string | null;
  amount: Money;
  quantity: string;
  auto_renew: boolean;
  cycle_left: number;
  cycle_length: number;
}

export interface InvoiceLine {
  description: string;
  quantity: string;
  unit_price: Money;
}

export interface Invoice {
  id: number;
  ref: string;
  customer: string;
  sub_ref: string;
  issued_on: string;
  due_on: string;
  status: InvoiceStatus;
  subtotal: Money;
  tax_rate: string;
  discount: Money;
  total: Money;
  sent_on: string | null;
}

export interface Payment {
  id: number;
  ref: string;
  invoice_ref: string;
  customer: string;
  method: PayMethod;
  amount: Money;
  paid_on: string;
  status: PayStatus;
}

export interface Product {
  id: number;
  sku: string;
  name: string;
  category: string;
  description: string;
  price: Money;
  variants: { key: string; detail: string; add_on: Money }[];
}

export interface Plan {
  id: number;
  name: string;
  period: 'monthly' | 'quarterly' | 'yearly';
  price: Money;
  min_quantity: string;
  status: 'active' | 'draft';
  flags: { pause: boolean; renew: boolean; auto_close: boolean; early_close: boolean };
  available_from: string;
  available_to: string | null;
}

export interface TaxRule {
  id: number;
  jurisdiction: string;
  code: string;
  rate: string;
}

export interface Template {
  id: number;
  name: string;
  description: string;
  lines: { plan: string; quantity: string }[];
  validity_days: number;
}

export interface Discount {
  id: number;
  name: string;
  kind: 'percent' | 'fixed';
  value: Money;
  scope: string;
  min_quantity: string;
  valid_from: string;
  valid_to: string;
  usage_limit: number;
  used: number;
  status: 'active' | 'expiring' | 'expired';
}

export interface UserRow {
  id: number;
  name: string;
  email: string;
  role: Role;
  is_active: boolean;
  last_login: string;
}

export interface Article {
  id: number;
  title: string;
  category: 'Plan' | 'Billing' | 'Subscription management' | 'Payments';
  status: 'published' | 'draft';
  updated: string;
  used_by_bot: number;
  body: string;
}

export interface Unanswered {
  question: string;
  asks: number;
}

export const TODAY = '2026-10-31';

/* ---------------- Subscriptions ---------------- */

export const subscriptions: Subscription[] = [
  { id: 1, ref: 'SUB-0402', customer: 'Acme Works', plan: 'Pro', period: 'yearly', status: 'active', start_date: '2025-11-12', next_bill: '2026-11-12', amount: '120000.00', quantity: '10.00', auto_renew: true, cycle_left: 342, cycle_length: 365 },
  { id: 2, ref: 'SUB-0405', customer: 'Acme Works', plan: 'Loop Mail', period: 'monthly', status: 'active', start_date: '2026-10-12', next_bill: '2026-11-11', amount: '1560.00', quantity: '4.00', auto_renew: true, cycle_left: 11, cycle_length: 30 },
  { id: 3, ref: 'SUB-0412', customer: 'Nimbus Retail', plan: 'Pro', period: 'yearly', status: 'active', start_date: '2026-03-01', next_bill: '2027-02-28', amount: '84000.00', quantity: '7.00', auto_renew: true, cycle_left: 120, cycle_length: 365 },
  { id: 4, ref: 'SUB-0415', customer: 'Kettle & Co', plan: 'Starter', period: 'monthly', status: 'active', start_date: '2026-10-24', next_bill: '2026-11-23', amount: '780.00', quantity: '2.00', auto_renew: false, cycle_left: 23, cycle_length: 30 },
  { id: 5, ref: 'SUB-0418', customer: 'Meridian Labs', plan: 'Business', period: 'quarterly', status: 'active', start_date: '2026-09-15', next_bill: '2026-12-15', amount: '25200.00', quantity: '12.00', auto_renew: true, cycle_left: 45, cycle_length: 90 },
  { id: 6, ref: 'SUB-0421', customer: 'Harbour Point Cafe', plan: 'Starter', period: 'monthly', status: 'paused', start_date: '2026-08-01', next_bill: null, amount: '390.00', quantity: '1.00', auto_renew: false, cycle_left: 0, cycle_length: 30 },
  { id: 7, ref: 'SUB-0424', customer: 'Nimbus Retail', plan: 'Loop Storage', period: 'monthly', status: 'active', start_date: '2026-10-20', next_bill: '2026-11-19', amount: '1180.00', quantity: '3.00', auto_renew: true, cycle_left: 19, cycle_length: 30 },
  { id: 8, ref: 'SUB-0427', customer: 'Fern & Field', plan: 'Pro', period: 'monthly', status: 'quotation', start_date: TODAY, next_bill: null, amount: '2340.00', quantity: '2.00', auto_renew: false, cycle_left: 0, cycle_length: 30 },
  { id: 9, ref: 'SUB-0430', customer: 'Cobalt Studio', plan: 'Business', period: 'yearly', status: 'confirmed', start_date: '2026-11-01', next_bill: '2027-11-01', amount: '100800.00', quantity: '12.00', auto_renew: true, cycle_left: 365, cycle_length: 365 },
  { id: 10, ref: 'SUB-0433', customer: 'Vellum Press', plan: 'Loop Mail', period: 'monthly', status: 'active', start_date: '2026-10-28', next_bill: '2026-11-27', amount: '1170.00', quantity: '3.00', auto_renew: true, cycle_left: 27, cycle_length: 30 },
  { id: 11, ref: 'SUB-0436', customer: 'Acme Works', plan: 'Loop Storage', period: 'monthly', status: 'active', start_date: '2026-10-30', next_bill: '2026-11-29', amount: '1180.00', quantity: '3.00', auto_renew: true, cycle_left: 29, cycle_length: 30 },
  { id: 12, ref: 'SUB-0401', customer: 'Oldline Traders', plan: 'Starter', period: 'monthly', status: 'closed', start_date: '2025-05-10', next_bill: null, amount: '390.00', quantity: '1.00', auto_renew: false, cycle_left: 0, cycle_length: 30 },
];

/* ---------------- Invoices ---------------- */

export const invoices: Invoice[] = [
  { id: 101, ref: 'INV-1038', customer: 'Acme Works', sub_ref: 'SUB-0402', issued_on: '2026-10-01', due_on: '2026-10-16', status: 'paid', subtotal: '120000.00', tax_rate: '0.18', discount: '0.00', total: '141600.00', sent_on: '2026-10-01' },
  { id: 102, ref: 'INV-1039', customer: 'Nimbus Retail', sub_ref: 'SUB-0412', issued_on: '2026-10-01', due_on: '2026-10-16', status: 'paid', subtotal: '84000.00', tax_rate: '0.18', discount: '8400.00', total: '89208.00', sent_on: '2026-10-01' },
  { id: 103, ref: 'INV-1040', customer: 'Kettle & Co', sub_ref: 'SUB-0415', issued_on: '2026-10-10', due_on: '2026-10-25', status: 'overdue', subtotal: '780.00', tax_rate: '0.18', discount: '0.00', total: '920.40', sent_on: '2026-10-10' },
  { id: 104, ref: 'INV-1041', customer: 'Meridian Labs', sub_ref: 'SUB-0418', issued_on: '2026-10-12', due_on: '2026-10-27', status: 'partially_paid', subtotal: '25200.00', tax_rate: '0.18', discount: '0.00', total: '29736.00', sent_on: '2026-10-12' },
  { id: 105, ref: 'INV-1042', customer: 'Harbour Point Cafe', sub_ref: 'SUB-0421', issued_on: '2026-10-14', due_on: '2026-10-29', status: 'cancelled', subtotal: '390.00', tax_rate: '0.18', discount: '0.00', total: '0.00', sent_on: null },
  { id: 106, ref: 'INV-1043', customer: 'Nimbus Retail', sub_ref: 'SUB-0424', issued_on: '2026-10-20', due_on: '2026-11-04', status: 'confirmed', subtotal: '390.00', tax_rate: '0.18', discount: '0.00', total: '460.20', sent_on: '2026-10-20' },
  { id: 107, ref: 'INV-1044', customer: 'Vellum Press', sub_ref: 'SUB-0433', issued_on: '2026-10-28', due_on: '2026-11-12', status: 'confirmed', subtotal: '1170.00', tax_rate: '0.18', discount: '117.00', total: '1242.54', sent_on: '2026-10-28' },
  { id: 108, ref: 'INV-1045', customer: 'Acme Works', sub_ref: 'SUB-0405', issued_on: '2026-10-29', due_on: '2026-11-13', status: 'draft', subtotal: '1560.00', tax_rate: '0.18', discount: '0.00', total: '1840.80', sent_on: null },
  { id: 109, ref: 'INV-1046', customer: 'Acme Works', sub_ref: 'SUB-0436', issued_on: '2026-10-30', due_on: '2026-11-14', status: 'draft', subtotal: '1180.00', tax_rate: '0.18', discount: '0.00', total: '1392.40', sent_on: null },
  { id: 110, ref: 'INV-1035', customer: 'Meridian Labs', sub_ref: 'SUB-0418', issued_on: '2026-09-15', due_on: '2026-09-30', status: 'paid', subtotal: '25200.00', tax_rate: '0.18', discount: '0.00', total: '29736.00', sent_on: '2026-09-15' },
  { id: 111, ref: 'INV-1036', customer: 'Cobalt Studio', sub_ref: 'SUB-0430', issued_on: '2026-09-18', due_on: '2026-10-03', status: 'paid', subtotal: '2520.00', tax_rate: '0.18', discount: '0.00', total: '2973.60', sent_on: '2026-09-18' },
  { id: 112, ref: 'INV-1037', customer: 'Kettle & Co', sub_ref: 'SUB-0415', issued_on: '2026-09-24', due_on: '2026-10-09', status: 'paid', subtotal: '780.00', tax_rate: '0.18', discount: '0.00', total: '920.40', sent_on: '2026-09-24' },
];

/* ---------------- Payments ---------------- */

export const payments: Payment[] = [
  { id: 201, ref: 'PAY-0841', invoice_ref: 'INV-1038', customer: 'Acme Works', method: 'bank_transfer', amount: '141600.00', paid_on: '2026-10-09', status: 'succeeded' },
  { id: 202, ref: 'PAY-0842', invoice_ref: 'INV-1039', customer: 'Nimbus Retail', method: 'upi', amount: '50892.00', paid_on: '2026-10-12', status: 'succeeded' },
  { id: 203, ref: 'PAY-0843', invoice_ref: 'INV-1039', customer: 'Nimbus Retail', method: 'card', amount: '38316.00', paid_on: '2026-10-14', status: 'succeeded' },
  { id: 204, ref: 'PAY-0844', invoice_ref: 'INV-1040', customer: 'Kettle & Co', method: 'upi', amount: '300.00', paid_on: '2026-10-22', status: 'failed' },
  { id: 205, ref: 'PAY-0845', invoice_ref: 'INV-1041', customer: 'Meridian Labs', method: 'bank_transfer', amount: '15000.00', paid_on: '2026-10-24', status: 'succeeded' },
  { id: 206, ref: 'PAY-0846', invoice_ref: 'INV-1035', customer: 'Meridian Labs', method: 'bank_transfer', amount: '29736.00', paid_on: '2026-09-27', status: 'succeeded' },
  { id: 207, ref: 'PAY-0847', invoice_ref: 'INV-1037', customer: 'Kettle & Co', method: 'upi', amount: '920.40', paid_on: '2026-10-02', status: 'succeeded' },
  { id: 208, ref: 'PAY-0848', invoice_ref: 'INV-1043', customer: 'Nimbus Retail', method: 'upi', amount: '460.20', paid_on: TODAY, status: 'succeeded' },
  { id: 209, ref: 'PAY-0849', invoice_ref: 'INV-1044', customer: 'Vellum Press', method: 'card', amount: '1242.54', paid_on: TODAY, status: 'succeeded' },
];

/* ---------------- Catalog ---------------- */

export const products: Product[] = [
  {
    id: 1, sku: 'LOOP-CRM', name: 'Loop CRM', category: 'Core app', description: 'Contacts, pipelines and activity tracking.',
    price: '540.00', variants: [
      { key: 'Standard', detail: 'Base edition', add_on: '0.00' },
      { key: 'Odoo', detail: 'Brand "Odoo" badge', add_on: '560.00' },
    ],
  },
  {
    id: 2, sku: 'LOOP-MAIL', name: 'Loop Mail', category: 'Core app', description: 'Shared inboxes, aliases and sending rules.',
    price: '390.00', variants: [{ key: 'Standard', detail: 'Base edition', add_on: '0.00' }],
  },
  {
    id: 3, sku: 'LOOP-STORE', name: 'Loop Storage', category: 'Core app', description: 'Files with version history and shares.',
    price: '295.00', variants: [
      { key: 'Standard', detail: '100 GB per seat', add_on: '0.00' },
      { key: 'Archive', detail: 'Cold storage tier', add_on: '120.00' },
    ],
  },
  {
    id: 4, sku: 'LOOP-ANALYTICS', name: 'Loop Analytics', category: 'Add-on app', description: 'Revenue reports and cohort dashboards.',
    price: '720.00', variants: [{ key: 'Standard', detail: 'Base edition', add_on: '0.00' }],
  },
];

export const plans: Plan[] = [
  { id: 11, name: 'Starter', period: 'monthly', price: '390.00', min_quantity: '1.00', status: 'active', flags: { pause: true, renew: true, auto_close: true, early_close: true }, available_from: '2026-01-01', available_to: null },
  { id: 12, name: 'Pro', period: 'monthly', price: '1050.00', min_quantity: '1.00', status: 'active', flags: { pause: true, renew: true, auto_close: false, early_close: true }, available_from: '2026-01-01', available_to: null },
  { id: 13, name: 'Pro', period: 'yearly', price: '12000.00', min_quantity: '1.00', status: 'active', flags: { pause: true, renew: true, auto_close: false, early_close: false }, available_from: '2026-01-01', available_to: '2027-12-31' },
  { id: 14, name: 'Business', period: 'quarterly', price: '8400.00', min_quantity: '5.00', status: 'active', flags: { pause: false, renew: true, auto_close: false, early_close: true }, available_from: '2026-06-01', available_to: null },
  { id: 15, name: 'Loop Mail', period: 'monthly', price: '390.00', min_quantity: '1.00', status: 'active', flags: { pause: true, renew: true, auto_close: true, early_close: false }, available_from: '2026-01-01', available_to: null },
  { id: 16, name: 'Founders pack', period: 'yearly', price: '9600.00', min_quantity: '2.00', status: 'draft', flags: { pause: true, renew: false, auto_close: true, early_close: false }, available_from: '2026-12-01', available_to: null },
];

export const taxes: TaxRule[] = [
  { id: 21, jurisdiction: 'India — GST (services)', code: 'GST-18', rate: '0.18' },
  { id: 22, jurisdiction: 'India — GST (software)', code: 'GST-12', rate: '0.12' },
  { id: 23, jurisdiction: 'EU — VAT digital', code: 'VAT-STD', rate: '0.20' },
];

export const templates: Template[] = [
  { id: 31, name: 'Pro onboarding — yearly', description: 'Pro yearly + Loop Storage, one invoice up front.', lines: [{ plan: 'Pro (yearly)', quantity: '10.00' }, { plan: 'Loop Storage (monthly)', quantity: '10.00' }], validity_days: 30 },
  { id: 32, name: 'Starter quick start', description: 'Single Starter seat, monthly.', lines: [{ plan: 'Starter (monthly)', quantity: '1.00' }], validity_days: 14 },
  { id: 33, name: 'Retail suite', description: 'CRM + Mail + Storage bundle.', lines: [{ plan: 'Pro (monthly)', quantity: '5.00' }, { plan: 'Loop Mail (monthly)', quantity: '5.00' }, { plan: 'Loop Storage (monthly)', quantity: '5.00' }], validity_days: 21 },
];

export const discounts: Discount[] = [
  { id: 41, name: 'Annual prepay 7%', kind: 'percent', value: '7.00', scope: 'Pro (yearly)', min_quantity: '1.00', valid_from: '2026-01-01', valid_to: '2026-12-31', usage_limit: 100, used: 34, status: 'active' },
  { id: 42, name: 'Nimbus loyalty 10%', kind: 'percent', value: '10.00', scope: 'Nimbus Retail — all plans', min_quantity: '1.00', valid_from: '2026-04-01', valid_to: '2026-12-31', usage_limit: 0, used: 12, status: 'active' },
  { id: 43, name: 'Launch month flat-off', kind: 'fixed', value: '500.00', scope: 'Any new yearly plan', min_quantity: '2.00', valid_from: '2026-07-01', valid_to: '2026-11-05', usage_limit: 50, used: 41, status: 'expiring' },
  { id: 44, name: 'Beta cohort 15%', kind: 'percent', value: '15.00', scope: 'Loop Analytics', min_quantity: '1.00', valid_from: '2025-10-01', valid_to: '2026-09-30', usage_limit: 25, used: 25, status: 'expired' },
];

export const users: UserRow[] = [
  { id: 51, name: 'Leto Atreides', email: 'admin@brightloop.local', role: 'admin', is_active: true, last_login: '2026-10-31' },
  { id: 52, name: 'Gurney Halleck', email: 'staff@brightloop.local', role: 'staff', is_active: true, last_login: '2026-10-30' },
  { id: 53, name: 'Chani Kynes', email: 'chani@brightloop.local', role: 'staff', is_active: true, last_login: '2026-10-29' },
  { id: 54, name: 'Ana della Corte', email: 'ana@acme.works', role: 'customer', is_active: true, last_login: '2026-10-31' },
  { id: 55, name: 'Ravi Menon', email: 'viewer@brightloop.local', role: 'viewer', is_active: false, last_login: '2026-09-12' },
];

/* ---------------- Support content ---------------- */

export const articles: Article[] = [
  {
    id: 61, title: 'Pro plan details', category: 'Plan', status: 'published', updated: '2026-10-30', used_by_bot: 142,
    body: 'The Pro plan includes unlimited contacts, pipelines, Loop Mail and Loop Storage. Seats are billed per user. You can add seats at any time from Add seats; the change is prorated on your next invoice.',
  },
  {
    id: 62, title: 'Seat changes', category: 'Plan', status: 'published', updated: '2026-10-28', used_by_bot: 97,
    body: 'You can add seats from My subscriptions > Add seats. Removed seats take effect at the end of the current period. Plans with auto-close allowed renew themselves at the end of each period unless you turn auto-renew off.',
  },
  {
    id: 63, title: 'Refund policy', category: 'Billing', status: 'published', updated: '2026-10-20', used_by_bot: 31,
    body: 'Yearly plans can be refunded within 14 days of the first payment. Monthly plan payments are non-refundable once the period has started, but you can close the plan so it does not renew. Refunds are returned to the original payment method within 5 working days.',
  },
  {
    id: 64, title: 'Closing a subscription', category: 'Subscription management', status: 'published', updated: '2026-10-22', used_by_bot: 58,
    body: 'You can close a subscription from My subscriptions > Close, if the plan allows it. Access ends on the date shown in the confirmation. Your data stays available for 30 days, then it is deleted.',
  },
  {
    id: 65, title: 'Pausing a plan', category: 'Subscription management', status: 'draft', updated: '2026-10-25', used_by_bot: 0,
    body: 'Plans that allow pausing can be paused for up to two months per year. While paused you are not billed, and the period clock stops. Resume from My subscriptions > Resume.',
  },
];

export const unanswered: Unanswered[] = [
  { question: 'Do you offer student pricing?', asks: 3 },
  { question: 'Can I move my yearly plan to quarterly halfway?', asks: 2 },
  { question: 'Is Loop available in French?', asks: 1 },
];

/* ---------------- Chatbot analytics (admin dashboard card) ---------------- */

export const chatStats = { chats_this_week: 86, deflected_percent: 72, tickets_from_chat: 14 };

/* ---------------- Dashboard shape ---------------- */

export const dashboard = {
  kpis: {
    active_subs: 9,
    revenue_month: '842000.00',
    outstanding: '196500.00',
    overdue_count: 37,
    overdue_amount: '23934.40',
    collected_month: '744860.60',
  },
  revenue_series: [
    { label: 'Nov', value: 612000 }, { label: 'Dec', value: 655000 },
    { label: 'Jan', value: 702000 }, { label: 'Feb', value: 689000 },
    { label: 'Mar', value: 734000 }, { label: 'Apr', value: 741000 },
    { label: 'May', value: 728000 }, { label: 'Jun', value: 768000 },
    { label: 'Jul', value: 772000 }, { label: 'Aug', value: 801000 },
    { label: 'Sep', value: 796000 }, { label: 'Oct', value: 842000 },
  ],
  overdue_invoices: [invoices[2], invoices[3]],
};

/* ---------------- Demo accounts ---------------- */

export const demoUsers = [
  { email: 'admin@brightloop.local', password: 'Brightloop1!', role: 'admin' as Role, name: 'Leto Atreides' },
  { email: 'staff@brightloop.local', password: 'Brightloop1!', role: 'staff' as Role, name: 'Gurney Halleck' },
  { email: 'ana@acme.works', password: 'Brightloop1!', role: 'customer' as Role, name: 'Ana della Corte' },
];
