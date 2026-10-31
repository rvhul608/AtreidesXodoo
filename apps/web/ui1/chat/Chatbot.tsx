import { useEffect, useRef, useState } from 'react';
import {
  BookOpen, ChevronLeft, MessageCircle, RotateCcw, Send, ThumbsDown, ThumbsUp, X,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Pill } from '../ui/Pill';
import { money } from '../ui/Bits';
import { afterCards, replyFor, SUGGESTIONS } from '../mock/chat';
import type { ChatCard, ChatReply } from '../mock/chat';

interface Entry {
  who: 'bot' | 'you';
  text?: string;
  streaming?: boolean;
  sourceTitle?: string;
  sourceBody?: string;
  card?: ChatCard;
  cardDone?: boolean;
}

interface Rate {
  pick?: 'up' | 'down';
}

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function Chatbot({ onPaid }: { onPaid: (ref: string) => void }) {
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([
    { who: 'bot', text: 'Hi, I can help with plans, billing and your invoices.' },
  ]);
  const [rates, setRates] = useState<Record<number, Rate>>({});
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');
  const [failed, setFailed] = useState(false);
  const [expandSource, setExpandSource] = useState<number | null>(null);
  const [reasonFor, setReasonFor] = useState<number | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries, typing]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  function pushBot(reply: ChatReply) {
    setEntries((prev) => [...prev, { who: 'bot', streaming: true, text: '' }]);
    setTyping(true);

    const typeOut = () => {
      setTyping(false);
      if (reply.text) {
        const words = reply.text.split(' ');
        if (reducedMotion()) {
          setEntries((prev) =>
            prev.map((e, i) =>
              i === prev.length - 1
                ? { ...e, streaming: false, text: reply.text, sourceTitle: reply.source?.title, sourceBody: reply.source?.body, card: reply.card }
                : e,
            ),
          );
          if (reply.card) pushCard(reply.card);
          return;
        }
        let w = 0;
        const iv = window.setInterval(() => {
          w += 1;
          const partial = words.slice(0, w).join(' ');
          setEntries((prev) =>
            prev.map((e, i) => (i === prev.length - 1 ? { ...e, text: partial } : e)),
          );
          if (w >= words.length) {
            window.clearInterval(iv);
            setEntries((prev) =>
              prev.map((e, i) =>
                i === prev.length - 1
                  ? { ...e, streaming: false, sourceTitle: reply.source?.title, sourceBody: reply.source?.body, card: reply.card }
                  : e,
              ),
            );
            if (reply.card) pushCard(reply.card);
          }
        }, 45);
        timers.current.push(iv);
      } else if (reply.card) {
        pushCard(reply.card);
      }
    };
    const t = window.setTimeout(typeOut, 700);
    timers.current.push(t);
  }

  function pushCard(card: ChatCard) {
    setEntries((prev) => [...prev, { who: 'bot', card }]);
  }

  function send(text: string) {
    const q = text.trim();
    if (!q || typing) return;
    setFailed(false);
    setEntries((prev) => [...prev, { who: 'you', text: q }]);
    setDraft('');
    try {
      pushBot(replyFor(q));
    } catch {
      setFailed(true);
    }
  }

  function botSay(reply: ChatReply) {
    pushBot(reply);
    setSeen(true);
  }

  function cardResolved(card: ChatCard, verdict: 'paid' | 'closed' | 'kept' | 'ticket') {
    if (card.kind === 'invoice' && verdict === 'paid') onPaid(card.ref);
    const follow = verdict === 'kept' ? afterCards.keeping : afterCards[verdict === 'ticket' ? 'ticket' : verdict];
    botSay({ text: follow.text, source: follow.source });
  }

  return (
    <>
      {open && (
        <section className="chat-panel" role="dialog" aria-label="Brightloop support chat">
          <header className="chat-panel__header">
            <button className="iconbtn" onClick={() => setOpen(false)} aria-label="Back">
              <ChevronLeft size={18} />
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="chat-panel__title">Brightloop support</div>
              <div className="chat-panel__subtitle">Answers come from our support articles.</div>
            </div>
            <button className="iconbtn" onClick={() => setOpen(false)} aria-label="Close chat">
              <X size={18} />
            </button>
          </header>

          <div className="chat-panel__log" ref={logRef}>
            {entries.map((e, idx) => (
              <ChatEntry
                key={idx}
                entry={e}
                rate={rates[idx] ?? {}}
                onRate={(pick) => setRates((prev) => ({ ...prev, [idx]: { ...prev[idx], pick } }))}
                reasonOpen={reasonFor === idx}
                onReasonToggle={(v) => setReasonFor(v ? idx : null)}
                sourceOpen={expandSource === idx}
                onSource={() => setExpandSource(expandSource === idx ? null : idx)}
                onCard={(verdict, card) => cardResolved(card, verdict)}
                onTicket={(card) => cardResolved(card, 'ticket')}
              />
            ))}
            {typing && (
              <div className="msg msg--bot" style={{ width: 60 }}>
                <span className="typing" aria-label="Assistant is typing">
                  <span /><span /><span />
                </span>
              </div>
            )}
            {failed && (
              <div className="msg msg--bot">
                Message not sent. Check your connection and try again.
                <div className="msg-rate">
                  <button onClick={() => setFailed(false)}><RotateCcw size={13} /> Retry</button>
                </div>
              </div>
            )}
            {entries.length <= 1 && (
              <InfoBlock onPick={send} />
            )}
          </div>

          <footer className="chat-panel__footer">
            <form
              className="chat-input"
              onSubmit={(ev) => {
                ev.preventDefault();
                if (typing) return;
                try {
                  send(draft);
                } catch {
                  setFailed(true);
                }
              }}
            >
              <input
                className="field__input"
                placeholder="Ask a question…"
                aria-label="Ask a question"
                value={draft}
                onChange={(ev) => setDraft(ev.target.value)}
              />
              <button className="chat-input__send" type="submit" disabled={!draft.trim() || typing} aria-label="Send">
                <Send size={17} />
              </button>
            </form>
            <button className="chat-footer-link" onClick={() => botSay({ text: "I can't answer this from our support articles.", card: { kind: 'escalate' } })}>
              Talk to a person
            </button>
          </footer>
        </section>
      )}

      {!open && (
        <>
          <button
            className="chat-launcher"
            onClick={() => {
              setOpen(true);
              setSeen(false);
            }}
            aria-label="Open Brightloop support chat"
          >
            {!seen && <span className="unread" aria-hidden="true" />}
            <MessageCircle size={24} strokeWidth={1.75} />
          </button>
          {!seen && (
            <div className="chat-launcher__tooltip" role="status">
              Questions about your plan or invoices? Ask here.
            </div>
          )}
        </>
      )}
    </>
  );
}

