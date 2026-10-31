import type { AppState, ChatMessage, Invoice, KBArticle, Subscription } from './types';
import { invoiceOutstanding, isOverdue } from './store';
import { fmtDate, money } from './format';

export interface BotReply {
  text: string;
  sourceId?: number;
  suggestions?: string[];
  card?: ChatMessage['card'];
}

const DEFAULT_SUGGESTIONS = [
  "What's in the Pro plan?",
  'How do I add seats?',
  'When is my next invoice?',
];

function activeArticle(state: AppState, id: number): KBArticle | undefined {
  const article = state.articles.find((item) => item.id === id);
  return article?.status === 'Active' ? article : undefined;
}

function findArticleByWords(state: AppState, words: string[]): KBArticle | undefined {
  return state.articles.find(
    (article) =>
      article.status === 'Active' &&
      words.some((word) => article.title.toLowerCase().includes(word) || article.body.toLowerCase().includes(word)),
  );
}

function nextInvoice(state: AppState, customerId: number): Invoice | undefined {
  return state.invoices
    .filter(
      (invoice) =>
        invoice.customerId === customerId &&
        (invoice.status === 'Confirmed' || invoice.status === 'Draft') &&
        invoiceOutstanding(invoice) > 0,
    )
    .sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
}

function activeSubscription(state: AppState, customerId: number): Subscription | undefined {
  return state.subscriptions.find(
    (subscription) => subscription.customerId === customerId && subscription.status === 'Active',
  );
}

function articleReply(article: KBArticle | undefined, fallback: string): BotReply {
  if (!article) {
    return {
      text: "That isn't covered in our support articles. You can create a ticket and our team will reply.",
      card: { type: 'escalate' },
      suggestions: ['Talk to a person'],
    };
  }
  return { text: fallback, sourceId: article.id, suggestions: DEFAULT_SUGGESTIONS };
}

function escalationReply(): BotReply {
  return {
    text: "I can't answer this from our support articles. Create a ticket and our team will reply by email.",
    card: { type: 'escalate' },
    suggestions: ['Talk to a person', 'How do I add seats?'],
  };
}

