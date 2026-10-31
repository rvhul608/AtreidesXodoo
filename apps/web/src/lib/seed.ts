import { addDays, iso } from './format';
import type {
  AppState,
  Customer,
  Discount,
  Invoice,
  InvoiceLine,
  InvoiceStatus,
  KBArticle,
  LeakageFinding,
  OpsRun,
  OutboxEmail,
  Payment,
  Plan,
  Product,
  QuotationTemplate,
  StaffUser,
  Subscription,
  SubscriptionHistory,
  SubscriptionLine,
  SubscriptionStatus,
  TaxRule,
  Ticket,
  UnansweredQuestion,
} from './types';

const now = new Date();

export const customers: Customer[] = [
  { id: 1, legal_name: 'Northwind Labs', email: 'priya@northwind.test', contact: 'Priya Menon', city: 'Bengaluru', since: '2024-03-11' },
  { id: 2, legal_name: 'Contoso Studio', email: 'arjun@contoso.test', contact: 'Arjun Rao', city: 'Pune', since: '2024-07-02' },
  { id: 3, legal_name: 'Fabrikam Works', email: 'neha@fabrikam.test', contact: 'Neha Kulkarni', city: 'Mumbai', since: '2025-01-19' },
  { id: 4, legal_name: 'Meridian Health', email: 'rohit@meridian.test', contact: 'Rohit Sharma', city: 'Hyderabad', since: '2025-04-08' },
  { id: 5, legal_name: 'Kestrel Freight', email: 'sara@kestrel.test', contact: 'Sara Iyer', city: 'Chennai', since: '2025-06-23' },
  { id: 6, legal_name: 'Lumen Analytics', email: 'dev@lumen.test', contact: 'Dev Patel', city: 'Ahmedabad', since: '2025-09-14' },
  { id: 7, legal_name: 'Harbor & Co', email: 'ananya@harbor.test', contact: 'Ananya Bose', city: 'Kolkata', since: '2026-01-05' },
  { id: 8, legal_name: 'Verdant Foods', email: 'kabir@verdant.test', contact: 'Kabir Singh', city: 'Jaipur', since: '2026-04-27' },
];

export const taxes: TaxRule[] = [
  { id: 1, name: 'GST 18%', jurisdiction: 'IN', rate: 0.18 },
  { id: 2, name: 'GST 12%', jurisdiction: 'IN', rate: 0.12 },
  { id: 3, name: 'Exempt', jurisdiction: 'IN', rate: 0 },
];

export const products: Product[] = [
  {
    id: 1,
    sku: 'ERP-LICENSE',
    name: 'ERP License',
    type: 'service',
    sales_price: 1000,
    cost_price: 300,
    notes: 'Core subscription licence for the Brightloop ERP suite.',
    variants: [
      { id: 1, name: 'Brand', value: 'Odoo', extra_price: 560 },
      { id: 2, name: 'Brand', value: 'Brightloop', extra_price: 0 },
    ],
    taxIds: [1],
  },
  {
    id: 2,
    sku: 'SUPPORT-HOURS',
    name: 'Support Hours',
    type: 'service',
    sales_price: 250,
    cost_price: 120,
    notes: 'Prepaid support hours, billed per hour.',
    variants: [],
    taxIds: [1],
  },
  {
    id: 3,
    sku: 'CLOUD-HOST',
    name: 'Cloud Hosting',
    type: 'service',
    sales_price: 450,
    cost_price: 180,
    notes: 'Managed hosting for production environments.',
    variants: [
      { id: 3, name: 'Region', value: 'India', extra_price: 0 },
      { id: 4, name: 'Region', value: 'Global', extra_price: 120 },
    ],
    taxIds: [1],
  },
  {
    id: 4,
    sku: 'ONBOARD',
    name: 'Onboarding Package',
    type: 'service',
    sales_price: 2500,
    cost_price: 900,
    notes: 'Guided setup, data migration and team training.',
    variants: [],
    taxIds: [1],
  },
  {
    id: 5,
    sku: 'ANALYTICS',
    name: 'Analytics Add-on',
    type: 'service',
    sales_price: 700,
    cost_price: 210,
    notes: 'Revenue, churn and cohort dashboards.',
    variants: [],
    taxIds: [1],
  },
  {
    id: 6,
    sku: 'PRIORITY',
    name: 'Priority Support',
    type: 'service',
    sales_price: 1200,
    cost_price: 400,
    notes: 'Four-hour response window and a named engineer.',
    variants: [],
    taxIds: [1],
  },
];

