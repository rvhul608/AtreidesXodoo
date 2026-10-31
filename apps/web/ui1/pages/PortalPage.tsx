import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Package2 } from 'lucide-react';
import { invoicesApi, subscriptionsApi } from '../mock/api';
import type { Invoice, Subscription } from '../mock/data';
import { Button } from '../ui/Button';
import { Empty, dateUs, daysUntil, money, Pagination } from '../ui/Bits';
import { Pill, statusPill } from '../ui/Pill';
import { RenewalRing } from '../ui/RenewalRing';
import { useToast } from '../ui/Toast';
import { ConfirmDialog } from '../ui/Dialog';

export function PortalPage({ section }: { section: 'subs' | 'invoices' }) {
  const toast = useToast();
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState<Subscription | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([subscriptionsApi.portalList(), invoicesApi.portalList()]).then(([s, i]) => {
      setSubs(s.data);
      setInvoices(i.data);
      setLoading(false);
    });
  }, []);

  useEffect(load, [load]);

  const planAllows = (sub: Subscription, flag: 'pause' | 'renew' | 'early_close') => {
    /* Plan flags in the mock: yearly Pro allows pause+renew (no early close), monthly allows pause. */
    if (sub.period === 'yearly') return flag === 'pause' || flag === 'renew';
    return flag === 'pause' || flag === 'renew' || flag === 'early_close';
  };

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page-title">{section === 'subs' ? 'My subscriptions' : 'My invoices'}</h1>
          <span className="caption">only your own account · support is one tap away</span>
        </div>
        {section === 'invoices' && <Button variant="primary">Pay newest</Button>}
      </div>

      {section === 'subs' && (
        <div className="stack" style={{ gap: 16 }}>
          {loading
            ? Array.from({ length: 2 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 120 }} />)
            : subs.map((sub) => {
                const pill = statusPill(sub.status);
                const left = sub.next_bill ? daysUntil(sub.next_bill) : null;
                return (
                  <div className="card sub-card" key={sub.id}>
                    {left !== null && sub.status === 'active' && (
                      <RenewalRing daysLeft={left} periodDays={sub.cycle_length} size="lg" />
                    )}
                    <div className="sub-card__body">
                      <div className="row" style={{ gap: 12 }}>
                        <span className="card-title">{sub.plan} plan, {sub.period}</span>
                        <Pill tone={pill.tone}>{pill.label}</Pill>
                      </div>
                      <span className="muted" style={{ fontSize: 14 }}>
                        {left !== null && sub.status === 'active'
                          ? `${left} of ${sub.cycle_length} days · `
                          : ''}
                        {sub.next_bill ? `Renews ${dateUs(sub.next_bill)} · ` : 'Paused · '}
                        <strong className="num">{money(sub.amount)}</strong>
                        {sub.auto_renew ? ' · auto-renew on' : ' · auto-renew off'}
                      </span>
                    </div>
                    <div className="sub-card__actions">
                      {planAllows(sub, 'renew') && sub.status === 'active' && (
                        <Button onClick={() => toast('Auto-renew turned on for ' + sub.plan)}>Add seats</Button>
                      )}
                      {planAllows(sub, 'pause') && sub.status === 'active' && (
                        <Button onClick={() => toast(sub.plan + ' paused — billing stops, the period clock stops too')}>Pause</Button>
                      )}
                      {planAllows(sub, 'early_close') && sub.status === 'active' && (
                        <Button onClick={() => setClosing(sub)}>Close</Button>
                      )}
                      {sub.status === 'paused' && (
                        <Button variant="primary" onClick={() => toast(sub.plan + ' resumed')}>Resume</Button>
                      )}
                    </div>
                  </div>
                );
              })}
          {!loading && subs.length === 0 && (
            <div className="card">
              <Empty
                icon={Package2}
                title="No subscriptions yet"
                body="When a subscription is set up for you, it appears here with its renewal ring."
              />
            </div>
          )}
        </div>
      )}

      {section === 'invoices' && (
        <div className="card">
          <div className="table-wrap">
            <table className="ds-table">
              <thead>
                <tr><th>Invoice</th><th>Issued</th><th>Due</th><th className="is-money">Total</th><th>Status</th><th aria-label="Actions" /></tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 3 }).map((_, i) => (<tr key={i}>{Array.from({ length: 6 }).map((_, j) => (<td key={j}><span className="skeleton" style={{ height: 16, width: '70%' }} /></td>))}</tr>))
                  : invoices
                      .slice((page - 1) * 25, page * 25)
                      .map((inv) => {
                        const pill = statusPill(inv.status);
                        const payable = inv.status === 'confirmed' || inv.status === 'overdue' || inv.status === 'partially_paid';
                        return (
                          <tr key={inv.id}>
                            <td data-label="Invoice"><strong style={{ fontWeight: 600 }}>{inv.ref}</strong></td>
                            <td data-label="Issued" className="num">{dateUs(inv.issued_on)}</td>
                            <td data-label="Due" className="num">{dateUs(inv.due_on)}</td>
                            <td className="is-money" data-label="Total">{money(inv.total)}</td>
                            <td data-label="Status">
                              <Pill tone={pill.tone}>{pill.label === 'Confirmed' ? `Due ${dateUs(inv.due_on)}` : pill.label}</Pill>
                            </td>
                            <td data-label="Actions">
                              <div className="row-actions">
                                <Button size="sm"><Download size={14} /> PDF</Button>
                                <Button
                                  size="sm"
                                  variant="primary"
                                  disabled={!payable}
                                  onClick={() =>
                                    void invoicesApi
                                      .recordPayment(inv.id, 'upi', inv.total)
                                      .then(() => toast(`Payment of ${money(inv.total)} received. ${inv.ref} is now paid.`))
                                      .then(load)
                                  }
                                >
                                  Pay now
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
              </tbody>
            </table>
            {!loading && invoices.length === 0 && (
              <Empty title="No invoices yet" body="Every period an invoice is issued here first." icon={Package2} />
            )}
          </div>
          <Pagination page={page} pageSize={25} total={invoices.length} onPage={setPage} />
        </div>
      )}

      <p className="caption" style={{ textAlign: 'right' }}>
        Questions? Open the chat at the bottom right, or <Link to="/portal">back to subscriptions</Link>.
      </p>

      <ConfirmDialog
        open={closing !== null}
        title={`Close ${closing?.plan ?? ''} plan (${closing?.period})?`}
        body="Access ends at the end of the paid period. Your data stays available for 30 days."
        confirmLabel="Close subscription"
        destructive
        onConfirm={() => {
          const sub = closing;
          setClosing(null);
          if (sub) void subscriptionsApi.close(sub.id).then(() => toast(`${sub.plan} plan closed. Access ends at period end.`)).then(load);
        }}
        onClose={() => setClosing(null)}
      />
    </div>
  );
}