export function answerQuestion(
  message: string,
  state: AppState,
  customerId: number | null,
  options: { testMode?: boolean } = {},
): BotReply {
  const text = message.trim().toLowerCase();
  const has = (...words: string[]) => words.some((word) => text.includes(word));

  if (!text) {
    return { text: 'Ask a question about plans, billing or your invoices.', suggestions: DEFAULT_SUGGESTIONS };
  }

  if (has('hello', 'hi ', 'hey', 'good morning', 'good afternoon') && text.length < 24) {
    return {
      text: 'Hi, I can help with plans, billing and your invoices. What would you like to know?',
      suggestions: DEFAULT_SUGGESTIONS,
    };
  }

  if (has('thank', 'thanks', 'great', 'perfect')) {
    return {
      text: 'You are welcome. Is there anything else I can help with?',
      suggestions: DEFAULT_SUGGESTIONS,
    };
  }

  if (has('human', 'person', 'agent', 'someone', 'staff', 'support team')) {
    return {
      text: 'I can create a support ticket so a person can reply by email. Would you like me to do that?',
      card: { type: 'escalate' },
      suggestions: ['Create a support ticket'],
    };
  }

  if (has('student', 'education', 'academic')) {
    return {
      text: 'Student pricing is not covered in our published support articles yet. You can create a ticket and our team will follow up.',
      card: { type: 'escalate' },
      suggestions: ['Talk to a person'],
    };
  }

  if (has('refund', 'money back', 'reimburse')) {
    return {
      text: 'Refund policy is not available to me yet, because the article is still a draft. Create a ticket and our team will review your request.',
      card: { type: 'escalate' },
      suggestions: ['Talk to a person'],
    };
  }

  if (has('pay', 'payment', 'upi', 'card', 'bank transfer', 'failed')) {
    const article = activeArticle(state, 6);
    if (!options.testMode && customerId !== null) {
      const invoice = nextInvoice(state, customerId);
      if (invoice) {
        return {
          text: `I can see invoice ${invoice.invoice_number} for ${money(invoice.total)}. It is due on ${fmtDate(invoice.due_date)}. You can pay it now, or open the invoice in your portal.`,
          sourceId: 6,
          card: { type: 'confirm-pay', invoiceId: invoice.id },
          suggestions: ['When is my next invoice?', 'Talk to a person'],
        };
      }
    }
    return articleReply(article, 'You can pay by UPI, card or bank transfer. Include the invoice number in the transfer note so the payment is matched.');
  }

  if (has('invoice', 'bill', 'billing', 'due', 'next invoice', 'when is my')) {
    if (!options.testMode && customerId !== null) {
      const invoice = nextInvoice(state, customerId);
      if (invoice) {
        return {
          text: `Your next open invoice is ${invoice.invoice_number}, due ${fmtDate(invoice.due_date)}. ${isOverdue(invoice) ? 'It is past its due date.' : 'It is not overdue yet.'} The outstanding balance is ${money(invoiceOutstanding(invoice))}.`,
          sourceId: 4,
          card: { type: 'invoice', invoiceId: invoice.id },
          suggestions: ['How do I pay?', 'Talk to a person'],
        };
      }
      const subscription = activeSubscription(state, customerId);
      if (subscription?.next_billing_date) {
        return {
          text: `You have no open invoices. The next invoice is expected on ${fmtDate(subscription.next_billing_date)} for ${subscription.subscription_number}.`,
          sourceId: 4,
          suggestions: DEFAULT_SUGGESTIONS,
        };
      }
    }
    return articleReply(
      activeArticle(state, 4),
      'Invoices are issued at the start of each billing period. You can download any invoice from the Invoices page. If a payment is not reflected after 24 hours, contact support.',
    );
  }

  if (has('seat', 'add user', 'more user', 'quantity')) {
    return articleReply(
      activeArticle(state, 2),
      'You can add seats from My subscriptions > Add seats. The change takes effect immediately and the next invoice includes the prorated amount.',
    );
  }

  if (has('close', 'cancel', 'end subscription', 'stop subscription', 'terminate')) {
    if (!options.testMode && customerId !== null) {
      const subscription = activeSubscription(state, customerId);
      if (subscription) {
        const plan = state.plans.find((item) => item.id === subscription.planId);
        if (plan?.allow_early_close) {
          return {
            text: `I can help close ${subscription.subscription_number} on ${plan.name}. Access continues until the end of the paid period. Confirm below and I will close it.`,
            sourceId: 3,
            card: { type: 'confirm-close', subscriptionId: subscription.id },
            suggestions: ['Keep my subscription', 'Talk to a person'],
          };
        }
        return {
          text: `${plan?.name ?? 'This plan'} closes automatically at expiry and does not allow early close. The subscription ends on ${fmtDate(subscription.expiry_date)}.`,
          sourceId: 3,
          suggestions: DEFAULT_SUGGESTIONS,
        };
      }
    }
    return articleReply(
      activeArticle(state, 3),
      'You can close a subscription from My subscriptions if the plan allows early close. Access continues until the end of the paid period.',
    );
  }

  if (has('pause', 'hold', 'suspend')) {
    return articleReply(
      activeArticle(state, 7),
      'Plans that allow pausing can be paused from My subscriptions. While paused, no invoices are issued and access is read-only. Yearly Fixed plans cannot be paused.',
    );
  }

  if (has('pro plan', 'plan detail', 'what is included', 'whats in the', "what's in the", 'features', 'pricing', 'price', 'cost', 'how much')) {
    return articleReply(
      activeArticle(state, 1),
      'The Pro plan includes the ERP licence, two support hours per month and cloud hosting in your region. Annual plans receive a 15% prepay discount.',
    );
  }

  if (has('download', 'print', 'pdf', 'copy of invoice')) {
    return articleReply(
      activeArticle(state, 4),
      'Open the invoice from the Invoices page and use Download or Print. Both use the same invoice record, so the totals always match.',
    );
  }

  if (has('gst', 'tax', 'tax invoice', 'company number')) {
    return {
      text: 'A GST number can be added to your billing profile. That change is not covered by my articles yet, so a person should confirm it for you.',
      card: { type: 'escalate' },
      suggestions: ['Talk to a person'],
    };
  }

  if (has('multi-currency', 'currency', 'usd', 'dollar')) {
    return escalationReply();
  }

  if (has('contact', 'reach', 'email', 'phone', 'hours')) {
    return articleReply(
      activeArticle(state, 8),
      'This assistant answers from support articles. If it cannot help, create a ticket and the team replies by email within one working day.',
    );
  }

  const article = findArticleByWords(state, ['invoice', 'plan', 'seat', 'support', 'pause']);
  if (article) {
    return articleReply(article, `Here is what our support article "${article.title}" says.`);
  }

  return escalationReply();
}

export function articleBody(state: AppState, id: number): string {
  return state.articles.find((item) => item.id === id)?.body ?? '';
}

export function articleTitle(state: AppState, id: number): string {
  return state.articles.find((item) => item.id === id)?.title ?? 'Support article';
}