function InfoBlock({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div className="chips" style={{ marginTop: 8 }}>
      {SUGGESTIONS.map((s) => (
        <button key={s} className="chip" onClick={() => onPick(s)}>{s}</button>
      ))}
    </div>
  );
}

function ChatEntry({
  entry, rate, onRate, reasonOpen, onReasonToggle, sourceOpen, onSource, onCard, onTicket,
}: {
  entry: Entry;
  rate: Rate;
  onRate: (pick: 'up' | 'down') => void;
  reasonOpen: boolean;
  onReasonToggle: (open: boolean) => void;
  sourceOpen: boolean;
  onSource: () => void;
  onCard: (verdict: 'paid' | 'closed' | 'kept' | 'ticket', card: ChatCard) => void;
  onTicket: (card: ChatCard) => void;
}) {
  if (entry.card) {
    const card = entry.card;
    return <ChatSpecialCard card={card} onCard={onCard} onTicket={onTicket} />;
  }

  return (
    <>
      <div className={entry.who === 'you' ? 'msg msg--you' : 'msg msg--bot'}>
        {entry.text}
      </div>
      {entry.who === 'bot' && entry.sourceTitle && !entry.streaming && (
        <div className="msg__extras">
          <button className="source-chip" onClick={onSource}>
            <BookOpen size={13} />
            Source: {entry.sourceTitle}
          </button>
          <div className="msg-rate">
            <button
              className={rate.pick === 'up' ? 'is-picked' : undefined}
              onClick={() => onRate('up')}
              aria-label="Helpful"
            >
              <ThumbsUp size={13} /> Helpful
            </button>
            <button
              className={rate.pick === 'down' ? 'is-picked' : undefined}
              onClick={() => {
                onRate('down');
                onReasonToggle(true);
              }}
              aria-label="Not helpful"
            >
              <ThumbsDown size={13} /> Not helpful
            </button>
          </div>
          {rate.pick === 'down' && reasonOpen && (
            <OptionalReason />
          )}
          {sourceOpen && entry.sourceBody && (
            <div className="chat-card" style={{ fontSize: 14 }}>
              <strong style={{ fontWeight: 600 }}>{entry.sourceTitle}</strong>
              <span className="muted" style={{ fontSize: 14 }}>{entry.sourceBody}</span>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function OptionalReason() {
  const [val, setVal] = useState('');
  const [sent, setSent] = useState(false);
  if (sent) return <span className="caption">Thanks — noted.</span>;
  return (
    <form
      className="chat-card"
      style={{ width: '100%' }}
      onSubmit={(e) => {
        e.preventDefault();
        setSent(true);
      }}
    >
      <span className="caption">What was missing? (optional)</span>
      <div className="chat-input">
        <input
          className="field__input"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          aria-label="Optional reason"
        />
        <Button variant="primary" size="sm">Send</Button>
      </div>
    </form>
  );
}

function ChatSpecialCard({
  card, onCard, onTicket,
}: {
  card: ChatCard;
  onCard: (verdict: 'paid' | 'closed' | 'kept' | 'ticket', card: ChatCard) => void;
  onTicket: (card: ChatCard) => void;
}) {
  if (card.kind === 'invoice') return <InvoiceCard card={card} onCard={onCard} />;
  if (card.kind === 'confirm') return <ConfirmCard card={card} onCard={onCard} />;
  return <EscalateCard onTicket={(c) => onTicket(c)} />;
}

function InvoiceCard({
  card, onCard,
}: {
  card: Extract<ChatCard, { kind: 'invoice' }>;
  onCard: (verdict: 'paid' | 'closed' | 'kept' | 'ticket', card: ChatCard) => void;
}) {
  const [done, setDone] = useState(false);

  return (
    <div className="chat-card">
      <div className="chat-card__row">
        <strong style={{ fontWeight: 600 }}>Invoice {card.ref}</strong>
        <Pill tone={card.status === 'paid' ? 'good' : 'info'}>
          {card.status === 'paid' ? 'Paid' : `Due ${card.due_on.slice(8)}/${card.due_on.slice(5, 7)}`}
        </Pill>
      </div>
      <span style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
        {money(card.total)}
      </span>
      <div className="chat-card__actions">
        <Button size="sm">View invoice</Button>
        {card.status !== 'paid' && (
          <Button
            size="sm"
            variant="primary"
            disabled={done}
            onClick={() => {
              setDone(true);
              onCard('paid', card);
            }}
          >
            {done ? 'Paid' : 'Pay now'}
          </Button>
        )}
      </div>
    </div>
  );
}

function ConfirmCard({
  card, onCard,
}: {
  card: Extract<ChatCard, { kind: 'confirm' }>;
  onCard: (verdict: 'paid' | 'closed' | 'kept' | 'ticket', card: ChatCard) => void;
}) {
  const [done, setDone] = useState<null | 'closed' | 'kept'>(null);

  return (
    <div className="chat-card">
      <strong style={{ fontWeight: 600 }}>{card.title}</strong>
      <span className="muted" style={{ fontSize: 14 }}>{card.body}</span>
      <div className="chat-card__actions">
        {done ? (
          <span className="caption">{done === 'kept' ? 'Subscription kept active.' : 'Subscription closed.'}</span>
        ) : (
          <>
            <Button size="sm" variant="destructive" onClick={() => { setDone('closed'); onCard('closed', card); }}>
              {card.actionLabel}
            </Button>
            <Button size="sm" onClick={() => { setDone('kept'); onCard('kept', card); }}>
              {card.keepLabel}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function EscalateCard({ onTicket }: { onTicket: (card: ChatCard) => void }) {
  const [ticketed, setTicketed] = useState(false);

  return (
    <div className="chat-card">
      <span className="muted" style={{ fontSize: 14 }}>
        I can't answer this from our support articles.
      </span>
      <div className="chat-card__actions">
        {ticketed ? (
          <span className="caption">Ticket SUP-088 created. Our team will reply by email.</span>
        ) : (
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              setTicketed(true);
              onTicket({ kind: 'escalate' });
            }}
          >
            Create a support ticket
          </Button>
        )}
      </div>
    </div>
  );
}