export const plans: Plan[] = [
  {
    id: 1,
    plan_number: 'MONTHLY-FLEX',
    name: 'Monthly Flex',
    description: 'Month-to-month billing with pause and early close.',
    price: 99,
    period: 'monthly',
    min_quantity: 1,
    available_from: '2024-01-01',
    available_until: null,
    auto_close: false,
    allow_early_close: true,
    allow_pause: true,
    allow_renew: true,
  },
  {
    id: 2,
    plan_number: 'YEARLY-FIXED',
    name: 'Yearly Fixed',
    description: 'Annual contract, renews automatically, no pause.',
    price: 999,
    period: 'yearly',
    min_quantity: 1,
    available_from: '2024-01-01',
    available_until: null,
    auto_close: true,
    allow_early_close: false,
    allow_pause: false,
    allow_renew: true,
  },
  {
    id: 3,
    plan_number: 'WEEKLY-TRIAL',
    name: 'Weekly Trial',
    description: 'Short evaluation plan. Closes automatically.',
    price: 25,
    period: 'weekly',
    min_quantity: 1,
    available_from: '2024-01-01',
    available_until: null,
    auto_close: true,
    allow_early_close: true,
    allow_pause: false,
    allow_renew: false,
  },
  {
    id: 4,
    plan_number: 'SCALE-PRO',
    name: 'Scale Pro',
    description: 'High-volume plan with priority support and analytics.',
    price: 499,
    period: 'monthly',
    min_quantity: 3,
    available_from: '2025-01-01',
    available_until: null,
    auto_close: false,
    allow_early_close: true,
    allow_pause: true,
    allow_renew: true,
  },
  {
    id: 5,
    plan_number: 'ENTERPRISE',
    name: 'Enterprise',
    description: 'Custom volume plan with a dedicated success manager.',
    price: 2499,
    period: 'monthly',
    min_quantity: 5,
    available_from: '2025-01-01',
    available_until: null,
    auto_close: false,
    allow_early_close: true,
    allow_pause: true,
    allow_renew: true,
  },
];

export const templates: QuotationTemplate[] = [
  {
    id: 1,
    name: 'Starter ERP bundle',
    description: 'ERP licence with the Odoo brand variant plus two support hours.',
    planId: 1,
    validityDays: 30,
    lines: [
      { productId: 1, variantId: 1, quantity: 1 },
      { productId: 2, quantity: 2 },
    ],
  },
  {
    id: 2,
    name: 'Scale onboarding',
    description: 'Two ERP seats, global hosting and analytics for a growing team.',
    planId: 4,
    validityDays: 21,
    lines: [
      { productId: 1, variantId: 2, quantity: 2 },
      { productId: 3, variantId: 4, quantity: 2 },
      { productId: 5, quantity: 1 },
    ],
  },
  {
    id: 3,
    name: 'Annual enterprise',
    description: 'Five ERP seats with priority support for annual commitments.',
    planId: 5,
    validityDays: 45,
    lines: [
      { productId: 1, variantId: 2, quantity: 5 },
      { productId: 6, quantity: 2 },
    ],
  },
];

function productById(id: number): Product {
  const product = products.find((item) => item.id === id);
  if (!product) throw new Error(`Unknown product ${id}`);
  return product;
}

function planById(id: number): Plan {
  const plan = plans.find((item) => item.id === id);
  if (!plan) throw new Error(`Unknown plan ${id}`);
  return plan;
}

export function priceLine(productId: number, variantId: number | null, quantity: number): SubscriptionLine {
  const product = productById(productId);
  const variant = variantId ? product.variants.find((item) => item.id === variantId) : undefined;
  const unit = product.sales_price + (variant?.extra_price ?? 0);
  const amount = unit * quantity;
  return {
    id: 0,
    productId,
    variantId: variantId ?? null,
    description: variant ? `${product.name} (${variant.name}: ${variant.value})` : product.name,
    quantity,
    unit_price: unit,
    amount,
    tax_amount: Math.round(amount * 0.18 * 100) / 100,
  };
}

export function templateLines(templateId: number): SubscriptionLine[] {
  const template = templates.find((item) => item.id === templateId);
  if (!template) return [];
  return template.lines.map((line, index) => ({
    ...priceLine(line.productId, line.variantId ?? null, line.quantity),
    id: index + 1,
  }));
}

