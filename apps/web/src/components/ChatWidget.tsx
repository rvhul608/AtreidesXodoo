import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  CreditCard,
  FileText,
  LifeBuoy,
  RotateCcw,
  Send,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  X,
} from 'lucide-react';
import {
  useStore,
  invoiceById,
  invoiceDisplayStatus,
  invoiceOutstanding,
  planName,
  subscriptionById,
} from '../lib/store';
import { answerQuestion, articleBody, articleTitle } from '../lib/chat';
import { fmtDate, money } from '../lib/format';
import { invoicePath, ticketsPath } from '../lib/routes';
import type { ChatMessage } from '../lib/types';
import { LoopMark } from './brand';
import { Button, IconButton, StatusPill, useToast } from './ui';
import { PaymentModal } from './PaymentModal';

const TIP_KEY = 'brightloop.chat.tip.dismissed';

export function ChatWidget() {
  const {
    state,
    openChat,
    closeChat,
    clearChat,
    appendChat,
    setChatFeedback,
    markChatStreamed,
    createTicket,
    transitionSubscription,
  } = useStore();
  const { push } = useToast();
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [expandedSource, setExpandedSource] = useState<number | null>(null);
  const [reasonFor, setReasonFor] = useState<number | null>(null);
  const [reasonText, setReasonText] = useState('');
  const [payInvoiceId, setPayInvoiceId] = useState<number | null>(null);
  const [showTip, setShowTip] = useState(() => {
    try {
      return !window.localStorage.getItem(TIP_KEY);
    } catch {
      return true;
    }
  });
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const timers = useRef<number[]>([]);

  const role = state.session?.role ?? 'customer';
  const customerId = state.session?.customerId ?? null;
  const activeArticles = state.articles.filter((article) => article.status === 'Active').length;

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const node = listRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior });
  }, []);

  useEffect(() => {
    if (!state.chatOpen) return;
    scrollToBottom();
    const timer = window.setTimeout(() => inputRef.current?.focus(), 140);
    return () => window.clearTimeout(timer);
  }, [state.chatOpen, scrollToBottom]);

  useEffect(() => {
    if (state.chatOpen) scrollToBottom();
  }, [state.chat.length, thinking, state.chatOpen, scrollToBottom]);

  useEffect(() => {
    return () => {
      timers.current.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  const send = (raw: string) => {
    const text = raw.trim();
    if (!text || thinking) return;
    appendChat({ role: role === 'customer' ? 'customer' : 'staff', text });
    setInput('');
    setThinking(true);
    const reply = answerQuestion(text, state, customerId);
    const timer = window.setTimeout(() => {
      appendChat({
        role: 'bot',
        text: reply.text,
        sourceId: reply.sourceId,
        suggestions: reply.suggestions,
        card: reply.card,
        streaming: true,
      });
      setThinking(false);
    }, 540);
    timers.current.push(timer);
  };

  const dismissTip = () => {
    setShowTip(false);
    try {
      window.localStorage.setItem(TIP_KEY, '1');
    } catch {
      /* local storage can be unavailable */
    }
  };

  const handleEscalate = () => {
    const lastCustomer = [...state.chat].reverse().find((message) => message.role !== 'bot');
    const subject = lastCustomer?.text?.slice(0, 90) || 'Question from the support assistant';
    const ticket = createTicket(subject, customerId ?? 1);
    appendChat({
      role: 'bot',
      text: `Ticket ${ticket.ticket_number} created. Our team will reply by email.`,
      card: { type: 'ticket', ticketNumber: ticket.ticket_number },
      streaming: true,
    });
    push({ title: 'Ticket created', description: `${ticket.ticket_number} · our team will reply by email.` });
  };

  const handleCloseSubscription = (subscriptionId: number) => {
    const result = transitionSubscription(subscriptionId, 'Closed', 'Closed from the support assistant');
    appendChat({
      role: 'bot',
      text: result.ok
        ? 'Subscription closed. Access continues until the end of the paid period.'
        : result.message,
      streaming: true,
    });
    push({
      title: result.ok ? 'Subscription closed' : 'Could not close subscription',
      description: result.message,
      tone: result.ok ? 'good' : 'bad',
    });
  };

  const handleKeep = () => {
    appendChat({ role: 'bot', text: 'No change made. Your subscription stays active.', streaming: true });
  };

  const submitReason = (id: number) => {
    setChatFeedback(id, 'down', reasonText.trim() || undefined);
    setReasonFor(null);
    setReasonText('');
    push({ title: 'Feedback sent', description: 'Thanks — this helps the team improve the articles.' });
  };

  const renderCard = (card: ChatMessage['card']) => {
    if (!card) return null;
    if (card.type === 'invoice' || card.type === 'confirm-pay') {
      const invoice = invoiceById(state, card.invoiceId);
      if (!invoice) return null;
      const outstanding = invoiceOutstanding(invoice);
      const confirming = card.type === 'confirm-pay';
      return (
        <div className="chat-card">
          <div className="cc-head">
            <span>{confirming ? `Pay ${invoice.invoice_number}` : invoice.invoice_number}</span>
            <StatusPill status={invoiceDisplayStatus(invoice)} />
          </div>
          <div className="cc-amount">{money(invoice.total)}</div>
          <div className="cc-meta">
            Due {fmtDate(invoice.due_date)} · {money(outstanding)} outstanding
          </div>
          <div className="cc-actions">
            <Button
              size="sm"
              variant="secondary"
              icon={FileText}
              onClick={() => navigate(invoicePath(role, invoice.id))}
            >
              View invoice
            </Button>
            {outstanding > 0 && invoice.status !== 'Cancelled' ? (
              <Button size="sm" icon={CreditCard} onClick={() => setPayInvoiceId(invoice.id)}>
                Pay now
              </Button>
            ) : null}
          </div>
        </div>
      );
    }
    if (card.type === 'confirm-close') {
      const subscription = subscriptionById(state, card.subscriptionId);
      if (!subscription) return null;
      return (
        <div className="chat-card danger">
          <div className="cc-head">
            <span>Close {planName(state, subscription.planId)}?</span>
            <StatusPill status="Closing" tone="warn" dot={false} />
          </div>
          <div className="cc-meta">
            Access ends on {fmtDate(subscription.expiry_date)}. This cannot be undone from the portal.
          </div>
          <div className="cc-actions">
            <Button size="sm" variant="danger" onClick={() => handleCloseSubscription(subscription.id)}>
              Close subscription
            </Button>
            <Button size="sm" variant="secondary" onClick={handleKeep}>
              Keep it
            </Button>
          </div>
        </div>
      );
    }
    if (card.type === 'escalate') {
      return (
        <div className="chat-card">
          <div className="cc-head">
            <span>Talk to a person</span>
            <LifeBuoy aria-hidden="true" style={{ width: 15, height: 15 }} />
          </div>
          <div className="cc-meta">Create a ticket and our team will reply by email.</div>
          <div className="cc-actions">
            <Button size="sm" icon={LifeBuoy} onClick={handleEscalate}>
              Create a support ticket
            </Button>
          </div>
        </div>
      );
    }
    if (card.type === 'ticket') {
      return (
        <div className="chat-card">
          <div className="cc-head">
            <span>{card.ticketNumber}</span>
            <StatusPill status="Open" />
          </div>
          <div className="cc-meta">Ticket created. Our team will reply by email.</div>
          <div className="cc-actions">
            <Button
              size="sm"
              variant="secondary"
              icon={ArrowUpRight}
              onClick={() => navigate(ticketsPath(role))}
            >
              View tickets
            </Button>
          </div>
        </div>
      );
    }
    return null;
  };

  const messages = state.chat;

  return (
    <>
      {state.chatOpen ? (
        <section className="chat-panel" role="dialog" aria-modal="true" aria-label="Brightloop support">
          <div className="chat-head">
            <IconButton className="chat-back" icon={ArrowLeft} label="Close support" onClick={closeChat} />
            <span className="chat-mark">
              <LoopMark size={19} />
            </span>
            <div className="chat-title">
              <strong>Brightloop support</strong>
              <span>Answers come from our support articles.</span>
            </div>
            <IconButton icon={RotateCcw} label="Start over" onClick={clearChat} />
            <IconButton icon={X} label="Close support" onClick={closeChat} />
          </div>

          <div className="chat-messages" ref={listRef} aria-live="polite">
            <div className="chat-day">Today</div>
            {messages.map((message, index) => {
              const isBot = message.role === 'bot';
              const isLast = index === messages.length - 1;
              const sourceTitle = message.sourceId ? articleTitle(state, message.sourceId) : '';
              const sourceBody = message.sourceId ? articleBody(state, message.sourceId) : '';
              return (
                <div key={message.id} className={`msg ${isBot ? 'bot' : 'customer'}`}>
                  <div className="msg-bubble">
                    <StreamingText
                      text={message.text}
                      streaming={Boolean(message.streaming)}
                      onDone={() => markChatStreamed(message.id)}
                      onProgress={() => scrollToBottom('auto')}
                    />
                  </div>

                  {isBot && message.sourceId ? (
                    <button
                      type="button"
                      className="source-chip"
                      onClick={() => setExpandedSource((current) => (current === message.id ? null : message.id))}
                      aria-expanded={expandedSource === message.id}
                    >
                      <BookOpen aria-hidden="true" />
                      <span>Source: {sourceTitle}</span>
                    </button>
                  ) : null}

                  {isBot && expandedSource === message.id && message.sourceId ? (
                    <div className="source-body">
                      <strong>{sourceTitle}</strong>
                      {sourceBody}
                    </div>
                  ) : null}

                  {isBot ? (
                    <div className="msg-actions">
                      <IconButton
                        className={message.feedback === 'up' ? 'selected' : ''}
                        icon={ThumbsUp}
                        label="This answer was helpful"
                        onClick={() => {
                          setChatFeedback(message.id, 'up');
                          push({ title: 'Feedback sent', description: 'Thanks — marked as helpful.' });
                        }}
                      />
                      <IconButton
                        className={message.feedback === 'down' ? 'selected' : ''}
                        icon={ThumbsDown}
                        label="This answer was not helpful"
                        onClick={() => {
                          setChatFeedback(message.id, 'down');
                          setReasonFor((current) => (current === message.id ? null : message.id));
                          setReasonText('');
                        }}
                      />
                      {message.feedback ? (
                        <span className="caption" style={{ fontSize: 10, marginLeft: 2 }}>
                          {message.feedback === 'up' ? 'Helpful' : 'Not helpful'}
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <span className="msg-time">
                      {new Date(message.created_at).toLocaleTimeString('en-IN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  )}

                  {reasonFor === message.id ? (
                    <div className="feedback-reason">
                      <input
                        className="input"
                        value={reasonText}
                        onChange={(event) => setReasonText(event.target.value)}
                        placeholder="What was wrong? (optional)"
                        aria-label="Feedback reason"
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') submitReason(message.id);
                        }}
                      />
                      <Button size="sm" variant="secondary" onClick={() => submitReason(message.id)}>
                        Send
                      </Button>
                    </div>
                  ) : null}

                  {isBot && message.card ? renderCard(message.card) : null}

                  {isBot && isLast && message.suggestions?.length && !thinking ? (
                    <div className="chat-suggestions">
                      {message.suggestions.map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          className="chat-suggestion"
                          onClick={() => send(suggestion)}
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}

            {thinking ? (
              <div className="msg bot">
                <div className="chat-typing" aria-label="Assistant is typing">
                  <i />
                  <i />
                  <i />
                </div>
              </div>
            ) : null}
          </div>

          <div className="chat-foot">
            <div className="chat-input-row">
              <textarea
                ref={inputRef}
                className="chat-input"
                rows={1}
                value={input}
                placeholder="Ask a question…"
                aria-label="Ask a question"
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    send(input);
                  }
                }}
              />
              <button
                type="button"
                className="chat-send"
                disabled={!input.trim() || thinking}
                onClick={() => send(input)}
                aria-label="Send message"
              >
                <Send aria-hidden="true" />
              </button>
            </div>
            <div className="chat-links">
              <button type="button" onClick={() => send('I want to talk to a person')}>
                Talk to a person
              </button>
              <span className="chat-powered">
                <ShieldCheck aria-hidden="true" />
                Grounded in {activeArticles} articles
              </span>
            </div>
          </div>
        </section>
      ) : (
        <div style={{ position: 'fixed', right: 24, bottom: 24, zIndex: 70 }}>
          {showTip && state.chatUnread > 0 ? (
            <div className="chat-tip" role="status">
              <strong>Questions about your plan or invoices?</strong>
              Ask the support assistant — answers come from our articles.
              <button type="button" onClick={dismissTip} aria-label="Dismiss tip">
                <X aria-hidden="true" />
              </button>
            </div>
          ) : null}
          <button
            type="button"
            className="chat-launcher"
            onClick={openChat}
            aria-label="Open Brightloop support"
          >
            <LoopMark size={26} />
            {state.chatUnread > 0 ? <span className="unread">{state.chatUnread}</span> : null}
          </button>
        </div>
      )}

      <PaymentModal
        invoiceId={payInvoiceId}
        open={payInvoiceId !== null}
        onClose={() => setPayInvoiceId(null)}
        onPaid={(amount, invoiceNumber) => {
          appendChat({
            role: 'bot',
            text: `Payment of ${money(amount)} recorded for ${invoiceNumber}. The invoice is updated in your portal.`,
            streaming: true,
          });
        }}
      />
    </>
  );
}

function StreamingText({
  text,
  streaming,
  onDone,
  onProgress,
}: {
  text: string;
  streaming: boolean;
  onDone?: () => void;
  onProgress?: () => void;
}) {
  const tokens = useMemo(() => text.split(/(\s+)/), [text]);
  const [count, setCount] = useState(streaming ? 0 : tokens.length);

  useEffect(() => {
    setCount(streaming ? 0 : tokens.length);
  }, [text, streaming, tokens.length]);

  useEffect(() => {
    if (!streaming) return;
    if (count >= tokens.length) {
      onDone?.();
      return;
    }
    const timer = window.setTimeout(() => {
      setCount((current) => Math.min(tokens.length, current + 3));
      onProgress?.();
    }, 24);
    return () => window.clearTimeout(timer);
  }, [count, streaming, tokens.length, onDone, onProgress]);

  return (
    <>
      {tokens.slice(0, count).join('')}
      {streaming && count < tokens.length ? <span className="stream-caret" aria-hidden="true" /> : null}
    </>
  );
}
