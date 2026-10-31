import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react';
import { addDays, iso } from './format';
import { buildInitialState, priceLine } from './seed';
import type {
  AppState,
  ArticleStatus,
  ChatMessage,
  Customer,
  Discount,
  Invoice,
  InvoiceStatus,
  KBArticle,
  Plan,
  PlanPeriod,
  Product,
  ProductVariant,
  QuotationTemplate,
  Role,
  SessionUser,
  StaffUser,
  Subscription,
  SubscriptionStatus,
  Ticket,
} from './types';

const STORAGE_KEY = 'brightloop.demo.v1';

const demoUsers: Record<Role, SessionUser> = {
  admin: {
    id: 1,
    name: 'Aarav Shah',
    email: 'admin@brightloop.local',
    role: 'admin',
    customerId: null,
    title: 'Finance lead',
  },
  staff: {
    id: 2,
    name: 'Diya Raman',
    email: 'staff@brightloop.local',
    role: 'staff',
    customerId: null,
    title: 'Account manager',
  },
  customer: {
    id: 3,
    name: 'Priya Menon',
    email: 'priya@northwind.test',
    role: 'customer',
    customerId: 1,
    title: 'Northwind Labs',
  },
};

function loadState(): AppState {
  const base = buildInitialState();
  if (typeof window === 'undefined') return base;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw) as Partial<AppState>;
    return {
      ...base,
      ...saved,
      chat: saved.chat?.length ? saved.chat : base.chat,
      notifications: saved.notifications ?? base.notifications,
      theme: saved.theme === 'dark' ? 'dark' : 'light',
      session: saved.session ?? null,
    };
  } catch {
    return base;
  }
}

type Action =
  | { type: 'login'; role: Role }
  | { type: 'logout' }
  | { type: 'set-theme'; theme: 'light' | 'dark' }
  | { type: 'read-notifications' }
  | { type: 'transition'; id: number; to: SubscriptionStatus; reason: string; actor: string; nextBillingDate?: string | null }
  | { type: 'renew'; id: number; actor: string }
  | { type: 'payment'; invoiceId: number; amount: number; method: string; notes: string }
  | { type: 'confirm-invoice'; id: number }
  | { type: 'cancel-invoice'; id: number; reason: string }
  | { type: 'send-invoice'; id: number; recipient: string }
  | { type: 'create-subscription'; subscription: Subscription }
  | { type: 'create-product'; product: Product }
  | { type: 'update-product'; id: number; patch: Partial<Product> }
  | { type: 'add-variant'; productId: number; variant: ProductVariant }
  | { type: 'create-plan'; plan: Plan }
  | { type: 'toggle-plan-flag'; id: number; flag: keyof Pick<Plan, 'auto_close' | 'allow_early_close' | 'allow_pause' | 'allow_renew'> }
  | { type: 'create-template'; template: QuotationTemplate }
  | { type: 'create-discount'; discount: Discount }
  | { type: 'toggle-discount'; id: number }
  | { type: 'save-article'; article: KBArticle }
  | { type: 'toggle-article'; id: number }
  | { type: 'answer-question'; id: number; status: 'answered' | 'dismissed' }
  | { type: 'create-ticket'; ticket: Ticket }
  | { type: 'add-staff'; user: StaffUser }
  | { type: 'toggle-staff'; id: number }
  | { type: 'billing-run'; run: AppState['opsRuns'][number]; invoices: Invoice[]; updated: Subscription[] }
  | { type: 'recover-leakage'; id: number }
  | { type: 'chat-append'; message: ChatMessage }
  | { type: 'chat-feedback'; id: number; feedback: 'up' | 'down'; reason?: string }
  | { type: 'chat-streamed'; id: number }
  | { type: 'chat-open' }
  | { type: 'chat-close' }
  | { type: 'chat-clear' }
  | { type: 'chat-unread'; count: number }
  | { type: 'notify'; title: string; detail: string; tone: 'info' | 'good' | 'warn' | 'danger' }
  | { type: 'reset' };