function buildHistory(status: SubscriptionStatus, startDaysAgo: number, idBase: number): SubscriptionHistory[] {
  const flow: SubscriptionStatus[] = ['Draft', 'Quotation', 'Confirmed', 'Active'];
  const path = status === 'Paused' || status === 'Closed' ? [...flow, status] : flow.slice(0, flow.indexOf(status) + 1);
  const actionFor = (from: SubscriptionStatus | null, to: SubscriptionStatus): string => {
    if (!from) return 'created';
    const key = `${from}->${to}`;
    return (
      {
        'Draft->Quotation': 'send_quotation',
        'Quotation->Confirmed': 'confirm',
        'Confirmed->Active': 'activate',
        'Active->Paused': 'pause',
        'Active->Closed': 'close',
      }[key] ?? 'transition'
    );
  };
  return path.map((step, index) => {
    const from = index === 0 ? null : path[index - 1];
    return {
      id: idBase + index,
      from,
      to: step,
      action: actionFor(from, step),
      reason: index === 0 ? 'Created from quotation template' : `Moved to ${step}`,
      actor: 'Brightloop Staff',
      changed_at: `${addDays(startDaysAgo - index)}T10:${String(10 + index).padStart(2, '0')}:00.000Z`,
    };
  });
}

interface SeedSubscription {
  customerId: number;
  planId: number;
  templateId: number;
  status: SubscriptionStatus;
  startDaysAgo: number;
  expiryInDays: number | null;
  nextBillInDays: number | null;
  pausedDaysAgo?: number;
}

const seedSubscriptions: SeedSubscription[] = [
  { customerId: 1, planId: 1, templateId: 1, status: 'Active', startDaysAgo: 30, expiryInDays: 12, nextBillInDays: 5 },
  { customerId: 1, planId: 1, templateId: 1, status: 'Paused', startDaysAgo: 60, expiryInDays: 200, nextBillInDays: null, pausedDaysAgo: 3 },
  { customerId: 1, planId: 2, templateId: 3, status: 'Quotation', startDaysAgo: 3, expiryInDays: 365, nextBillInDays: null },
  { customerId: 2, planId: 2, templateId: 3, status: 'Active', startDaysAgo: 340, expiryInDays: 25, nextBillInDays: 25 },
  { customerId: 2, planId: 3, templateId: 1, status: 'Active', startDaysAgo: 2, expiryInDays: 5, nextBillInDays: 5 },
  { customerId: 2, planId: 1, templateId: 1, status: 'Draft', startDaysAgo: 1, expiryInDays: 90, nextBillInDays: null },
  { customerId: 3, planId: 1, templateId: 1, status: 'Confirmed', startDaysAgo: 4, expiryInDays: 120, nextBillInDays: null },
  { customerId: 3, planId: 2, templateId: 3, status: 'Active', startDaysAgo: 65, expiryInDays: 300, nextBillInDays: 18 },
  { customerId: 3, planId: 3, templateId: 1, status: 'Closed', startDaysAgo: 45, expiryInDays: -10, nextBillInDays: null },
  { customerId: 3, planId: 1, templateId: 1, status: 'Active', startDaysAgo: 120, expiryInDays: null, nextBillInDays: 18 },
  { customerId: 4, planId: 4, templateId: 2, status: 'Active', startDaysAgo: 75, expiryInDays: 45, nextBillInDays: 3 },
  { customerId: 4, planId: 1, templateId: 1, status: 'Active', startDaysAgo: 21, expiryInDays: 21, nextBillInDays: 21 },
  { customerId: 5, planId: 2, templateId: 3, status: 'Active', startDaysAgo: 305, expiryInDays: 60, nextBillInDays: 60 },
  { customerId: 5, planId: 4, templateId: 2, status: 'Paused', startDaysAgo: 150, expiryInDays: 150, nextBillInDays: null, pausedDaysAgo: 9 },
  { customerId: 6, planId: 1, templateId: 1, status: 'Active', startDaysAgo: 22, expiryInDays: 9, nextBillInDays: 9 },
  { customerId: 6, planId: 5, templateId: 3, status: 'Quotation', startDaysAgo: 2, expiryInDays: 365, nextBillInDays: null },
  { customerId: 7, planId: 5, templateId: 3, status: 'Active', startDaysAgo: 190, expiryInDays: 180, nextBillInDays: 12 },
  { customerId: 7, planId: 3, templateId: 1, status: 'Active', startDaysAgo: 3, expiryInDays: 4, nextBillInDays: 4 },
  { customerId: 8, planId: 1, templateId: 1, status: 'Active', startDaysAgo: 12, expiryInDays: 28, nextBillInDays: 28 },
  { customerId: 8, planId: 4, templateId: 2, status: 'Confirmed', startDaysAgo: 6, expiryInDays: 180, nextBillInDays: null },
  { customerId: 1, planId: 5, templateId: 3, status: 'Active', startDaysAgo: 95, expiryInDays: 90, nextBillInDays: 15 },
  { customerId: 2, planId: 1, templateId: 1, status: 'Closed', startDaysAgo: 210, expiryInDays: -30, nextBillInDays: null },
  { customerId: 5, planId: 1, templateId: 1, status: 'Draft', startDaysAgo: 2, expiryInDays: 90, nextBillInDays: null },
  { customerId: 6, planId: 2, templateId: 3, status: 'Active', startDaysAgo: 165, expiryInDays: 200, nextBillInDays: 35 },
];

