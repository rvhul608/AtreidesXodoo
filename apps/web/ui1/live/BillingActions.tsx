import { useEffect, useState } from 'react';
import { CircleAlert, CircleCheck, CreditCard, Play } from 'lucide-react';
import { apiErrorMessage, http } from './api';
import { Button } from '../ui/Button';
import './billing-actions.css';

type Reload = () => void | Promise<void>;

interface BillingRunResult {
  asOf: string;
  created: number;
  skippedExisting: number;
  invoiceIds: number[];
  failed: Array<{ subscription_id: number; error: string }>;
}

export function BillingRunAction({ onReload }: { onReload: Reload }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState('');

  async function run() {
    setError('');
    setConfirmation('');
    setBusy(true);
    try {
      const response = await http.post<{ data: BillingRunResult }>('/billing/run');
      const result = response.data.data;
      const summary = `${result.created} invoice${result.created === 1 ? '' : 's'} created; ${result.skippedExisting} already existed.`;
      if (result.failed.length) {
        setError(`${summary} ${result.failed.length} subscription${result.failed.length === 1 ? '' : 's'} failed: ${result.failed.map((failure) => `#${failure.subscription_id}: ${failure.error}`).join('; ')}`);
      } else {
        setConfirmation(`Billing run complete: ${summary}`);
      }
      setConfirming(false);
      await onReload();
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return <section className="billing-action" aria-label="Run recurring billing">
    {!confirming ? <Button onClick={() => { setError(''); setConfirmation(''); setConfirming(true); }} disabled={busy}>
      <Play size={15} /> Run billing
    </Button> : <div className="billing-action__confirm">
      <span>Run billing for subscriptions due today?</span>
      <Button onClick={() => void run()} disabled={busy}>{busy ? 'Running…' : 'Confirm run'}</Button>
      <Button variant="secondary" onClick={() => setConfirming(false)} disabled={busy}>Cancel</Button>
    </div>}
    {error && <p className="billing-action__message is-error" role="alert"><CircleAlert size={15} />{error}</p>}
    {confirmation && <p className="billing-action__message is-success" role="status"><CircleCheck size={15} />{confirmation}</p>}
  </section>;
}

type PaymentMethod = 'cash' | 'bank_transfer' | 'card' | 'upi' | 'cheque' | 'other';
const paymentMethods: Array<{ value: PaymentMethod; label: string }> = [
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'upi', label: 'UPI' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'other', label: 'Other' },
];

function localDate(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function RecordInvoicePayment({ invoiceId, outstanding, onReload }: {
  invoiceId: number;
  outstanding: string;
  onReload: Reload;
}) {
  const [amount, setAmount] = useState(outstanding);
  const [method, setMethod] = useState<PaymentMethod>('bank_transfer');
  const [paidOn, setPaidOn] = useState(localDate);
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState('');

  useEffect(() => { setAmount(outstanding); }, [invoiceId, outstanding]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setConfirmation('');
    setConfirming(false);
    setBusy(true);
    try {
      const response = await http.post<{ data: { amount: string; invoice: { outstanding: string; status: string } } }>(
        `/invoices/${invoiceId}/payments`,
        { method, amount, paidOn, ...(note.trim() ? { note: note.trim() } : {}) },
      );
      const result = response.data.data;
      setConfirmation(`Payment of ${result.amount} recorded. Outstanding balance: ${result.invoice.outstanding}.`);
      setNote('');
      await onReload();
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return <form className="billing-action billing-payment" onSubmit={(event) => void submit(event)}>
    <div className="billing-payment__heading"><CreditCard size={17} /><strong>Record payment</strong></div>
    <p className="billing-payment__balance">Outstanding: <strong>{outstanding}</strong></p>
    <label className="billing-payment__field">Amount
      <input className="field__input" type="text" inputMode="decimal" autoComplete="off" required
        pattern="\d{1,10}(\.\d{1,2})?" maxLength={13} value={amount}
        onChange={(event) => { setAmount(event.target.value); setError(''); setConfirmation(''); }} />
    </label>
    <label className="billing-payment__field">Method
      <select className="field__input" value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)}>
        {paymentMethods.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
    <label className="billing-payment__field">Paid on
      <input className="field__input" type="date" required value={paidOn} onChange={(event) => setPaidOn(event.target.value)} />
    </label>
    <label className="billing-payment__field">Note <span className="caption">Optional</span>
      <input className="field__input" type="text" maxLength={500} value={note}
        onChange={(event) => setNote(event.target.value)} />
    </label>
    {error && <p className="billing-action__message is-error" role="alert"><CircleAlert size={15} />{error}</p>}
    {confirmation && <p className="billing-action__message is-success" role="status"><CircleCheck size={15} />{confirmation}</p>}
    {!confirming ? <Button type="button" onClick={() => { setError(''); setConfirmation(''); setConfirming(true); }} disabled={busy || !amount}>
      Record payment
    </Button> : <div className="billing-action__confirm">
      <span>Record {amount} against invoice #{invoiceId}?</span>
      <Button type="submit" disabled={busy}>{busy ? 'Recording…' : 'Confirm payment'}</Button>
      <Button type="button" variant="secondary" onClick={() => setConfirming(false)} disabled={busy}>Cancel</Button>
    </div>}
  </form>;
}
