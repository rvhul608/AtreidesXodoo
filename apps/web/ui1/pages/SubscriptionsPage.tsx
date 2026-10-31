import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { Layers } from 'lucide-react';
import { subscriptionsApi } from '../mock/api';
import type { Subscription } from '../mock/data';
import { Button } from '../ui/Button';
import { Empty, Pagination, dateUs, daysUntil } from '../ui/Bits';
import { Pill, statusPill } from '../ui/Pill';
import { RenewalRing } from '../ui/RenewalRing';
import { useToast } from '../ui/Toast';
import { ConfirmDialog, Dialog } from '../ui/Dialog';

const STATUSES = ['all', 'active', 'confirmed', 'quotation', 'paused', 'closed'];

const FLOW = ['draft', 'quotation', 'confirmed', 'active', 'closed'] as const;

export function SubscriptionsPage() {
  const toast = useToast();
  const [rows, setRows] = useState<Subscription[]>([]);
  const [meta, setMeta] = useState({ page: 1, pageSize: 25, total: 0 });
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<{ title: string; confirmLabel: string; fn: () => Promise<string> } | null>(null);
  const [detail, setDetail] = useState<Subscription | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    subscriptionsApi.list(page, 25, status, search || undefined).then((res) => {
      setRows(res.data.data);
      setMeta(res.data.meta);
      setLoading(false);
    });
  }, [page, status, search]);

  useEffect(load, [load]);

  async function confirmPending() {
    const p = pending;
    if (!p) return;
    const message = await p.fn();
    setPending(null);
    toast(message);
    load();
  }

  function ask(title: string, confirmLabel: string, fn: () => Promise<string>) {
    setPending({ title, confirmLabel, fn });
  }

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page-title">Subscriptions</h1>
          <span className="caption">the loop: every row shows its place in the billing period</span>
        </div>
        <Button variant="primary">New subscription</Button>
      </div>

      <div className="toolbar">
        <input
          className="field__input"
          placeholder="Search ref, customer or plan"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          aria-label="Search subscriptions"
          style={{ maxWidth: 280 }}
        />
        <select
          className="field__select"
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          aria-label="Filter by status"
          style={{ maxWidth: 180 }}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s === 'all' ? 'All statuses' : capital(s)}</option>
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
                <th>Plan</th>
                <th>Status</th>
                <th className="is-money">Amount</th>
                <th>Next bill</th>
                <th>Period</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <td key={j}><span className="skeleton" style={{ height: 16, width: '70%' }} /></td>
                      ))}
                    </tr>
                  ))
                : rows.map((s) => {
                    const pill = statusPill(s.status);
                    const left = s.next_bill ? daysUntil(s.next_bill) : null;
                    return (
                      <tr key={s.id}>
                        <td data-label="No.">
                          <button
                            className="ds-table__rowlink"
                            style={rowLink}
                            onClick={() => setDetail(s)}
                          >
                            {s.ref}
                          </button>
                        </td>
                        <td data-label="Customer">{s.customer}</td>
                        <td data-label="Plan">{s.plan} <span className="muted">/ {s.period}</span></td>
                        <td data-label="Status"><Pill tone={pill.tone}>{pill.label}</Pill></td>
                        <td className="is-money" data-label="Amount">{moneyCell(s.amount)}</td>
                        <td data-label="Next bill" className="num">{s.next_bill ? dateUs(s.next_bill) : '—'}</td>
                        <td data-label="Period">
                          {left !== null && s.status === 'active' ? (
                            <RenewalRing daysLeft={left} periodDays={s.cycle_length} />
                          ) : (
                            <span className="caption">{s.status === 'active' ? `${s.cycle_left} of ${s.cycle_length} days` : s.status === 'paused' ? 'paused' : 'not started'}</span>
                          )}
                        </td>
                        <td data-label="Actions">
                          <div className="row-actions">
                            {s.status === 'quotation' && (
                              <Button size="sm" variant="primary"
                                onClick={() => ask(
                                  'Confirm SUB?',
                                  'Confirm',
                                  () => subscriptionsApi.confirm(s.id).then(() => `${s.ref} confirmed and ready to activate`),
                                )}
                              >
                                Confirm
                              </Button>
                            )}
                            {s.status === 'confirmed' && (
                              <Button size="sm" variant="primary"
                                onClick={() => ask(
                                  'Activate SUB?',
                                  'Activate',
                                  () => subscriptionsApi.setActive(s.id).then(() => `${s.ref} activated — billing starts now`),
                                )}
                              >
                                Activate
                              </Button>
                            )}
                            {s.status === 'active' && (
                              <Button size="sm"
                                onClick={() => ask(
                                  `Close ${s.ref}?`,
                                  'Close subscription',
                                  () => subscriptionsApi.close(s.id).then(() => `${s.ref} closed. Access ends at period end.`),
                                )}
                              >
                                Close
                              </Button>
                            )}
                            {(s.status === 'closed' || s.status === 'draft') && (
                              <Button size="sm" disabled title="Not available for this status">
                                {s.status === 'closed' ? 'Closed' : 'Draft'}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
          {!loading && rows.length === 0 && (
            <Empty
              icon={Layers}
              title="No subscriptions here"
              body="No subscriptions yet. Create one from a quotation template."
            />
          )}
        </div>
        <Pagination page={meta.page} pageSize={meta.pageSize} total={meta.total} onPage={setPage} />
      </div>

      <ConfirmDialog
        open={pending !== null}
        title={pending?.title ?? ''}
        body="Only transitions this plan allows are offered. The backend re-checks the same rules."
        confirmLabel={pending?.confirmLabel ?? 'Confirm'}
        onConfirm={() => void confirmPending()}
        onClose={() => setPending(null)}
      />

      <Dialog open={detail !== null} title={detail?.ref ?? ''} onClose={() => setDetail(null)} width={520}>
        {detail && (
          <div className="stack" style={{ gap: 16 }}>
            <div className="row" style={{ gap: 16 }}>
              <RenewalRing daysLeft={detail.cycle_left} periodDays={detail.cycle_length} size="lg" />
              <div>
                <div className="card-title">{detail.customer}</div>
                <span className="muted" style={{ fontSize: 14 }}>
                  {detail.plan} · {detail.period} · {detail.quantity} seats · {detail.auto_renew ? 'auto-renew on' : 'auto-renew off'}
                </span>
              </div>
            </div>
            <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-card)', padding: 'var(--s4)' }}>
              <StatusTimeline status={detail.status} />
            </div>
            <p className="caption">Actions offered depend on the plan's flags; the backend enforces them too.</p>
          </div>
        )}
      </Dialog>
    </div>
  );
}

const moneyFmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 });
const moneyCell = (v: string) => moneyFmt.format(Number(v));
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const rowLink: CSSProperties = {
  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
  fontFamily: 'inherit', fontSize: 14, fontWeight: 600, color: 'var(--ink)',
};

function StatusTimeline({ status }: { status: string }) {
  const idx = FLOW.indexOf(status as (typeof FLOW)[number]);
  return (
    <div className="timeline">
      {FLOW.map((s, i) => {
        const display = status === 'paused' && s === 'active' ? 'Active (paused)' : capital(s);
        const state = status === 'paused' && s === 'active'
          ? 'current'
          : i === idx ? 'current' : i < idx ? 'done' : 'todo';
        return (
          <div key={s} className={`timeline__step${state === 'done' ? ' is-done' : ''}${state === 'current' ? ' is-current' : ''}`}>
            <span className="timeline__node" />
            <div>
              <div className="timeline__label">{display}</div>
              {s === 'active' && status === 'active' && <div className="caption">renews every period</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