export const subscriptions: Subscription[] = seedSubscriptions.map((seed, index) => {
  const id = 101 + index;
  const lines = templateLines(seed.templateId).map((line, lineIndex) => ({ ...line, id: id * 10 + lineIndex }));
  return {
    id,
    subscription_number: `SUB-${String(101 + index).padStart(6, '0')}`,
    customerId: seed.customerId,
    planId: seed.planId,
    templateId: seed.templateId,
    status: seed.status,
    start_date: addDays(-seed.startDaysAgo),
    expiry_date: seed.expiryInDays === null ? null : addDays(seed.expiryInDays),
    next_billing_date: seed.nextBillInDays === null ? null : addDays(seed.nextBillInDays),
    paused_at: seed.pausedDaysAgo ? addDays(-seed.pausedDaysAgo) : null,
    payment_terms: index % 3 === 0 ? 'Net 15' : index % 3 === 1 ? 'Due on receipt' : 'Net 30',
    lines,
    history: buildHistory(seed.status, seed.startDaysAgo, id * 10),
    created_at: `${addDays(-seed.startDaysAgo)}T09:00:00.000Z`,
    updated_at: `${addDays(-Math.min(seed.startDaysAgo, 2))}T11:30:00.000Z`,
  };
});

function lineFor(
  id: number,
  description: string,
  quantity: number,
  unit: number,
  taxRate: number,
  discountPercent = 0,
): InvoiceLine {
  const lineTotal = quantity * unit;
  const discountAmount = Math.round(lineTotal * (discountPercent / 100) * 100) / 100;
  const taxAmount = Math.round((lineTotal - discountAmount) * taxRate * 100) / 100;
  return {
    id,
    description,
    quantity,
    unit_price: unit,
    line_total: lineTotal,
    tax_rate: taxRate,
    tax_amount: taxAmount,
    discount_percent: discountPercent,
    discount_amount: discountAmount,
  };
}

interface SeedInvoice {
  subIndex: number;
  status: InvoiceStatus;
  issuedDaysAgo: number;
  dueInDays: number;
  discountPercent?: number;
  paid?: 'full' | 'partial';
}