function appendHistory(
  subscription: Subscription,
  to: SubscriptionStatus,
  action: string,
  reason: string,
  actor: string,
): Subscription {
  const entry = {
    id: Date.now(),
    from: subscription.status,
    to,
    action,
    reason,
    actor,
    changed_at: new Date().toISOString(),
  };
  return {
    ...subscription,
    status: to,
    history: [...subscription.history, entry],
    updated_at: new Date().toISOString(),
  };
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'login':
      return { ...state, session: demoUsers[action.role] };
    case 'logout':
      return { ...state, session: null, chatOpen: false };
    case 'set-theme':
      return { ...state, theme: action.theme };
    case 'read-notifications':
      return { ...state, notifications: state.notifications.map((item) => ({ ...item, read: true })) };
    case 'transition': {
      const target = state.subscriptions.find((item) => item.id === action.id);
      if (!target) return state;
      const updated = appendHistory(target, action.to, action.to.toLowerCase(), action.reason, action.actor);
      updated.paused_at = action.to === 'Paused' ? iso(new Date()) : action.to === 'Active' ? null : target.paused_at;
      updated.next_billing_date =
        action.nextBillingDate !== undefined
          ? action.nextBillingDate
          : action.to === 'Active'
            ? target.next_billing_date ?? addDays(30)
            : null;
      if (action.to === 'Closed') updated.expiry_date = iso(new Date());
      return {
        ...state,
        subscriptions: state.subscriptions.map((item) => (item.id === action.id ? updated : item)),
        notifications: [
          {
            id: Date.now(),
            title: 'Subscription updated',
            detail: `${target.subscription_number} is now ${action.to.toLowerCase()}.`,
            time: iso(new Date()),
            read: false,
            tone: action.to === 'Closed' ? 'warn' : 'good',
          },
          ...state.notifications,
        ],
      };
    }
    case 'renew': {
      const target = state.subscriptions.find((item) => item.id === action.id);
      if (!target) return state;
      const plan = state.plans.find((item) => item.id === target.planId);
      const days = plan?.period === 'yearly' ? 365 : plan?.period === 'weekly' ? 7 : plan?.period === 'daily' ? 1 : 30;
      const updated = appendHistory(target, 'Active', 'renew', 'Renewed from portal', action.actor);
      updated.next_billing_date = addDays(days);
      updated.expiry_date = addDays(days);
      return {
        ...state,
        subscriptions: state.subscriptions.map((item) => (item.id === action.id ? updated : item)),
        notifications: [
          {
            id: Date.now(),
            title: 'Subscription renewed',
            detail: `${target.subscription_number} renewed for another ${days} days.`,
            time: iso(new Date()),
            read: false,
            tone: 'good',
          },
          ...state.notifications,
        ],
      };
    }
    case 'payment': {
      const invoice = state.invoices.find((item) => item.id === action.invoiceId);
      if (!invoice) return state;
      const amountPaid = Math.min(invoice.total, invoice.amount_paid + action.amount);
      const fullyPaid = amountPaid >= invoice.total - 0.01;
      const updated: Invoice = {
        ...invoice,
        amount_paid: Math.round(amountPaid * 100) / 100,
        status: fullyPaid ? 'Paid' : invoice.status,
      };
      const payment = {
        id: Date.now(),
        invoiceId: invoice.id,
        customerId: invoice.customerId,
        amount: action.amount,
        payment_method: action.method,
        status: 'Received' as const,
        transaction_date: new Date().toISOString(),
        notes: action.notes,
      };
      const customer = state.customers.find((item) => item.id === invoice.customerId);
      return {
        ...state,
        invoices: state.invoices.map((item) => (item.id === invoice.id ? updated : item)),
        payments: [payment, ...state.payments],
        outbox: [
          {
            id: Date.now(),
            recipient: customer?.email ?? 'customer@brightloop.local',
            subject: `Payment received for ${invoice.invoice_number}`,
            body: `We received ₹${action.amount.toFixed(2)} by ${action.method}. Thank you.`,
            status: 'Sent',
            created_at: new Date().toISOString(),
            sent_at: new Date().toISOString(),
          },
          ...state.outbox,
        ],
        notifications: [
          {
            id: Date.now() + 1,
            title: fullyPaid ? 'Invoice paid' : 'Partial payment recorded',
            detail: `${invoice.invoice_number} · ₹${action.amount.toFixed(2)} by ${action.method}.`,
            time: iso(new Date()),
            read: false,
            tone: 'good',
          },
          ...state.notifications,
        ],
      };
    }
    case 'confirm-invoice': {
      const invoice = state.invoices.find((item) => item.id === action.id);
      if (!invoice) return state;
      return {
        ...state,
        invoices: state.invoices.map((item) =>
          item.id === action.id ? { ...item, status: 'Confirmed' as InvoiceStatus, issued_date: iso(new Date()) } : item,
        ),
        notifications: [
          {
            id: Date.now(),
            title: 'Invoice confirmed',
            detail: `${invoice.invoice_number} is ready to send.`,
            time: iso(new Date()),
            read: false,
            tone: 'info',
          },
          ...state.notifications,
        ],
      };
    }
    case 'cancel-invoice': {
      const invoice = state.invoices.find((item) => item.id === action.id);
      if (!invoice) return state;
      return {
        ...state,
        invoices: state.invoices.map((item) =>
          item.id === action.id ? { ...item, status: 'Cancelled' as InvoiceStatus } : item,
        ),
        notifications: [
          {
            id: Date.now(),
            title: 'Invoice cancelled',
            detail: `${invoice.invoice_number}: ${action.reason || 'no reason given'}.`,
            time: iso(new Date()),
            read: false,
            tone: 'warn',
          },
          ...state.notifications,
        ],
      };
    }
    case 'send-invoice': {
      const invoice = state.invoices.find((item) => item.id === action.id);
      if (!invoice) return state;
      return {
        ...state,
        invoices: state.invoices.map((item) =>
          item.id === action.id ? { ...item, sent_at: new Date().toISOString() } : item,
        ),
        outbox: [
          {
            id: Date.now(),
            recipient: action.recipient,
            subject: `Invoice ${invoice.invoice_number} from Brightloop`,
            body: `Your invoice ${invoice.invoice_number} is attached. Total due: ₹${invoice.total.toFixed(2)}.`,
            status: 'Sent',
            created_at: new Date().toISOString(),
            sent_at: new Date().toISOString(),
          },
          ...state.outbox,
        ],
        notifications: [
          {
            id: Date.now() + 1,
            title: 'Invoice sent',
            detail: `${invoice.invoice_number} sent to ${action.recipient}.`,
            time: iso(new Date()),
            read: false,
            tone: 'info',
          },
          ...state.notifications,
        ],
      };
    }
    case 'create-subscription':
      return {
        ...state,
        subscriptions: [action.subscription, ...state.subscriptions],
        notifications: [
          {
            id: Date.now(),
            title: 'Subscription created',
            detail: `${action.subscription.subscription_number} is in draft.`,
            time: iso(new Date()),
            read: false,
            tone: 'info',
          },
          ...state.notifications,
        ],
      };
    case 'create-product':
      return { ...state, products: [action.product, ...state.products] };
    case 'update-product':
      return {
        ...state,
        products: state.products.map((item) => (item.id === action.id ? { ...item, ...action.patch } : item)),
      };
    case 'add-variant':
      return {
        ...state,
        products: state.products.map((item) =>
          item.id === action.productId ? { ...item, variants: [...item.variants, action.variant] } : item,
        ),
      };
    case 'create-plan':
      return { ...state, plans: [action.plan, ...state.plans] };
    case 'toggle-plan-flag':
      return {
        ...state,
        plans: state.plans.map((item) =>
          item.id === action.id ? { ...item, [action.flag]: !item[action.flag] } : item,
        ),
      };
    case 'create-template':
      return { ...state, templates: [action.template, ...state.templates] };
    case 'create-discount':
      return { ...state, discounts: [action.discount, ...state.discounts] };
    case 'toggle-discount':
      return {
        ...state,
        discounts: state.discounts.map((item) =>
          item.id === action.id ? { ...item, active: !item.active } : item,
        ),
      };
    case 'save-article': {
      const exists = state.articles.some((item) => item.id === action.article.id);
      return {
        ...state,
        articles: exists
          ? state.articles.map((item) => (item.id === action.article.id ? action.article : item))
          : [action.article, ...state.articles],
      };
    }
    case 'toggle-article':
      return {
        ...state,
        articles: state.articles.map((item) =>
          item.id === action.id
            ? { ...item, status: (item.status === 'Active' ? 'Draft' : 'Active') as ArticleStatus }
            : item,
        ),
      };
    case 'answer-question':
      return {
        ...state,
        questions: state.questions.map((item) =>
          item.id === action.id ? { ...item, status: action.status } : item,
        ),
      };
    case 'create-ticket':
      return {
        ...state,
        tickets: [action.ticket, ...state.tickets],
        notifications: [
          {
            id: Date.now(),
            title: 'Support ticket created',
            detail: `${action.ticket.ticket_number} from the chatbot.`,
            time: iso(new Date()),
            read: false,
            tone: 'info',
          },
          ...state.notifications,
        ],
      };
    case 'add-staff':
      return { ...state, staff: [...state.staff, action.user] };
    case 'toggle-staff':
      return {
        ...state,
        staff: state.staff.map((item) =>
          item.id === action.id ? { ...item, active: !item.active } : item,
        ),
      };
    case 'billing-run':
      return {
        ...state,
        opsRuns: [action.run, ...state.opsRuns],
        invoices: [...action.invoices, ...state.invoices],
        subscriptions: state.subscriptions.map(
          (item) => action.updated.find((updated) => updated.id === item.id) ?? item,
        ),
        notifications: [
          {
            id: Date.now(),
            title: 'Billing run completed',
            detail: `${action.run.created} invoices created, ${action.run.skipped} skipped.`,
            time: iso(new Date()),
            read: false,
            tone: 'good',
          },
          ...state.notifications,
        ],
      };
    case 'recover-leakage': {
      const finding = state.leakage.find((item) => item.id === action.id);
      return {
        ...state,
        leakage: state.leakage.map((item) =>
          item.id === action.id ? { ...item, status: 'Recovered' } : item,
        ),
        notifications: finding
          ? [
              {
                id: Date.now(),
                title: 'Leakage recovered',
                detail: `${finding.type} · ₹${finding.amount.toFixed(2)} queued for recovery.`,
                time: iso(new Date()),
                read: false,
                tone: 'good',
              },
              ...state.notifications,
            ]
          : state.notifications,
      };
    }
    case 'chat-append':
      return { ...state, chat: [...state.chat, action.message] };
    case 'chat-feedback':
      return {
        ...state,
        chat: state.chat.map((item) =>
          item.id === action.id
            ? { ...item, feedback: action.feedback, feedbackReason: action.reason ?? item.feedbackReason }
            : item,
        ),
      };
    case 'chat-streamed':
      return {
        ...state,
        chat: state.chat.map((item) => (item.id === action.id ? { ...item, streaming: false } : item)),
      };
    case 'chat-open':
      return { ...state, chatOpen: true, chatUnread: 0 };
    case 'chat-close':
      return { ...state, chatOpen: false };
    case 'chat-clear':
      return {
        ...state,
        chat: [
          {
            id: Date.now(),
            role: 'bot',
            text: 'Hi, I can help with plans, billing and your invoices.',
            suggestions: ["What's in the Pro plan?", 'How do I add seats?', 'When is my next invoice?'],
            created_at: new Date().toISOString(),
          },
        ],
      };
    case 'chat-unread':
      return { ...state, chatUnread: action.count };
    case 'notify':
      return {
        ...state,
        notifications: [
          {
            id: Date.now(),
            title: action.title,
            detail: action.detail,
            time: iso(new Date()),
            read: false,
            tone: action.tone,
          },
          ...state.notifications,
        ],
      };
    case 'reset':
      return { ...buildInitialState(), theme: state.theme, session: state.session };
    default:
      return state;
  }
}

