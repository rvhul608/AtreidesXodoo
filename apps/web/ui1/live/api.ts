import axios from 'axios';

export function apiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const body = error.response?.data as { error?: { message?: string } } | undefined;
    if (body?.error?.message) return body.error.message;
    if (!error.response) return 'Could not reach Brightloop. Check your connection and try again.';
  }
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

export const http = axios.create({ baseURL: '/api', withCredentials: true, headers: { 'Content-Type': 'application/json' } });
export interface ApiUser { id: number; name: string | null; email: string; role: 'admin' | 'staff' | 'customer'; customer_id: number | null }
export interface ListResult<T> { data: T[]; meta: { page: number; pageSize: number; total: number } }
export interface Subscription {
  id: number; subscription_number: string; customer_id: number; customer_name: string; plan_id: number;
  plan_name: string; status: 'Draft' | 'Quotation' | 'Confirmed' | 'Active' | 'Paused' | 'Closed'; period: string;
  start_date: string; expiry_date: string | null; next_billing_date: string | null;
  payment_terms: string; created_at: string; totals: { untaxed: string; tax: string; total: string };
  lines: Array<{ id: number; quantity: string; unit_price: string; amount: string; tax_amount: string; description: string | null }>;
}
export interface Plan {
  id: number; plan_number: string; name: string; description: string | null; price: string; period: string;
  min_quantity: number; auto_close: boolean; allow_early_close: boolean; allow_pause: boolean; allow_renew: boolean;
}
export interface Product { id: number; sku: string; name: string; type: string; sales_price: string; cost_price: string; notes: string | null }
export interface Renewal { id: number; subscription_number: string; customer_name: string; plan_name: string; period: string; expiry_date: string; days_left: number; can_renew: boolean }
export interface Invoice { id: number; invoice_number: string; customer_id?: number; customer_name?: string; subscription_id: number; subtotal: string; tax_amount: string; total: string; amount_paid: string; outstanding: string; status: string; due_date: string; issued_date: string }
export interface Payment { id: number; invoice_number: string; customer_name: string; amount: string; method: string; status: string; paid_on: string }
export const authApi = {
  me: () => http.get<{ data: ApiUser }>('/auth/me').then((r) => r.data.data),
  login: (email: string, password: string) => http.post<{ data: ApiUser }>('/auth/login', { email, password }).then((r) => r.data.data),
  signup: (name: string, email: string, password: string) => http.post<{ data: ApiUser }>('/auth/signup', { name, email, password }).then((r) => r.data.data),
  logout: () => http.post('/auth/logout'),
  requestReset: (email: string) => http.post('/auth/request-reset', { email }).then((r) => r.data.data as { message: string }),
};
export const loadSubscriptions = (page = 1) => http.get<ListResult<Subscription>>('/subscriptions', { params: { page, pageSize: 50 } }).then((r) => r.data);
export const loadMySubscriptions = (page = 1) => http.get<ListResult<Subscription>>('/portal/subscriptions', { params: { page, pageSize: 50 } }).then((r) => r.data);
export const loadPlans = (page = 1) => http.get<ListResult<Plan>>('/plans', { params: { page, pageSize: 50 } }).then((r) => r.data);
export const loadProducts = (page = 1) => http.get<ListResult<Product>>('/products', { params: { page, pageSize: 50 } }).then((r) => r.data);
export const loadRenewals = () => http.get<ListResult<Renewal>>('/renewals/queue', { params: { page: 1, pageSize: 50, days: 30 } }).then((r) => r.data);
export const loadInvoices = (page = 1) => http.get<ListResult<Invoice>>('/invoices', { params: { page, pageSize: 50 } }).then((r) => r.data);
export const loadMyInvoices = (page = 1) => http.get<ListResult<Invoice>>('/portal/invoices', { params: { page, pageSize: 50 } }).then((r) => r.data);
export const loadPayments = () => http.get<ListResult<Payment>>('/payments', { params: { page: 1, pageSize: 50 } }).then((r) => r.data);
