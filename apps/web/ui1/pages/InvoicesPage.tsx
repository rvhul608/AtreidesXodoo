import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { FileText } from 'lucide-react';
import { invoicesApi } from '../mock/api';
import type { Invoice } from '../mock/data';
import { invoices, payments } from '../mock/data';
import { Button } from '../ui/Button';
import { Dialog, ConfirmDialog } from '../ui/Dialog';
import { Select, Input, Textarea } from '../ui/Field';
import { Empty, Pagination, dateUs, money, Timeline } from '../ui/Bits';
import { Pill, statusPill } from '../ui/Pill';
import { useToast } from '../ui/Toast';

const STATUSES = ['all', 'draft', 'confirmed', 'paid', 'partially_paid', 'overdue', 'cancelled'];
const METHODS = ['bank_transfer', 'upi', 'card', 'cash'];
const methodLabel: Record<string, string> = {
  bank_transfer: 'Bank transfer', upi: 'UPI', card: 'Card', cash: 'Cash',
};

const rowLink: CSSProperties = {
  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
  fontFamily: 'inherit', fontSize: 14, fontWeight: 600, color: 'var(--ink)',
};

export function InvoicesPage() {
  const toast = useToast();
  const [rows, setRows] = useState<Invoice[]>([]);
  const [meta, setMeta] = useState({ page: 1, pageSize: 25, total: 0 });
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Invoice | null>(null);
  const [payFor, setPayFor] = useState<Invoice | null>(null);
  const [cancelFor, setCancelFor] = useState<Invoice | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    invoicesApi.list(page, 25, status, search || undefined).then((res) => {
      setRows(res.data.data);
      setMeta(res.data.meta);
      setLoading(false);
      if (detail) {
        const fresh = invoices.find((i) => i.id === detail.id);
        if (fresh) setDetail(fresh);
      }
    });
  }, [page, status, search, detail]);

  useEffect(load, [load]);

  async function confirmInvoice(id: number) {
    await invoicesApi.confirm(id);
    setCancelFor(null);
    toast('Invoice confirmed');
    load();
  }

  async function sendInvoice(inv: Invoice) {
    await invoicesApi.send(inv.id);
    toast(`Invoice ${inv.ref} sent to ${inv.customer}`);
    load();
  }

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page-title">Invoices</h1>
          <span className="caption">confirm → send → record payment, all states update live</span>
        </div>
        <Button variant="primary">New invoice</Button>
      </div>

      <div className="toolbar">
        <input
          className="field__input"
          placeholder="Search ref or customer"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          aria-label="Search invoices"
          style={{ maxWidth: 260 }}
        />
        <select
          className="field__select"
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          aria-label="Filter by status"
          style={{ maxWidth: 180 }}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s === 'all' ? 'All statuses' : statusPill(s).label}</option>
          ))}
        </select>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="ds-table">
            <thead>
              <tr>
                <th>No.</th>
                <th>Customer</th>
                <th>Issued</th>
                <th>Due</th>
                <th className="is-money">Total</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>{Array.from({ length: 7 }).map((_, j) => (<td key={j}><span className="skeleton" style={{ height: 16, width: '70%' }} /></td>))}</tr>
                  ))
                : rows.map((inv) => {
                    const pill = statusPill(inv.status);
                    return (
                      <tr key={inv.id}>
                        <td data-label="No.">
                          <button className="ds-table__rowlink" style={rowLink} onClick={() => setDetail(inv)}>
                            {inv.ref}
                          </button>
                        </td>
                        <td data-label="Customer">{inv.customer}</td>
                        <td data-label="Issued" className="num">{dateUs(inv.issued_on)}</td>
                        <td data-label="Due" className="num">{dateUs(inv.due_on)}</td>
                        <td className="is-money" data-label="Total">{money(inv.total)}</td>
                        <td data-label="Status"><Pill tone={pill.tone}>{pill.label}</Pill></td>
                        <td data-label="Actions">
                          <div className="row-actions">
                            {inv.status === 'draft' && (
                              <Button size="sm" variant="primary" onClick={() => void confirmInvoice(inv.id)}>Confirm</Button>
                            )}
                            {inv.status === 'confirmed' && (
                              <>
                                <Button size="sm" onClick={() => void sendInvoice(inv)}>Send</Button>
                                <Button size="sm" variant="primary" onClick={() => setPayFor(inv)}>Record payment</Button>
                              </>
                            )}
                            {inv.status === 'partially_paid' && (
                              <Button size="sm" variant="primary" onClick={() => setPayFor(inv)}>Record payment</Button>
                            )}
                            {inv.status === 'overdue' && (
                              <>
                                <Button size="sm" variant="primary" onClick={() => setPayFor(inv)}>Record payment</Button>
                                <Button size="sm">Send reminder</Button>
                              </>
                            )}
                            {(inv.status === 'confirmed' || inv.status === 'draft') && (
                              <Button size="sm" onClick={() => setCancelFor(inv)}>Cancel</Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
          {!loading && rows.length === 0 && status === 'overdue' && (
            <Empty icon={FileText} title="No overdue invoices. Nice work." body="Nothing to chase today." />
          )}
          {!loading && rows.length === 0 && status !== 'overdue' && (
            <Empty icon={FileText} title="No invoices match" body="Try a different status or clear the search." />
          )}
        </div>
        <Pagination page={meta.page} pageSize={meta.pageSize} total={meta.total} onPage={setPage} />
      </div>

      <ConfirmDialog
        open={cancelFor !== null}
        title={`Cancel ${cancelFor?.ref}?`}
        body="The draft or confirmed amounts will no longer be collected. This can't be undone."
        confirmLabel="Cancel invoice"
        destructive
        onConfirm={() => {
          const inv = cancelFor;
          setCancelFor(null);
          if (inv) void invoicesApi.cancel(inv.id).then(() => toast(`Invoice ${inv.ref} cancelled`)).then(load);
        }}
        onClose={() => setCancelFor(null)}
      />

      <Dialog open={detail !== null} title={detail?.ref ?? ''} onClose={() => setDetail(null)} width={560}>
        {detail && (
          <div className="stack" style={{ gap: 16 }}>
            <div className="row row--between row--wrap">
              <div>
                <div className="card-title">{detail.customer}</div>
                <span className="caption">Subscription {detail.sub_ref} · issued {dateUs(detail.issued_on)} · due {dateUs(detail.due_on)}</span>
              </div>
              {(() => { const pill = statusPill(detail.status); return <Pill tone={pill.tone}>{pill.label}{pill.label === 'Overdue' ? ' ' + detail.due_on : ''}</Pill>; })()}
            </div>
            <table className="ds-table" style={{ fontSize: 14 }}>
              <thead>
                <tr><th>Line</th><th className="is-money">Qty</th><th className="is-money">Unit price</th><th className="is-money">Amount</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td>{detail.sub_ref} — plan seats</td>
                  <td className="is-money">1</td>
                  <td className="is-money">{money(detail.subtotal)}</td>
                  <td className="is-money">{money(detail.subtotal)}</td>
                </tr>
              </tbody>
            </table>
            <div className="stack" style={{ gap: 4, alignSelf: 'flex-end', minWidth: 240 }}>
              <TotalRow label="Subtotal" value={money(detail.subtotal)} />
              <TotalRow label={`${detail.customer.split(' ')[0]} discount`} value={`− ${money(detail.discount)}`} />
              <TotalRow label={`Tax ${Math.round(Number(detail.tax_rate) * 100)}%`} value={money(String((Number(detail.subtotal) - Number(detail.discount)) * Number(detail.tax_rate)))} />
              <div style={{ borderTop: '1px solid var(--border)' }} />
              <TotalRow label="Total" value={money(detail.total)} bold />
            </div>
            <div>
              <div className="caption" style={{ marginBottom: 8 }}>Status timeline</div>
              <InvoiceTimeline status={detail.status} issued={detail.issued_on} />
            </div>
            <p className="caption">
              Need the arithmetic? "Explain this amount" traces every rule applied to this invoice.
            </p>
          </div>
        )}
      </Dialog>

      <RecordPayDialog
        invoice={payFor}
        onClose={() => setPayFor(null)}
        onDone={(msg) => { toast(msg); setDetail(null); load(); }}
      />
    </div>
  );
}

function TotalRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="row row--between" style={{ fontSize: 14 }}>
      <span className="muted">{label}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: bold ? 700 : 400 }}>{value}</span>
    </div>
  );
}

