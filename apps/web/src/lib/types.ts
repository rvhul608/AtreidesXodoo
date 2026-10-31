export type Role = 'admin' | 'staff' | 'customer';

export type SubscriptionStatus =
  | 'Draft'
  | 'Quotation'
  | 'Confirmed'
  | 'Active'
  | 'Paused'
  | 'Closed';

export type InvoiceStatus = 'Draft' | 'Confirmed' | 'Paid' | 'Cancelled';
export type PaymentStatus = 'Received' | 'Failed' | 'Reversed';
export type PlanPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface Customer {
  id: number;
  legal_name: string;
  email: string;
  contact: string;
  city: string;
  since: string;
}

export interface TaxRule {
  id: number;
  name: string;
  jurisdiction: string;
  rate: number;
}

export interface ProductVariant {
  id: number;
  name: string;
  value: string;
  extra_price: number;
}

export interface Product {
  id: number;
  sku: string;
  name: string;
  type: string;
  sales_price: number;
  cost_price: number;
  notes: string;
  variants: ProductVariant[];
  taxIds: number[];
}

export interface Plan {
  id: number;
  plan_number: string;
  name: string;
  description: string;
  price: number;
  period: PlanPeriod;
  min_quantity: number;
  available_from: string | null;
  available_until: string | null;
  auto_close: boolean;
  allow_early_close: boolean;
  allow_pause: boolean;
  allow_renew: boolean;
}

export interface TemplateLine {
  productId: number;
  variantId?: number;
  quantity: number;
}

export interface QuotationTemplate {
  id: number;
  name: string;
  description: string;
  planId: number;
  validityDays: number;
  lines: TemplateLine[];
}

export interface SubscriptionLine {
  id: number;
  productId: number;
  variantId: number | null;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  tax_amount: number;
}

export interface SubscriptionHistory {
  id: number;
  from: SubscriptionStatus | null;
  to: SubscriptionStatus;
  action: string;
  reason: string;
  actor: string;
  changed_at: string;
}

export interface Subscription {
  id: number;
  subscription_number: string;
  customerId: number;
  planId: number;
  templateId: number | null;
  status: SubscriptionStatus;
  start_date: string;
  expiry_date: string | null;
  next_billing_date: string | null;
  paused_at: string | null;
  payment_terms: string;
  lines: SubscriptionLine[];
  history: SubscriptionHistory[];
  created_at: string;
  updated_at: string;
}

export interface TraceRule {
  name: string;
  detail: string;
  amount?: number;
  outcome: 'applied' | 'skipped' | 'considered';
}

export interface InvoiceLine {
  id: number;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  tax_rate: number;
  tax_amount: number;
  discount_percent: number;
  discount_amount: number;
}

export interface Invoice {
  id: number;
  invoice_number: string;
  customerId: number;
  subscriptionId: number;
  period_start: string;
  period_end: string;
  issued_date: string;
  due_date: string;
  status: InvoiceStatus;
  lines: InvoiceLine[];
  subtotal: number;
  tax_amount: number;
  discount_total: number;
  total: number;
  amount_paid: number;
  trace: TraceRule[];
  sent_at: string | null;
}

export interface Payment {
  id: number;
  invoiceId: number;
  customerId: number;
  amount: number;
  payment_method: string;
  status: PaymentStatus;
  transaction_date: string;
  notes: string;
}

export interface Discount {
  id: number;
  name: string;
  type: 'percent' | 'fixed';
  value: number;
  scope: string;
  min_amount: number;
  starts: string;
  ends: string;
  usage_limit: number;
  used: number;
  active: boolean;
}

export type ArticleStatus = 'Active' | 'Draft';

export interface KBArticle {
  id: number;
  title: string;
  category: string;
  body: string;
  status: ArticleStatus;
  updated: string;
  used: number;
}

export interface UnansweredQuestion {
  id: number;
  question: string;
  asks: number;
  last_asked: string;
  status: 'open' | 'answered' | 'dismissed';
}

export interface Ticket {
  id: number;
  ticket_number: string;
  customerId: number;
  subject: string;
  status: 'Open' | 'In progress' | 'Resolved';
  created_at: string;
}

export interface StaffUser {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'staff';
  active: boolean;
  last_active: string;
}

export interface OutboxEmail {
  id: number;
  recipient: string;
  subject: string;
  body: string;
  status: 'Sent' | 'Queued' | 'Failed';
  created_at: string;
  sent_at: string | null;
}

export interface LeakageFinding {
  id: number;
  type: string;
  customerId: number;
  detail: string;
  amount: number;
  status: 'Open' | 'Recovered' | 'Ignored';
}

export interface OpsRun {
  id: number;
  started_at: string;
  status: 'Succeeded' | 'Running' | 'Failed';
  created: number;
  skipped: number;
  failed: number;
  duration_ms: number;
}

export interface Notification {
  id: number;
  title: string;
  detail: string;
  time: string;
  read: boolean;
  tone: 'info' | 'good' | 'warn' | 'danger';
}

export interface SessionUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  customerId: number | null;
  title: string;
}

export interface ChatMessage {
  id: number;
  role: 'bot' | 'customer' | 'staff';
  text: string;
  sourceId?: number;
  suggestions?: string[];
  card?:
    | { type: 'invoice'; invoiceId: number }
    | { type: 'confirm-close'; subscriptionId: number }
    | { type: 'confirm-pay'; invoiceId: number }
    | { type: 'escalate' }
    | { type: 'ticket'; ticketNumber: string };
  feedback?: 'up' | 'down' | null;
  feedbackReason?: string;
  streaming?: boolean;
  created_at: string;
}

export interface AppState {
  customers: Customer[];
  taxes: TaxRule[];
  products: Product[];
  plans: Plan[];
  templates: QuotationTemplate[];
  subscriptions: Subscription[];
  invoices: Invoice[];
  payments: Payment[];
  discounts: Discount[];
  articles: KBArticle[];
  questions: UnansweredQuestion[];
  tickets: Ticket[];
  staff: StaffUser[];
  outbox: OutboxEmail[];
  leakage: LeakageFinding[];
  opsRuns: OpsRun[];
  notifications: Notification[];
  chat: ChatMessage[];
  chatUnread: number;
  chatOpen: boolean;
  theme: 'light' | 'dark';
  session: SessionUser | null;
}
