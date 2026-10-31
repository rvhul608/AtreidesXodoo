/* ============================================================
   The one API client module. Every screen calls this file, so
   switching a mock off is a one-line change per endpoint when
   the backend module lands on main (03-UI.md).
   Response shapes mirror docs/api-contract.md:
   success -> { data } / lists -> { data, meta: { page, pageSize, total } }.
   ============================================================ */

import {
  dashboard, discounts, invoices, payments, plans, products, subscriptions,
  taxes, templates, users, articles, unanswered, demoUsers, TODAY,
} from './data';
import type {
  Article, Discount, InvoiceStatus, Invoice, Payment, Plan, Product, Role,
  Subscription, TaxRule, Template, UserRow, Unanswered,
} from './data';

export interface List<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number };
}

const WAIT = 450;

function delay<T>(body: T): Promise<{ data: T }> {
  return new Promise((resolve) => setTimeout(() => resolve({ data: body }), WAIT));
}

function delayList<T>(body: T[], page: number, pageSize: number): Promise<{ data: List<T> }> {
  const start = (page - 1) * pageSize;
  return delay({
    data: body.slice(start, start + pageSize),
    meta: { page, pageSize, total: body.length },
  });
}

export interface SessionUser {
  name: string;
  email: string;
  role: Role;
}

/* ---------------- auth ---------------- */

export const auth = {
  async login(email: string, password: string): Promise<SessionUser> {
    const user = demoUsers.find((u) => u.email === email.toLowerCase().trim());
    if (!user || password !== user.password) {
      await new Promise((r) => setTimeout(r, 300));
      throw new Error('WRONG_CREDENTIALS');
    }
    await new Promise((r) => setTimeout(r, 300));
    return { name: user.name, email: user.email, role: user.role };
  },
  async signup(name: string, email: string): Promise<SessionUser> {
    // Mock: new signups land on the customer portal.
    await new Promise((r) => setTimeout(r, 400));
    return { name, email, role: 'customer' };
  },
  async logout(): Promise<void> {
    return delay(null).then(() => undefined);
  },
};

/* ---------------- dashboard (admin / staff) ---------------- */

export const reports = {
  async getDashboard(): Promise<{ data: typeof dashboard }> {
    return delay(dashboard);
  },
};

/* ---------------- subscriptions ---------------- */

export const subscriptionsApi = {
  async list(page = 1, pageSize = 25, status?: string, search?: string): Promise<{ data: List<Subscription> }> {
    let rows = subscriptions;
    if (status && status !== 'all') rows = rows.filter((s) => s.status === status);
    if (search) rows = rows.filter((s) => `${s.ref} ${s.customer} ${s.plan}`.toLowerCase().includes(search.toLowerCase()));
    return delayList(rows, page, pageSize);
  },
  async confirm(id: number) {
    const sub = subscriptions.find((s) => s.id === id);
    if (sub) sub.status = 'confirmed';
    return delay(sub!);
  },
  async setActive(id: number) {
    const sub = subscriptions.find((s) => s.id === id);
    if (sub) { sub.status = 'active'; sub.next_bill = '2026-11-30'; sub.cycle_left = 30; sub.cycle_length = 365; }
    return delay(sub!);
  },
  async close(id: number) {
    const sub = subscriptions.find((s) => s.id === id);
    if (sub) { sub.status = 'closed'; sub.next_bill = null; sub.auto_renew = false; }
    return delay(sub!);
  },
  /* Customer portal scope: only the caller's rows. */
  async portalList(): Promise<{ data: Subscription[] }> {
    const mine = subscriptions.filter((s) => s.customer === 'Acme Works');
    return delay(mine);
  },
};

/* ---------------- invoices ---------------- */

export const invoicesApi = {
  async list(page = 1, pageSize = 25, status?: string, search?: string): Promise<{ data: List<Invoice> }> {
    let rows = [...invoices].sort((a, b) => b.issued_on.localeCompare(a.issued_on));
    if (status && status !== 'all') rows = rows.filter((i) => i.status === status);
    if (search) rows = rows.filter((i) => `${i.ref} ${i.customer}`.toLowerCase().includes(search.toLowerCase()));
    return delayList(rows, page, pageSize);
  },
  async confirm(id: number) {
    const inv = invoices.find((i) => i.id === id);
    if (inv) inv.status = 'confirmed';
    return delay(inv!);
  },
  async send(id: number) {
    const inv = invoices.find((i) => i.id === id);
    if (inv) inv.sent_on = TODAY;
    return delay(inv!);
  },
  async cancel(id: number) {
    const inv = invoices.find((i) => i.id === id);
    if (inv) inv.status = 'cancelled';
    return delay(inv!);
  },
  async recordPayment(invoiceId: number, method: string, amount: string): Promise<{ data: { invoice: Invoice; payment: Payment } }> {
    const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv) throw new Error('NOT_FOUND');
    const pay: Payment = {
      id: Date.now(),
      ref: `PAY-${900 + payments.length}`,
      invoice_ref: inv.ref,
      customer: inv.customer,
      method: method as Payment['method'],
      amount,
      paid_on: TODAY,
      status: 'succeeded',
    };
    payments.push(pay);
    if (Number(amount) >= Number(inv.total)) inv.status = 'paid';
    else inv.status = 'partially_paid';
    return delay({ invoice: inv, payment: pay });
  },
  async setOverdue(id: number) {
    const inv = invoices.find((i) => i.id === id);
    if (inv) inv.status = 'overdue' as InvoiceStatus;
    return delay(inv!);
  },
  /* Customer portal scope. */
  async portalList(): Promise<{ data: Invoice[] }> {
    return delay(invoices.filter((i) => i.customer === 'Acme Works'));
  },
};

/* ---------------- payments ---------------- */

export const paymentsApi = {
  async list(page = 1, pageSize = 25, search?: string): Promise<{ data: List<Payment> }> {
    let rows = [...payments].sort((a, b) => b.paid_on.localeCompare(a.paid_on));
    if (search) rows = rows.filter((p) => `${p.ref} ${p.customer} ${p.invoice_ref}`.toLowerCase().includes(search.toLowerCase()));
    return delayList(rows, page, pageSize);
  },
};

/* ---------------- catalog ---------------- */

export const catalogApi = {
  async products(): Promise<{ data: Product[] }> { return delay(products); },
  async plans(): Promise<{ data: Plan[] }> { return delay(plans); },
  async taxes(): Promise<{ data: TaxRule[] }> { return delay(taxes); },
  async templates(): Promise<{ data: Template[] }> { return delay(templates); },
  async discounts(): Promise<{ data: Discount[] }> { return delay(discounts); },
};

/* ---------------- admin ---------------- */

export const adminApi = {
  async users(): Promise<{ data: UserRow[] }> { return delay(users); },
  async articles(): Promise<{ data: Article[] }> { return delay(articles); },
  async unanswered(): Promise<{ data: Unanswered[] }> { return delay(unanswered); },
};