const seedInvoices: SeedInvoice[] = [
  { subIndex: 0, status: 'Paid', issuedDaysAgo: 30, dueInDays: -16, paid: 'full' },
  { subIndex: 0, status: 'Confirmed', issuedDaysAgo: 0, dueInDays: 6 },
  { subIndex: 3, status: 'Paid', issuedDaysAgo: 335, dueInDays: -320, paid: 'full' },
  { subIndex: 3, status: 'Confirmed', issuedDaysAgo: 5, dueInDays: 9, discountPercent: 15 },
  { subIndex: 4, status: 'Paid', issuedDaysAgo: 2, dueInDays: 5, paid: 'full' },
  { subIndex: 5, status: 'Draft', issuedDaysAgo: 1, dueInDays: 14 },
  { subIndex: 6, status: 'Confirmed', issuedDaysAgo: 4, dueInDays: 11 },
  { subIndex: 7, status: 'Paid', issuedDaysAgo: 65, dueInDays: -50, paid: 'full' },
  { subIndex: 7, status: 'Confirmed', issuedDaysAgo: 1, dueInDays: -8 },
  { subIndex: 8, status: 'Cancelled', issuedDaysAgo: 40, dueInDays: -25 },
  { subIndex: 9, status: 'Paid', issuedDaysAgo: 120, dueInDays: -105, paid: 'full' },
  { subIndex: 9, status: 'Confirmed', issuedDaysAgo: 18, dueInDays: -3, discountPercent: 10 },
  { subIndex: 10, status: 'Paid', issuedDaysAgo: 75, dueInDays: -60, paid: 'full' },
  { subIndex: 10, status: 'Confirmed', issuedDaysAgo: 3, dueInDays: 0, discountPercent: 5 },
  { subIndex: 11, status: 'Paid', issuedDaysAgo: 21, dueInDays: -6, paid: 'full' },
  { subIndex: 12, status: 'Paid', issuedDaysAgo: 305, dueInDays: -290, paid: 'full' },
  { subIndex: 12, status: 'Confirmed', issuedDaysAgo: 7, dueInDays: -2 },
  { subIndex: 14, status: 'Paid', issuedDaysAgo: 22, dueInDays: -7, paid: 'full' },
  { subIndex: 14, status: 'Confirmed', issuedDaysAgo: 2, dueInDays: 7 },
  { subIndex: 16, status: 'Paid', issuedDaysAgo: 190, dueInDays: -175, paid: 'full' },
  { subIndex: 16, status: 'Confirmed', issuedDaysAgo: 12, dueInDays: 0, paid: 'partial' },
  { subIndex: 17, status: 'Paid', issuedDaysAgo: 3, dueInDays: 4, paid: 'full' },
  { subIndex: 18, status: 'Paid', issuedDaysAgo: 12, dueInDays: 3, paid: 'full' },
  { subIndex: 19, status: 'Confirmed', issuedDaysAgo: 6, dueInDays: 9 },
  { subIndex: 20, status: 'Paid', issuedDaysAgo: 95, dueInDays: -80, paid: 'full' },
  { subIndex: 20, status: 'Confirmed', issuedDaysAgo: 10, dueInDays: 5, discountPercent: 10 },
  { subIndex: 21, status: 'Paid', issuedDaysAgo: 210, dueInDays: -195, paid: 'full' },
  { subIndex: 23, status: 'Paid', issuedDaysAgo: 165, dueInDays: -150, paid: 'full' },
  { subIndex: 23, status: 'Confirmed', issuedDaysAgo: 9, dueInDays: 6 },
];

function invoiceTotals(lines: InvoiceLine[]) {
  const subtotal = lines.reduce((sum, line) => sum + line.line_total, 0);
  const discount = lines.reduce((sum, line) => sum + line.discount_amount, 0);
  const tax = lines.reduce((sum, line) => sum + line.tax_amount, 0);
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    discount_total: Math.round(discount * 100) / 100,
    tax_amount: Math.round(tax * 100) / 100,
    total: Math.round((subtotal - discount + tax) * 100) / 100,
  };
}

export const invoices: Invoice[] = seedInvoices.map((seed, index) => {
  const subscription = subscriptions[seed.subIndex];
  const discountPercent = seed.discountPercent ?? 0;
  const lines = subscription.lines.map((line, lineIndex) =>
    lineFor(index * 20 + lineIndex + 1, line.description, line.quantity, line.unit_price, 0.18, discountPercent),
  );
  const totals = invoiceTotals(lines);
  const trace = [
    { name: 'GST 18%', detail: 'Applied to every taxable line.', amount: totals.tax_amount, outcome: 'applied' as const },
    ...(discountPercent
      ? [
          {
            name: `${discountPercent}% ${discountPercent === 15 ? 'annual prepay' : 'partner'} discount`,
            detail: `Applied to ${lines.length} line${lines.length === 1 ? '' : 's'} for this customer.`,
            amount: totals.discount_total,
            outcome: 'applied' as const,
          },
        ]
      : []),
    {
      name: 'Early renewal credit',
      detail: 'Not applied: the subscription is not within 14 days of renewal.',
      outcome: 'skipped' as const,
    },
    {
      name: 'Volume tier (10+ seats)',
      detail: 'Considered, but this subscription has fewer than 10 seats.',
      outcome: 'skipped' as const,
    },
  ];
  const amountPaid =
    seed.paid === 'full' ? totals.total : seed.paid === 'partial' ? Math.round(totals.total * 0.4 * 100) / 100 : 0;
  return {
    id: 1042 + index,
    invoice_number: `INV-${String(1042 + index).padStart(5, '0')}`,
    customerId: subscription.customerId,
    subscriptionId: subscription.id,
    period_start: addDays(seed.issuedDaysAgo - 30),
    period_end: addDays(seed.issuedDaysAgo - 1),
    issued_date: addDays(-seed.issuedDaysAgo),
    due_date: addDays(seed.dueInDays),
    status: seed.status,
    lines,
    ...totals,
    amount_paid: amountPaid,
    trace,
    sent_at: seed.status === 'Draft' ? null : `${addDays(-seed.issuedDaysAgo)}T09:15:00.000Z`,
  };
});

