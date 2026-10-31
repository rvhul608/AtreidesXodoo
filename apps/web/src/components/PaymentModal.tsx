import { useEffect, useMemo, useState } from 'react';
import { Banknote, CreditCard, Landmark, Smartphone } from 'lucide-react';
import { useStore, invoiceById, invoiceOutstanding } from '../lib/store';
import { fmtDate, money } from '../lib/format';
import { Button, Field, Input, Modal, Select, StatusPill, Textarea, useToast } from './ui';

const METHODS = [
  { value: 'UPI', label: 'UPI', icon: Smartphone },
  { value: 'Card', label: 'Card', icon: CreditCard },
  { value: 'Bank transfer', label: 'Bank transfer', icon: Landmark },
  { value: 'Cash', label: 'Cash', icon: Banknote },
];

export function PaymentModal({
  invoiceId,
  open,
  onClose,
  onPaid,
}: {
  invoiceId: number | null;
  open: boolean;
  onClose: () => void;
  onPaid?: (amount: number, invoiceNumber: string) => void;
}) {
  const { state, recordPayment } = useStore();
  const { push } = useToast();
  const invoice = invoiceId ? invoiceById(state, invoiceId) : undefined;
  const outstanding = invoice ? invoiceOutstanding(invoice) : 0;

  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('UPI');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAmount(outstanding ? outstanding.toFixed(2) : '');
    setMethod('UPI');
    setNotes('');
    setError(null);
  }, [open, invoiceId, outstanding]);

  const methodLabel = useMemo(
    () => METHODS.find((item) => item.value === method)?.label ?? method,
    [method],
  );

  if (!invoice) return null;

  const submit = () => {
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError('Enter an amount greater than zero.');
      return;
    }
    if (parsed > outstanding + 0.001) {
      setError(`Amount exceeds the outstanding balance of ${money(outstanding)}.`);
      return;
    }
    const result = recordPayment(invoice.id, parsed, method, notes.trim());
    if (!result.ok) {
      setError(result.message);
      return;
    }
    push({ title: 'Payment recorded', description: `${invoice.invoice_number} · ${money(parsed)} by ${methodLabel}` });
    onPaid?.(parsed, invoice.invoice_number);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record payment"
      description={`Apply a payment to ${invoice.invoice_number}.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button icon={Banknote} onClick={submit}>
            Record payment
          </Button>
        </>
      }
    >
      <div className="stack" style={{ gap: 16 }}>
        <div className="card" style={{ boxShadow: 'none', background: 'var(--surface-2)', border: 0 }}>
          <div className="card-body" style={{ padding: 14 }}>
            <div className="row-between">
              <div>
                <strong style={{ fontSize: 13 }}>{invoice.invoice_number}</strong>
                <div className="caption">Due {fmtDate(invoice.due_date)}</div>
              </div>
              <StatusPill status={invoice.status} />
            </div>
            <div className="row-between" style={{ marginTop: 10, fontSize: 13 }}>
              <span className="muted">Outstanding</span>
              <strong className="tabular">{money(outstanding)}</strong>
            </div>
          </div>
        </div>

        <div className="form-grid">
          <Field label="Amount" error={error} htmlFor="payment-amount">
            <div className="input-affix">
              <Input
                id="payment-amount"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(event) => {
                  setAmount(event.target.value);
                  setError(null);
                }}
                className="tabular"
              />
              <span>INR</span>
            </div>
          </Field>
          <Field label="Method" htmlFor="payment-method">
            <Select id="payment-method" value={method} onChange={(event) => setMethod(event.target.value)}>
              {METHODS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Note" hint="Optional. Stored on the payment record." htmlFor="payment-note" className="span-2">
            <Textarea
              id="payment-note"
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Bank reference, receipt number or context"
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