function InvoiceTimeline({ status, issued }: { status: string; issued: string }) {
  const flow = ['draft', 'confirmed', 'paid'] as const;
  const map: Record<string, number> = { draft: 0, confirmed: 1, paid: 2, partially_paid: 1, overdue: 1, cancelled: 1 };
  const idx = map[status] ?? 0;
  return (
    <Timeline
      steps={flow.map((s, i) => ({
        label: s === 'paid' && (status === 'partially_paid') ? 'Paid (partly)' : s.charAt(0).toUpperCase() + s.slice(1),
        date: i <= idx ? issued : undefined,
        state: i === idx ? 'current' : i < idx ? 'done' : 'todo',
      }))}
    />
  );
}

function RecordPayDialog({
  invoice, onClose, onDone,
}: {
  invoice: Invoice | null;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('bank_transfer');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (invoice) {
      const already = paymentsFor(invoice.ref);
      setAmount(String(Math.max(Number(invoice.total) - already, 0).toFixed(2)));
      setMethod('bank_transfer');
      setNote('');
    }
  }, [invoice]);

  if (!invoice) return null;

  const disabled = invoice.status === 'cancelled' || invoice.status === 'paid';
  const outstanding = Number(invoice.total) - paymentsFor(invoice.ref);

  return (
    <Dialog
      title={`Record payment — ${invoice.ref}`}
      open
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={disabled || Number(amount) > outstanding || Number(amount) <= 0}
            title={disabled ? `This invoice is already ${invoice.status}` : undefined}
            onClick={() => {
              void invoicesApi
                .recordPayment(invoice.id, method, amount)
                .then(() => onDone(`Payment recorded on ${invoice.ref} — ${money(amount)} via ${methodLabel[method]}`));
            }}
          >
            Record payment
          </Button>
        </>
      }
    >
      <div className="stack" style={{ gap: 12 }}>
        <div className="row row--between">
          <span className="muted" style={{ fontSize: 14 }}>Outstanding balance</span>
          <span className="num" style={{ fontWeight: 700 }}>{money(String(outstanding))}</span>
        </div>
        <Input
          label="Amount"
          type="number"
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          error={Number(amount) > outstanding ? 'Amount is larger than the outstanding balance' : null}
        />
        <Select label="Method" value={method} onChange={(e) => setMethod(e.target.value)}>
          {METHODS.map((m) => <option key={m} value={m}>{methodLabel[m]}</option>)}
        </Select>
        <Textarea
          label="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Reference, payer name…"
        />
      </div>
    </Dialog>
  );
}

function paymentsFor(ref: string): number {
  return payments
    .filter((p) => p.invoice_ref === ref && p.status === 'succeeded')
    .reduce((sum, p) => sum + Number(p.amount), 0);
}