export const payments: Payment[] = invoices
  .filter((invoice) => invoice.amount_paid > 0)
  .map((invoice, index) => ({
    id: 2001 + index,
    invoiceId: invoice.id,
    customerId: invoice.customerId,
    amount: invoice.amount_paid,
    payment_method: ['UPI', 'Bank transfer', 'Card'][index % 3],
    status: 'Received',
    transaction_date: `${addDays(-Math.max(0, Math.round((Date.now() - new Date(invoice.issued_date).getTime()) / 86_400_000) - 2))}T14:${String(20 + (index % 30)).padStart(2, '0')}:00.000Z`,
    notes: index % 4 === 0 ? 'Reference matched from bank statement' : '',
  }));

export const discounts: Discount[] = [
  { id: 1, name: 'Annual prepay', type: 'percent', value: 15, scope: 'Yearly Fixed', min_amount: 0, starts: '2026-01-01', ends: '2026-12-31', usage_limit: 200, used: 42, active: true },
  { id: 2, name: 'Odoo launch credit', type: 'fixed', value: 500, scope: 'ERP License', min_amount: 5000, starts: '2026-06-01', ends: '2026-12-31', usage_limit: 100, used: 18, active: true },
  { id: 3, name: 'Partner programme', type: 'percent', value: 20, scope: 'All plans', min_amount: 0, starts: '2026-02-01', ends: '2027-03-31', usage_limit: 50, used: 7, active: true },
  { id: 4, name: 'Winback 2025', type: 'percent', value: 10, scope: 'Monthly Flex', min_amount: 0, starts: '2025-01-01', ends: '2025-12-31', usage_limit: 150, used: 96, active: false },
];

export const articles: KBArticle[] = [
  {
    id: 1,
    title: 'Pro plan details',
    category: 'Plan',
    status: 'Active',
    updated: addDays(-1),
    used: 142,
    body: 'The Pro plan includes the ERP licence, two support hours per month and cloud hosting in your chosen region. Billing runs on the same day each period. You can add seats at any time; the new seats are prorated for the current period. Annual plans receive a 15% prepay discount.',
  },
  {
    id: 2,
    title: 'Seat changes',
    category: 'Plan',
    status: 'Active',
    updated: addDays(-3),
    used: 96,
    body: 'To add seats, open My subscriptions, choose the subscription and select Add seats. Enter the number of seats and confirm. The change takes effect immediately and the next invoice includes the prorated amount. Removing seats takes effect at the end of the current period.',
  },
  {
    id: 3,
    title: 'Closing your subscription',
    category: 'Billing',
    status: 'Active',
    updated: addDays(-6),
    used: 74,
    body: 'You can close a subscription from My subscriptions if the plan allows early close. Access continues until the end of the paid period. If the plan does not allow early close, the subscription closes automatically on its expiry date. Closing does not delete your invoices or data exports.',
  },
  {
    id: 4,
    title: 'Invoices and billing',
    category: 'Billing',
    status: 'Active',
    updated: addDays(-2),
    used: 210,
    body: 'Invoices are issued at the start of each billing period and are due according to your payment terms. You can download any invoice from the Invoices page. If an invoice is overdue, the status pill turns red and a reminder is sent to your billing email. Contact support if a payment is not reflected after 24 hours.',
  },
  {
    id: 5,
    title: 'Refund policy',
    category: 'Billing',
    status: 'Draft',
    updated: addDays(-14),
    used: 0,
    body: 'Refunds are reviewed case by case. Unused full months may be refunded when a subscription is closed within seven days of a renewal. Usage-based charges and onboarding services are non-refundable. Approved refunds are returned to the original payment method within ten working days.',
  },
  {
    id: 6,
    title: 'Payment methods',
    category: 'Billing',
    status: 'Active',
    updated: addDays(-4),
    used: 133,
    body: 'Brightloop accepts UPI, cards and bank transfers. Bank transfers are matched to invoices by reference number, so include the invoice number in the transfer note. Card payments are recorded immediately. If a payment fails, the invoice stays open and you can retry from the invoice page.',
  },
  {
    id: 7,
    title: 'Pausing a subscription',
    category: 'Plan',
    status: 'Active',
    updated: addDays(-8),
    used: 61,
    body: 'Plans that allow pausing can be paused from My subscriptions. While paused, no invoices are issued and access is limited to read-only data. Billing resumes on the date you choose, or when you resume manually. Yearly Fixed plans cannot be paused.',
  },
  {
    id: 8,
    title: 'Contacting support',
    category: 'Support',
    status: 'Active',
    updated: addDays(-1),
    used: 88,
    body: 'This assistant answers from our support articles. If it cannot help, create a support ticket and the team will reply by email within one working day. Priority Support customers receive a four-hour response window during business hours.',
  },
  {
    id: 9,
    title: 'Student pricing',
    category: 'Plan',
    status: 'Draft',
    updated: addDays(-5),
    used: 0,
    body: 'Student pricing is not published yet. This draft is waiting for finance approval before the assistant can use it.',
  },
];