export interface CreateSubscriptionInput {
  customerId: number;
  planId: number;
  templateId: number | null;
  startDate: string;
  expiryDate: string | null;
  paymentTerms: string;
  lines?: Array<{ productId: number; variantId: number | null; quantity: number }>;
}

export interface ActionResult {
  ok: boolean;
  message: string;
  data?: unknown;
}

interface StoreValue {
  state: AppState;
  login: (role: Role) => void;
  logout: () => void;
  setTheme: (theme: 'light' | 'dark') => void;
  toggleTheme: () => void;
  markNotificationsRead: () => void;
  transitionSubscription: (id: number, to: SubscriptionStatus, reason?: string) => ActionResult;
  renewSubscription: (id: number) => ActionResult;
  recordPayment: (invoiceId: number, amount: number, method: string, notes: string) => ActionResult;
  confirmInvoice: (id: number) => void;
  cancelInvoice: (id: number, reason: string) => void;
  sendInvoice: (id: number) => void;
  createSubscription: (input: CreateSubscriptionInput) => ActionResult;
  createProduct: (input: Omit<Product, 'id' | 'variants'>) => Product;
  updateProduct: (id: number, patch: Partial<Product>) => void;
  addVariant: (productId: number, variant: Omit<ProductVariant, 'id'>) => void;
  createPlan: (input: Omit<Plan, 'id'>) => Plan;
  togglePlanFlag: (id: number, flag: keyof Pick<Plan, 'auto_close' | 'allow_early_close' | 'allow_pause' | 'allow_renew'>) => void;
  createTemplate: (input: Omit<QuotationTemplate, 'id'>) => QuotationTemplate;
  createDiscount: (input: Omit<Discount, 'id' | 'used' | 'active'>) => void;
  toggleDiscount: (id: number) => void;
  saveArticle: (article: Omit<KBArticle, 'id' | 'updated' | 'used'> & { id?: number }) => KBArticle;
  toggleArticle: (id: number) => void;
  answerQuestion: (id: number, status: 'answered' | 'dismissed') => void;
  createTicket: (subject: string, customerId?: number) => Ticket;
  addStaff: (input: { name: string; email: string; role: 'admin' | 'staff' }) => void;
  toggleStaff: (id: number) => void;
  runBilling: () => { created: number; skipped: number };
  recoverLeakage: (id: number) => void;
  appendChat: (message: Omit<ChatMessage, 'id' | 'created_at'>) => ChatMessage;
  setChatFeedback: (id: number, feedback: 'up' | 'down', reason?: string) => void;
  markChatStreamed: (id: number) => void;
  openChat: () => void;
  closeChat: () => void;
  clearChat: () => void;
  setChatUnread: (count: number) => void;
  notify: (title: string, detail: string, tone: 'info' | 'good' | 'warn' | 'danger') => void;
  resetDemo: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    document.documentElement.dataset.theme = state.theme;
    document.documentElement.style.colorScheme = state.theme;
  }, [state.theme]);

  const login = useCallback((role: Role) => dispatch({ type: 'login', role }), []);
  const logout = useCallback(() => dispatch({ type: 'logout' }), []);
  const setTheme = useCallback((theme: 'light' | 'dark') => dispatch({ type: 'set-theme', theme }), []);
  const toggleTheme = useCallback(
    () => dispatch({ type: 'set-theme', theme: state.theme === 'light' ? 'dark' : 'light' }),
    [state.theme],
  );
  const markNotificationsRead = useCallback(() => dispatch({ type: 'read-notifications' }), []);

  const transitionSubscription = useCallback(
    (id: number, to: SubscriptionStatus, reason = 'Status changed from the workspace'): ActionResult => {
      const subscription = state.subscriptions.find((item) => item.id === id);
      const plan = subscription ? state.plans.find((item) => item.id === subscription.planId) : undefined;
      if (!subscription || !plan) return { ok: false, message: 'Subscription was not found.' };
      if (to === 'Paused' && !plan.allow_pause) {
        return { ok: false, message: `${plan.name} does not allow pausing.` };
      }
      if (to === 'Closed' && !plan.allow_early_close) {
        return { ok: false, message: `${plan.name} closes automatically at expiry and cannot be closed early.` };
      }
      dispatch({
        type: 'transition',
        id,
        to,
        reason,
        actor: state.session?.name ?? 'Brightloop Staff',
        nextBillingDate: to === 'Paused' || to === 'Closed' ? null : undefined,
      });
      return { ok: true, message: `${subscription.subscription_number} is now ${to.toLowerCase()}.` };
    },
    [state.subscriptions, state.plans, state.session],
  );

  const renewSubscription = useCallback(
    (id: number): ActionResult => {
      const subscription = state.subscriptions.find((item) => item.id === id);
      const plan = subscription ? state.plans.find((item) => item.id === subscription.planId) : undefined;
      if (!subscription || !plan) return { ok: false, message: 'Subscription was not found.' };
      if (!plan.allow_renew) return { ok: false, message: `${plan.name} does not allow renewal.` };
      dispatch({ type: 'renew', id, actor: state.session?.name ?? 'Brightloop Staff' });
      return { ok: true, message: `${subscription.subscription_number} renewed.` };
    },
    [state.subscriptions, state.plans, state.session],
  );

  const recordPayment = useCallback(
    (invoiceId: number, amount: number, method: string, notes: string): ActionResult => {
      const invoice = state.invoices.find((item) => item.id === invoiceId);
      if (!invoice) return { ok: false, message: 'Invoice was not found.' };
      if (invoice.status === 'Paid') return { ok: false, message: 'Invoice is already paid.' };
      if (invoice.status === 'Cancelled') return { ok: false, message: 'Cancelled invoices cannot take payments.' };
      const outstanding = invoice.total - invoice.amount_paid;
      if (amount <= 0) return { ok: false, message: 'Enter an amount greater than zero.' };
      if (amount > outstanding + 0.001) {
        return { ok: false, message: `Amount exceeds the outstanding balance of ₹${outstanding.toFixed(2)}.` };
      }
      dispatch({ type: 'payment', invoiceId, amount, method, notes });
      return { ok: true, message: `Payment of ₹${amount.toFixed(2)} recorded.` };
    },
    [state.invoices],
  );

  const confirmInvoice = useCallback((id: number) => dispatch({ type: 'confirm-invoice', id }), []);
  const cancelInvoice = useCallback(
    (id: number, reason: string) => dispatch({ type: 'cancel-invoice', id, reason }),
    [],
  );
  const sendInvoice = useCallback(
    (id: number) => {
      const invoice = state.invoices.find((item) => item.id === id);
      const customer = invoice ? state.customers.find((item) => item.id === invoice.customerId) : undefined;
      dispatch({ type: 'send-invoice', id, recipient: customer?.email ?? 'customer@brightloop.local' });
    },
    [state.invoices, state.customers],
  );

  const createSubscription = useCallback(
    (input: CreateSubscriptionInput): ActionResult => {
      const plan = state.plans.find((item) => item.id === input.planId);
      if (!plan) return { ok: false, message: 'Plan was not found.' };
      const rawLines =
        input.lines ??
        (input.templateId
          ? state.templates
              .find((item) => item.id === input.templateId)
              ?.lines.map((line) => ({
                productId: line.productId,
                variantId: line.variantId ?? null,
                quantity: line.quantity,
              })) ?? []
          : []);
      if (!rawLines.length) return { ok: false, message: 'Add at least one product line.' };
      const nextId = Math.max(...state.subscriptions.map((item) => item.id), 100) + 1;
      const lines = rawLines.map((line, index) => ({
        ...priceLine(line.productId, line.variantId, line.quantity),
        id: nextId * 10 + index,
      }));
      const now = new Date().toISOString();
      const subscription: Subscription = {
        id: nextId,
        subscription_number: `SUB-${String(nextId).padStart(6, '0')}`,
        customerId: input.customerId,
        planId: input.planId,
        templateId: input.templateId,
        status: 'Draft',
        start_date: input.startDate,
        expiry_date: input.expiryDate,
        next_billing_date: null,
        paused_at: null,
        payment_terms: input.paymentTerms,
        lines,
        history: [
          {
            id: Date.now(),
            from: null,
            to: 'Draft',
            action: 'created',
            reason: input.templateId ? 'Created from quotation template' : 'Created from the workspace',
            actor: state.session?.name ?? 'Brightloop Staff',
            changed_at: now,
          },
        ],
        created_at: now,
        updated_at: now,
      };
      dispatch({ type: 'create-subscription', subscription });
      return { ok: true, message: `${subscription.subscription_number} created in draft.`, data: subscription };
    },
    [state.plans, state.templates, state.subscriptions, state.session],
  );

  const createProduct = useCallback(
    (input: Omit<Product, 'id' | 'variants'>): Product => {
      const product: Product = {
        ...input,
        id: Math.max(...state.products.map((item) => item.id), 0) + 1,
        variants: [],
      };
      dispatch({ type: 'create-product', product });
      return product;
    },
    [state.products],
  );

  const updateProduct = useCallback(
    (id: number, patch: Partial<Product>) => dispatch({ type: 'update-product', id, patch }),
    [],
  );

  const addVariant = useCallback(
    (productId: number, variant: Omit<ProductVariant, 'id'>) => {
      const id = Math.max(...state.products.flatMap((item) => item.variants.map((v) => v.id)), 0) + 1;
      dispatch({ type: 'add-variant', productId, variant: { ...variant, id } });
    },
    [state.products],
  );

  const createPlan = useCallback(
    (input: Omit<Plan, 'id'>): Plan => {
      const plan: Plan = { ...input, id: Math.max(...state.plans.map((item) => item.id), 0) + 1 };
      dispatch({ type: 'create-plan', plan });
      return plan;
    },
    [state.plans],
  );

  const togglePlanFlag = useCallback(
    (id: number, flag: keyof Pick<Plan, 'auto_close' | 'allow_early_close' | 'allow_pause' | 'allow_renew'>) =>
      dispatch({ type: 'toggle-plan-flag', id, flag }),
    [],
  );

  const createTemplate = useCallback(
    (input: Omit<QuotationTemplate, 'id'>): QuotationTemplate => {
      const template: QuotationTemplate = {
        ...input,
        id: Math.max(...state.templates.map((item) => item.id), 0) + 1,
      };
      dispatch({ type: 'create-template', template });
      return template;
    },
    [state.templates],
  );

  const createDiscount = useCallback(
    (input: Omit<Discount, 'id' | 'used' | 'active'>) => {
      const discount: Discount = {
        ...input,
        id: Math.max(...state.discounts.map((item) => item.id), 0) + 1,
        used: 0,
        active: true,
      };
      dispatch({ type: 'create-discount', discount });
    },
    [state.discounts],
  );

  const toggleDiscount = useCallback((id: number) => dispatch({ type: 'toggle-discount', id }), []);

  const saveArticle = useCallback(
    (article: Omit<KBArticle, 'id' | 'updated' | 'used'> & { id?: number }): KBArticle => {
      const saved: KBArticle = {
        ...article,
        id: article.id ?? Math.max(...state.articles.map((item) => item.id), 0) + 1,
        updated: iso(new Date()),
        used: article.id ? state.articles.find((item) => item.id === article.id)?.used ?? 0 : 0,
      };
      dispatch({ type: 'save-article', article: saved });
      return saved;
    },
    [state.articles],
  );

  const toggleArticle = useCallback((id: number) => dispatch({ type: 'toggle-article', id }), []);
  const answerQuestion = useCallback(
    (id: number, status: 'answered' | 'dismissed') => dispatch({ type: 'answer-question', id, status }),
    [],
  );

  const createTicket = useCallback(
    (subject: string, customerId?: number): Ticket => {
      const next = Math.max(...state.tickets.map((item) => Number(item.ticket_number.split('-')[1]) || 0), 80) + 1;
      const ticket: Ticket = {
        id: Date.now(),
        ticket_number: `SUP-${String(next).padStart(3, '0')}`,
        customerId: customerId ?? state.session?.customerId ?? 1,
        subject,
        status: 'Open',
        created_at: iso(new Date()),
      };
      dispatch({ type: 'create-ticket', ticket });
      return ticket;
    },
    [state.tickets, state.session],
  );

  const addStaff = useCallback(
    (input: { name: string; email: string; role: 'admin' | 'staff' }) => {
      const user: StaffUser = {
        id: Math.max(...state.staff.map((item) => item.id), 0) + 1,
        ...input,
        active: true,
        last_active: iso(new Date()),
      };
      dispatch({ type: 'add-staff', user });
    },
    [state.staff],
  );

  const toggleStaff = useCallback((id: number) => dispatch({ type: 'toggle-staff', id }), []);

  const runBilling = useCallback(() => {
    const due = state.subscriptions.filter(
      (subscription) =>
        subscription.status === 'Active' &&
        subscription.next_billing_date !== null &&
        subscription.next_billing_date <= addDays(7),
    );
    const nextInvoiceId = Math.max(...state.invoices.map((item) => item.id), 1000) + 1;
    const newInvoices: Invoice[] = due.map((subscription, index) => {
      const lines = subscription.lines.map((line, lineIndex) => ({
        id: (nextInvoiceId + index) * 10 + lineIndex,
        description: line.description,
        quantity: line.quantity,
        unit_price: line.unit_price,
        line_total: line.amount,
        tax_rate: 0.18,
        tax_amount: line.tax_amount,
        discount_percent: 0,
        discount_amount: 0,
      }));
      const subtotal = lines.reduce((sum, line) => sum + line.line_total, 0);
      const tax = lines.reduce((sum, line) => sum + line.tax_amount, 0);
      return {
        id: nextInvoiceId + index,
        invoice_number: `INV-${String(nextInvoiceId + index).padStart(5, '0')}`,
        customerId: subscription.customerId,
        subscriptionId: subscription.id,
        period_start: iso(new Date()),
        period_end: addDays(30),
        issued_date: iso(new Date()),
        due_date: addDays(15),
        status: 'Confirmed',
        lines,
        subtotal,
        tax_amount: tax,
        discount_total: 0,
        total: Math.round((subtotal + tax) * 100) / 100,
        amount_paid: 0,
        trace: [
          { name: 'GST 18%', detail: 'Applied to every taxable line.', amount: tax, outcome: 'applied' },
          {
            name: 'Early renewal credit',
            detail: 'Not applied: the subscription is not within 14 days of renewal.',
            outcome: 'skipped',
          },
        ],
        sent_at: null,
      };
    });
    const updated = due.map((subscription) => {
      const plan = state.plans.find((item) => item.id === subscription.planId);
      const days = plan?.period === 'yearly' ? 365 : plan?.period === 'weekly' ? 7 : 30;
      return { ...subscription, next_billing_date: addDays(days) };
    });
    const run = {
      id: Date.now(),
      started_at: new Date().toISOString(),
      status: 'Succeeded' as const,
      created: newInvoices.length,
      skipped: state.subscriptions.length - due.length,
      failed: 0,
      duration_ms: 4200,
    };
    dispatch({ type: 'billing-run', run, invoices: newInvoices, updated });
    return { created: newInvoices.length, skipped: run.skipped };
  }, [state.subscriptions, state.invoices, state.plans]);

  const recoverLeakage = useCallback((id: number) => dispatch({ type: 'recover-leakage', id }), []);

  const appendChat = useCallback((message: Omit<ChatMessage, 'id' | 'created_at'>): ChatMessage => {
    const full: ChatMessage = {
      ...message,
      id: Date.now() + Math.floor(Math.random() * 1000),
      created_at: new Date().toISOString(),
    };
    dispatch({ type: 'chat-append', message: full });
    return full;
  }, []);

  const setChatFeedback = useCallback(
    (id: number, feedback: 'up' | 'down', reason?: string) =>
      dispatch({ type: 'chat-feedback', id, feedback, reason }),
    [],
  );
  const markChatStreamed = useCallback((id: number) => dispatch({ type: 'chat-streamed', id }), []);
  const openChat = useCallback(() => dispatch({ type: 'chat-open' }), []);
  const closeChat = useCallback(() => dispatch({ type: 'chat-close' }), []);
  const clearChat = useCallback(() => dispatch({ type: 'chat-clear' }), []);
  const setChatUnread = useCallback((count: number) => dispatch({ type: 'chat-unread', count }), []);
  const notify = useCallback(
    (title: string, detail: string, tone: 'info' | 'good' | 'warn' | 'danger') =>
      dispatch({ type: 'notify', title, detail, tone }),
    [],
  );
  const resetDemo = useCallback(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    dispatch({ type: 'reset' });
  }, []);

  const value = useMemo<StoreValue>(
    () => ({
      state,
      login,
      logout,
      setTheme,
      toggleTheme,
      markNotificationsRead,
      transitionSubscription,
      renewSubscription,
      recordPayment,
      confirmInvoice,
      cancelInvoice,
      sendInvoice,
      createSubscription,
      createProduct,
      updateProduct,
      addVariant,
      createPlan,
      togglePlanFlag,
      createTemplate,
      createDiscount,
      toggleDiscount,
      saveArticle,
      toggleArticle,
      answerQuestion,
      createTicket,
      addStaff,
      toggleStaff,
      runBilling,
      recoverLeakage,
      appendChat,
      setChatFeedback,
      markChatStreamed,
      openChat,
      closeChat,
      clearChat,
      setChatUnread,
      notify,
      resetDemo,
    }),
    [
      state,
      login,
      logout,
      setTheme,
      toggleTheme,
      markNotificationsRead,
      transitionSubscription,
      renewSubscription,
      recordPayment,
      confirmInvoice,
      cancelInvoice,
      sendInvoice,
      createSubscription,
      createProduct,
      updateProduct,
      addVariant,
      createPlan,
      togglePlanFlag,
      createTemplate,
      createDiscount,
      toggleDiscount,
      saveArticle,
      toggleArticle,
      answerQuestion,
      createTicket,
      addStaff,
      toggleStaff,
      runBilling,
      recoverLeakage,
      appendChat,
      setChatFeedback,
      markChatStreamed,
      openChat,
      closeChat,
      clearChat,
      setChatUnread,
      notify,
      resetDemo,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useStore must be used inside StoreProvider');
  return value;
}

export function customerName(state: AppState, id: number): string {
  return state.customers.find((item) => item.id === id)?.legal_name ?? 'Unknown customer';
}

export function customerById(state: AppState, id: number): Customer | undefined {
  return state.customers.find((item) => item.id === id);
}

export function planName(state: AppState, id: number): string {
  return state.plans.find((item) => item.id === id)?.name ?? 'Unknown plan';
}

export function productById(state: AppState, id: number): Product | undefined {
  return state.products.find((item) => item.id === id);
}

export function templateById(state: AppState, id: number): QuotationTemplate | undefined {
  return state.templates.find((item) => item.id === id);
}

export function subscriptionById(state: AppState, id: number): Subscription | undefined {
  return state.subscriptions.find((item) => item.id === id);
}

export function invoiceById(state: AppState, id: number): Invoice | undefined {
  return state.invoices.find((item) => item.id === id);
}

export function invoiceOutstanding(invoice: Invoice): number {
  return Math.max(0, Math.round((invoice.total - invoice.amount_paid) * 100) / 100);
}

export function isOverdue(invoice: Invoice): boolean {
  return (
    (invoice.status === 'Confirmed' || invoice.status === 'Draft') &&
    invoice.due_date < iso(new Date()) &&
    invoiceOutstanding(invoice) > 0
  );
}

export function invoiceDisplayStatus(invoice: Invoice): string {
  if (isOverdue(invoice)) return 'Overdue';
  return invoice.status;
}

export function subscriptionTotal(subscription: Subscription): number {
  return Math.round(
    subscription.lines.reduce((sum, line) => sum + line.amount + line.tax_amount, 0) * 100,
  ) / 100;
}

export function periodDays(period: PlanPeriod | string): number {
  if (period === 'daily') return 1;
  if (period === 'weekly') return 7;
  if (period === 'yearly' || period === 'annual') return 365;
  if (period === 'quarterly') return 90;
  return 30;
}

export function subscriptionProgress(subscription: Subscription): number {
  const start = new Date(subscription.start_date).getTime();
  const end = subscription.expiry_date
    ? new Date(subscription.expiry_date).getTime()
    : new Date(subscription.next_billing_date ?? addDays(30)).getTime();
  if (end <= start) return 1;
  return Math.min(1, Math.max(0, (Date.now() - start) / (end - start)));
}

export function daysRemaining(subscription: Subscription): number {
  if (!subscription.expiry_date) return 0;
  return Math.max(0, Math.ceil((new Date(subscription.expiry_date).getTime() - Date.now()) / 86_400_000));
}
