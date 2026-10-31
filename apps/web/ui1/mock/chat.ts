/* ============================================================
   Chatbot mock brain. The production bot answers from staff-
   maintained articles via the API; this local engine keeps the
   exact UI behaviour (source chips, cards, copy rules) so the
   service can be swapped in without touching the panel.
   ============================================================ */

import { articles, invoices, subscriptions, TODAY } from './data';
import type { Article } from './data';

export interface CardInvoice {
  kind: 'invoice';
  ref: string;
  due_on: string;
  total: string;
  status: string;
  invoice_id: number;
}

export interface CardConfirm {
  kind: 'confirm';
  title: string;
  body: string;
  actionLabel: string;
  keepLabel: string;
  action: 'close_subscription';
  sub_ref: string;
}

export interface CardEscalate {
  kind: 'escalate';
}

export type ChatCard = CardInvoice | CardConfirm | CardEscalate;

export interface ChatReply {
  text: string;
  source?: Article;
  card?: ChatCard;
}

export const SUGGESTIONS = [
  "What's in the Pro plan?",
  'How do I close my subscription?',
  'When is my next invoice?',
];

function articleBy(title: string): Article {
  const a = articles.find((x) => x.title === title);
  return a ?? articles[0];
}

export function replyFor(question: string): ChatReply {
  const q = question.toLowerCase();

  /* Billing intents that look up the customer's own data first */
  if (/(next\s+invoice|my invoice|when.*invoice|invoice due)/.test(q)) {
    return {
      text: 'Here is the invoice currently open on your account.',
      source: articleBy('Pro plan details'),
      card: {
        kind: 'invoice',
        ref: 'INV-1051',
        due_on: '2026-11-12',
        total: '1840.80',
        status: 'confirmed',
        invoice_id: 105,
      },
    };
  }

  if (/(add seats|more seats|upgrade seats|seats)/.test(q)) {
    return {
      text: 'You can add seats from My subscriptions > Add seats. Added seats are prorated on your next invoice.',
      source: articleBy('Seat changes'),
    };
  }

  if (/(pro plan|what.*plan include|features|what.*included)/.test(q)) {
    return {
      text: 'The Pro plan includes unlimited contacts, pipelines, Loop Mail and Loop Storage. Seats are billed per user.',
      source: articleBy('Pro plan details'),
    };
  }

  if (/(close|cancel|end.*(subscription|plan)|stop.*plan)/.test(q)) {
    return {
      text: 'I can start that for you here. Please confirm it first.',
      card: {
        kind: 'confirm',
        title: 'Close Pro plan (yearly)?',
        body: 'Access ends on 12 Nov. Your data stays available for 30 days.',
        actionLabel: 'Close subscription',
        keepLabel: 'Keep it',
        action: 'close_subscription',
        sub_ref: 'SUB-0402',
      },
      source: articleBy('Closing a subscription'),
    };
  }

  if (/(pause|freeze)/.test(q)) {
    return {
      text: 'Plans that allow pausing can be paused for up to two months a year, from My subscriptions > Pause.',
      source: articleBy('Pausing a plan'),
    };
  }

  if (/(refund|money back)/.test(q)) {
    return {
      text: 'Yearly plans can be refunded within 14 days of the first payment. Monthly payments are non-refundable once the period starts.',
      source: articleBy('Refund policy'),
    };
  }

  if (/(pay|payment method|card)/.test(q)) {
    return {
      text: 'Here is the invoice currently open on your account.',
      source: articleBy('Pro plan details'),
      card: {
        kind: 'invoice',
        ref: 'INV-1051',
        due_on: '2026-11-12',
        total: '1840.80',
        status: 'confirmed',
        invoice_id: 105,
      },
    };
  }

  if (/(renew|renewal|expiry|expires)/.test(q)) {
    const sub = subscriptions.find((s) => s.ref === 'SUB-0402')!;
    return {
      text: `Your Pro plan (yearly) renews on 12 Nov. Auto-renew is ${sub.auto_renew ? 'on, so nothing is required from you' : 'off, so you will need to renew manually'}.`,
      source: articleBy('Closing a subscription'),
    };
  }

  if (/(person|human|agent|support team|complain|failed|not working|error)/.test(q)) {
    return {
      text: "I can't answer this from our support articles.",
      card: { kind: 'escalate' },
    };
  }

  /* Copy rule §7.5: no answer must offer the ticket path. */
  return {
    text: "That isn't covered in our support articles. You can create a ticket and our team will reply.",
    card: { kind: 'escalate' },
  };
}

/* Post-action follow-ups so the conversation reads like a loop */
export const afterCards = {
  paid: {
    text: 'Payment received. Invoice INV-1051 is now marked paid.',
    source: articleBy('Refund policy'),
  },
  closed: {
    text: 'Pro plan (yearly) closed. Access ends on 12 Nov. Your data stays available for 30 days.',
    source: articleBy('Closing a subscription'),
  },
  keeping: {
    text: 'Nothing changed then. Your Pro plan (yearly) stays active.',
    source: articleBy('Pro plan details'),
  },
  ticket: {
    text: 'Ticket SUP-088 created. Our team will reply by email.',
    source: undefined as Article | undefined,
  },
};

export const invoiceForCard = () => invoices.find((i) => i.ref === 'INV-1051') ?? invoices.find((i) => i.customer === 'Acme Works')!;
export const today = TODAY;