export const questions: UnansweredQuestion[] = [
  { id: 1, question: 'Do you offer student pricing?', asks: 3, last_asked: addDays(-1), status: 'open' },
  { id: 2, question: 'Can I pay by UPI?', asks: 2, last_asked: addDays(-2), status: 'open' },
  { id: 3, question: 'Do you support multi-currency billing?', asks: 1, last_asked: addDays(-4), status: 'open' },
  { id: 4, question: "Can I add my company's GST number to an invoice?", asks: 1, last_asked: addDays(-6), status: 'open' },
];

export const tickets: Ticket[] = [
  { id: 1, ticket_number: 'SUP-088', customerId: 1, subject: 'Seat change on annual plan', status: 'Open', created_at: addDays(-1) },
  { id: 2, ticket_number: 'SUP-087', customerId: 4, subject: 'Payment not reflected on INV-01056', status: 'In progress', created_at: addDays(-2) },
  { id: 3, ticket_number: 'SUP-086', customerId: 7, subject: 'Request for a GST invoice', status: 'Resolved', created_at: addDays(-5) },
];

export const staff: StaffUser[] = [
  { id: 1, name: 'Brightloop Administrator', email: 'admin@brightloop.local', role: 'admin', active: true, last_active: addDays(0) },
  { id: 2, name: 'Brightloop Staff', email: 'staff@brightloop.local', role: 'staff', active: true, last_active: addDays(0) },
  { id: 3, name: 'Meera Nair', email: 'finance@brightloop.local', role: 'admin', active: true, last_active: addDays(-1) },
  { id: 4, name: 'Aditya Verma', email: 'support@brightloop.local', role: 'staff', active: true, last_active: addDays(-2) },
  { id: 5, name: 'Rhea Kapoor', email: 'ops@brightloop.local', role: 'staff', active: false, last_active: addDays(-38) },
];

export const outbox: OutboxEmail[] = [
  { id: 1, recipient: 'priya@northwind.test', subject: 'Invoice INV-01043 is ready', body: 'Your invoice for the current period is ready. Total: ₹2,430.80. Due 6 Nov 2026.', status: 'Sent', created_at: addDays(0), sent_at: addDays(0) },
  { id: 2, recipient: 'arjun@contoso.test', subject: 'Your Brightloop password was reset', body: 'A password reset link was requested for your account. The link expires in 30 minutes.', status: 'Sent', created_at: addDays(-1), sent_at: addDays(-1) },
  { id: 3, recipient: 'sara@kestrel.test', subject: 'Reminder: invoice INV-01058 is overdue', body: 'Invoice INV-01058 is past its due date. Please pay or contact support.', status: 'Sent', created_at: addDays(-1), sent_at: addDays(-1) },
  { id: 4, recipient: 'kabir@verdant.test', subject: 'Welcome to Brightloop', body: 'Your account is ready. Here are three ways to get started with your subscription.', status: 'Queued', created_at: addDays(0), sent_at: null },
  { id: 5, recipient: 'ops@brightloop.local', subject: 'Billing run completed', body: 'The nightly billing run created 18 invoices and skipped 4 subscriptions.', status: 'Failed', created_at: addDays(-2), sent_at: null },
];

