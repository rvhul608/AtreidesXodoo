import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CircleDollarSign, Inbox, MessageSquareText } from 'lucide-react';
import { reports } from '../mock/api';
import { dashboard, chatStats } from '../mock/data';
import { Empty, Kpi, money, moneyShort, BarChart, ProgressBar } from '../ui/Bits';
import { Pill, statusPill } from '../ui/Pill';
import { Button } from '../ui/Button';

export function DashboardPage({ role }: { role: 'admin' | 'staff' }) {
  const [data, setData] = useState<typeof dashboard | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    reports
      .getDashboard()
      .then((res) => setData(res.data))
      .catch(() => setError(true));
  }, []);

  const kpis = data?.kpis;

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <span className="caption">October 2026 · live</span>
        </div>
        <div className="row">
          <Button>Export</Button>
          <button className="btn btn--primary" onClick={() => window.location.reload()}>
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid--4">
        <Kpi label="Active subscriptions" value={kpis ? String(kpis.active_subs) : ''} hint="billed every period" loading={!kpis} />
        <Kpi label="Revenue (month)" value={kpis ? money(kpis.revenue_month) : ''} hint={`${kpis ? money(kpis.collected_month) : ''} collected`} loading={!kpis} />
        <Kpi label="Outstanding" value={kpis ? money(kpis.outstanding) : ''} hint="across all customers" loading={!kpis} />
        <Kpi
          label="Overdue invoices"
          value={kpis ? String(kpis.overdue_count) : ''}
          pill={kpis ? { tone: 'bad', label: `${moneyShort(kpis.overdue_amount)} at risk` } : undefined}
          hint="oldest first in the worklist"
          loading={!kpis}
        />
      </div>

      <div className="grid grid--side">
        <section className="card card--pad">
          <div className="card__header--plain">
            <h2 className="section-title">Revenue by month</h2>
            <span className="caption">one colour, billed vs. collected</span>
          </div>
          {data ? (
            <div style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: 560 }}>
                <BarChart series={data.revenue_series} />
              </div>
            </div>
          ) : (
            <div className="skeleton" style={{ height: 180 }} />
          )}
          <p className="caption" style={{ marginTop: 12 }}>
            Billing runs daily. Figures update when the run finishes — no refresh needed.
          </p>
        </section>

        <section className="card">
          <div className="card__header">
            <h2 className="section-title" style={{ fontSize: 16 }}>Overdue invoices</h2>
            <Link to="/invoices" className="caption">Open list</Link>
          </div>
          {error ? (
            <Empty icon={Inbox} title="Couldn't load invoices" body="Check the API connection and try again." />
          ) : (
            <div className="table-wrap">
              <table className="ds-table">
                <thead>
                  <tr>
                    <th>No.</th>
                    <th>Customer</th>
                    <th className="is-money">Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.overdue_invoices.map((inv) => {
                    const pill = statusPill(inv.status);
                    return (
                      <tr key={inv.id}>
                        <td data-label="No."><Link to="/invoices" className="ds-table__rowlink">{inv.ref}</Link></td>
                        <td data-label="Customer">{inv.customer}</td>
                        <td className="is-money" data-label="Amount">{money(inv.total)}</td>
                        <td data-label="Status"><Pill tone="bad">{pill.label}</Pill></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {data && data.overdue_invoices.length === 0 && (
                <Empty icon={CircleDollarSign} title="No overdue invoices. Nice work." body="Nothing needs chasing today." />
              )}
            </div>
          )}
        </section>
      </div>

      {role === 'admin' && (
        <section className="card card--pad">
          <div className="row row--between" style={{ marginBottom: 12 }}>
            <h2 className="section-title" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <MessageSquareText size={20} aria-hidden="true" /> Support assistant
            </h2>
            <Link to="/support-content" className="caption">Maintain articles</Link>
          </div>
          <div className="grid grid--4">
            <MiniStat label="Chats this week" value={String(chatStats.chats_this_week)} />
            <ProgressStat
              label="Answered without a person"
              value={`${chatStats.deflected_percent}%`}
              progress={chatStats.deflected_percent}
            />
            <MiniStat label="Tickets from chat" value={String(chatStats.tickets_from_chat)} />
            <MiniStat label="Questions unresolved" value="6" hint="see the unanswered list" />
          </div>
        </section>
      )}

      {role === 'staff' && (
        <section className="card card--pad">
          <h2 className="section-title" style={{ marginBottom: 8 }}>Today</h2>
          <p className="muted" style={{ fontSize: 14 }}>
            2 quotations waiting to be confirmed, 1 payment to record, 1 invoice to send.
          </p>
          <div className="row" style={{ marginTop: 16, flexWrap: 'wrap' }}>
            <span className="pill pill--info"><span className="pill__dot" /> 2 quotations</span>
            <span className="pill pill--warn"><span className="pill__dot" /> 1 payment due</span>
            <span className="pill pill--good"><span className="pill__dot" /> 9 renewals next 30 days</span>
          </div>
        </section>
      )}
    </div>
  );
}

function MiniStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="stack" style={{ gap: 2 }}>
      <span className="caption">{label}</span>
      <span style={{ fontSize: 24, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      {hint && <span className="caption">{hint}</span>}
    </div>
  );
}

function ProgressStat({ label, value, progress }: { label: string; value: string; progress: number }) {
  return (
    <div className="stack" style={{ gap: 6 }}>
      <span className="caption">{label}</span>
      <span style={{ fontSize: 24, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      <ProgressBar value={progress} />
    </div>
  );
}