export const leakage: LeakageFinding[] = [
  { id: 1, type: 'Missed billing', customerId: 1, detail: 'Active subscription has no invoice for the October cycle.', amount: 2430.8, status: 'Open' },
  { id: 2, type: 'Wrong discount', customerId: 2, detail: 'Partner 20% applied twice on INV-01046.', amount: 1320, status: 'Open' },
  { id: 3, type: 'Duplicate charge', customerId: 3, detail: 'Two payments recorded for INV-01051.', amount: 2950, status: 'Open' },
  { id: 4, type: 'Unreconciled payment', customerId: 5, detail: 'Bank credit of ₹4,200.00 is not matched to an invoice.', amount: 4200, status: 'Open' },
  { id: 5, type: 'Expired discount', customerId: 6, detail: 'Winback 10% applied after its end date.', amount: 780, status: 'Recovered' },
  { id: 6, type: 'Missed billing', customerId: 8, detail: 'Weekly Trial converted to Monthly Flex without an invoice.', amount: 1830, status: 'Ignored' },
];

export const opsRuns: OpsRun[] = [
  { id: 1, started_at: `${addDays(0)}T02:00:00.000Z`, status: 'Succeeded', created: 18, skipped: 4, failed: 0, duration_ms: 8420 },
  { id: 2, started_at: `${addDays(-1)}T02:00:00.000Z`, status: 'Succeeded', created: 21, skipped: 3, failed: 1, duration_ms: 9110 },
  { id: 3, started_at: `${addDays(-2)}T02:00:00.000Z`, status: 'Failed', created: 0, skipped: 0, failed: 1, duration_ms: 1240 },
  { id: 4, started_at: `${addDays(-3)}T02:00:00.000Z`, status: 'Succeeded', created: 16, skipped: 6, failed: 0, duration_ms: 7760 },
  { id: 5, started_at: `${addDays(-4)}T02:00:00.000Z`, status: 'Succeeded', created: 19, skipped: 2, failed: 0, duration_ms: 8030 },
  { id: 6, started_at: `${addDays(-5)}T02:00:00.000Z`, status: 'Succeeded', created: 22, skipped: 1, failed: 0, duration_ms: 8890 },
];

export const revenueSeries = [
  { label: 'Mar', value: 520000 },
  { label: 'Apr', value: 581000 },
  { label: 'May', value: 612000 },
  { label: 'Jun', value: 594000 },
  { label: 'Jul', value: 681000 },
  { label: 'Aug', value: 724000 },
  { label: 'Sep', value: 791000 },
  { label: 'Oct', value: 842000 },
];

export function buildInitialState(): AppState {
  return {
    customers,
    taxes,
    products,
    plans,
    templates,
    subscriptions,
    invoices,
    payments,
    discounts,
    articles,
    questions,
    tickets,
    staff,
    outbox,
    leakage,
    opsRuns,
    notifications: [
      { id: 1, title: 'Payment received', detail: '₹2,430.80 recorded for INV-01057.', time: addDays(0), read: false, tone: 'good' },
      { id: 2, title: 'Invoice overdue', detail: 'INV-01050 for Fabrikam Works is 8 days overdue.', time: addDays(0), read: false, tone: 'danger' },
      { id: 3, title: 'Renewal due soon', detail: 'Meridian Health renews in 3 days.', time: addDays(-1), read: false, tone: 'warn' },
      { id: 4, title: 'Support ticket created', detail: 'SUP-088 from the chatbot needs a reply.', time: addDays(-1), read: true, tone: 'info' },
      { id: 5, title: 'Billing run completed', detail: '18 invoices created, 4 subscriptions skipped.', time: addDays(-1), read: true, tone: 'good' },
    ],
    chat: [
      {
        id: 1,
        role: 'bot',
        text: 'Hi, I can help with plans, billing and your invoices.',
        suggestions: ["What's in the Pro plan?", 'How do I add seats?', 'When is my next invoice?'],
        created_at: new Date().toISOString(),
      },
    ],
    chatUnread: 1,
    chatOpen: false,
    theme: 'light',
    session: null,
  };
}

export const seededRevenueSeries = revenueSeries;
export const seededNow = iso(now);
export const seededPlanById = planById;
