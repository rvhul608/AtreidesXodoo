import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  FileText,
  LifeBuoy,
  MessageSquare,
  Plus,
  RefreshCw,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import {
  useStore,
  customerName,
  invoiceDisplayStatus,
  invoiceOutstanding,
  planName,
  subscriptionProgress,
  daysUntil,
  invoiceById,
  isOverdue,
} from '../lib/store';
import { revenueSeries } from '../lib/seed';
import { compactMoney, fmtDate, money, relativeTime } from '../lib/format';
import { BarChart, Sparkline } from '../components/charts';
import { RenewalRing } from '../components/brand';
import { Kpi, PageHeader } from '../components/page';
import { Button, EmptyState, StatusPill } from '../components/ui';

export function DashboardPage() {
  const { state, openChat } = useStore();
  const navigate = useNavigate();
  const role = state.session?.role ?? 'admin';

  const metrics = useMemo(() => {
    const active = state.subscriptions.filter((subscription) => subscription.status === 'Active');
    const mrr = active.reduce((sum, subscription) => {
      const plan = state.plans.find((item) => item.id === subscription.planId);
      const total = subscription.lines.reduce((lineSum, line) => lineSum + line.amount + line.tax_amount, 0);
      if (plan?.period === 'yearly') return sum + total / 12;
      if (plan?.period === 'weekly') return sum + (total * 52) / 12;
      if (plan?.period === 'daily') return sum + total * 30;
      return sum + total;
    }, 0);
    const open = state.invoices.filter(
      (invoice) => invoice.status !== 'Cancelled' && invoice.status !== 'Paid' && invoiceOutstanding(invoice) > 0,
    );
    const outstanding = open.reduce((sum, invoice) => sum + invoiceOutstanding(invoice), 0);
    const overdue = state.invoices.filter((invoice) => isOverdue(invoice));
    const overdueAmount = overdue.reduce((sum, invoice) => sum + invoiceOutstanding(invoice), 0);
    const leakage = state.leakage
      .filter((finding) => finding.status === 'Open')
      .reduce((sum, finding) => sum + finding.amount, 0);
    return { active, mrr, open, outstanding, overdue, overdueAmount, leakage };
  }, [state]);

  const overdue = useMemo(
    () =>
      state.invoices
        .filter((invoice) => isOverdue(invoice))
        .sort((a, b) => a.due_date.localeCompare(b.due_date)),
    [state.invoices],
  );

  const renewals = useMemo(
    () =>
      state.subscriptions
        .filter((subscription) => subscription.status === 'Active')
        .filter((subscription) => {
          const days = subscription.next_billing_date
            ? daysUntil(subscription.next_billing_date)
            : daysUntil(subscription.expiry_date);
          return days !== null && days <= 21;
        })
        .sort((a, b) => {
          const aDate = a.next_billing_date ?? a.expiry_date ?? '';
          const bDate = b.next_billing_date ?? b.expiry_date ?? '';
          return aDate.localeCompare(bDate);
        })
        .slice(0, 5),
    [state.subscriptions],
  );

  const latestRevenue = revenueSeries[revenueSeries.length - 1].value;
  const revenueDelta = Math.round(
    ((latestRevenue - revenueSeries[revenueSeries.length - 2].value) / revenueSeries[revenueSeries.length - 2].value) *
      100,
  );
  const firstName = state.session?.name.split(' ')[0] ?? 'there';
  const openQuestions = state.questions.filter((question) => question.status === 'open').length;
  const chatAnswers = state.articles.reduce((sum, article) => sum + article.used, 0);

  return (
    <div className="page page-wide">
      <PageHeader
        title={`Good morning, ${firstName}`}
        subtitle="Here is the money and the work that needs a decision today. Every number is live from this workspace."
        actions={
          <>
            <Button variant="secondary" icon={Sparkles} onClick={openChat}>
              Ask the assistant
            </Button>
            <Button icon={Plus} onClick={() => navigate('/subscriptions/new')}>
              New subscription
            </Button>
          </>
        }
      />

      <div className="kpi-grid">
        <Kpi
          label="Active subscriptions"
          value={metrics.active.length}
          icon={RefreshCw}
          tone="good"
          foot={
            <>
              <span className="delta">
                <TrendingUp aria-hidden="true" /> {Math.round((metrics.active.length / state.subscriptions.length) * 100)}%
              </span>
              of {state.subscriptions.length} total
            </>
          }
          spark={<Sparkline values={[18, 19, 20, 19, 21, 22, 23, metrics.active.length]} />}
        />
        <Kpi
          label="Monthly recurring revenue"
          value={compactMoney(metrics.mrr)}
          icon={Wallet}
          foot={
            <>
              <span className="delta">
                <TrendingUp aria-hidden="true" /> {revenueDelta}%
              </span>
              vs last month
            </>
          }
          spark={<Sparkline values={revenueSeries.map((point) => point.value)} />}
        />
        <Kpi
          label="Outstanding"
          value={compactMoney(metrics.outstanding)}
          icon={FileText}
          tone="warn"
          foot={<>{metrics.open.length} open invoices need payment</>}
          spark={<Sparkline values={[9, 8, 10, 11, 9, 8, 7, metrics.open.length]} tone="good" />}
        />
        <Kpi
          label="Overdue invoices"
          value={metrics.overdue.length}
          icon={AlertTriangle}
          tone="bad"
          foot={
            <>
              <span className="delta down">{compactMoney(metrics.overdueAmount)}</span> at risk
            </>
          }
          spark={<Sparkline values={[4, 5, 4, 6, 5, 6, 5, metrics.overdue.length]} tone="bad" />}
        />
      </div>

      <div className="dash-grid">
        <div className="dash-stack">
          <section className="card chart-card">
            <div className="card-body">
              <div className="chart-header">
                <div>
                  <div className="caption">Revenue by month</div>
                  <div className="chart-total">{money(latestRevenue, { decimals: 0 })}</div>
                  <div className="chart-caption">
                    <span className="delta" style={{ marginRight: 6 }}>
                      <TrendingUp aria-hidden="true" /> {revenueDelta}%
                    </span>
                    October 2026 · recognised revenue
                  </div>
                </div>
                <div className="chart-legend">
                  <span>
                    <i aria-hidden="true" /> This year
                  </span>
                  <span>
                    <i className="muted" aria-hidden="true" /> Earlier months
                  </span>
                </div>
              </div>
              <BarChart data={revenueSeries} />
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <div>
                <h3>Overdue invoices</h3>
                <span className="caption">Oldest first. Colour is a signal, not a decoration.</span>
              </div>
              <Button variant="ghost" size="sm" iconRight={ArrowRight} onClick={() => navigate('/invoices?status=Overdue')}>
                View all
              </Button>
            </div>
            {overdue.length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title="No overdue invoices. Nice work."
                description="Every open invoice is still inside its payment terms."
              />
            ) : (
              <div className="worklist">
                {overdue.slice(0, 6).map((invoice) => {
                  const daysLate = Math.abs(daysUntil(invoice.due_date) ?? 0);
                  return (
                    <button
                      key={invoice.id}
                      type="button"
                      className="worklist-row"
                      onClick={() => navigate(`/invoices/${invoice.id}`)}
                    >
                      <span className="stat-icon bad" style={{ width: 30, height: 30 }}>
                        <FileText aria-hidden="true" />
                      </span>
                      <span className="wl-main">
                        <strong>
                          {invoice.invoice_number} · {customerName(state, invoice.customerId)}
                        </strong>
                        <span>
                          Due {fmtDate(invoice.due_date)} · {daysLate} day{daysLate === 1 ? '' : 's'} late
                        </span>
                      </span>
                      <span className="wl-amount">{money(invoiceOutstanding(invoice))}</span>
                      <StatusPill status={invoiceDisplayStatus(invoice)} />
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <div className="grid grid-2">
            <section className="card">
              <div className="card-head">
                <h3>Renewal queue</h3>
                <Button variant="ghost" size="sm" iconRight={ArrowRight} onClick={() => navigate('/renewals')}>
                  Open
                </Button>
              </div>
              {renewals.length === 0 ? (
                <EmptyState icon={CalendarClock} title="Nothing renews in the next three weeks." />
              ) : (
                <div className="renewal-strip">
                  {renewals.map((subscription) => {
                    const days = subscription.next_billing_date
                      ? daysUntil(subscription.next_billing_date)
                      : daysUntil(subscription.expiry_date);
                    const progress = subscriptionProgress(subscription);
                    return (
                      <button
                        key={subscription.id}
                        type="button"
                        className="renewal-row"
                        onClick={() => navigate(`/subscriptions/${subscription.id}`)}
                        style={{ textAlign: 'left', background: 'transparent', borderTop: 0, borderLeft: 0, borderRight: 0 }}
                      >
                        <RenewalRing
                          value={progress}
                          size={38}
                          stroke={3.5}
                          days={days}
                          tone={days !== null && days <= 4 ? 'warn' : 'loop'}
                        />
                        <span className="renewal-main">
                          <strong>{customerName(state, subscription.customerId)}</strong>
                          <span>{planName(state, subscription.planId)}</span>
                        </span>
                        <span className="renewal-days">
                          <strong>{fmtDate(subscription.next_billing_date ?? subscription.expiry_date, false)}</strong>
                          {days} days
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="card">
              <div className="card-head">
                <h3>Support assistant</h3>
                <StatusPill status="Live" tone="good" />
              </div>
              <div className="card-body" style={{ paddingTop: 14 }}>
                <div className="row" style={{ gap: 12 }}>
                  <span className="stat-icon info" style={{ width: 40, height: 40 }}>
                    <MessageSquare aria-hidden="true" />
                  </span>
                  <div>
                    <strong style={{ fontSize: 15 }}>{chatAnswers.toLocaleString('en-IN')} answers used</strong>
                    <div className="caption">Grounded in {state.articles.filter((a) => a.status === 'Active').length} active articles</div>
                  </div>
                </div>
                <div className="notice info" style={{ marginTop: 14 }}>
                  <Sparkles aria-hidden="true" />
                  <span>
                    {openQuestions} question{openQuestions === 1 ? '' : 's'} the bot could not answer. Write an article to
                    close the loop.
                  </span>
                </div>
                <div className="inline-actions" style={{ marginTop: 14 }}>
                  <Button size="sm" variant="secondary" onClick={() => navigate('/support')}>
                    Support content
                  </Button>
                  <Button size="sm" variant="ghost" iconRight={ArrowRight} onClick={openChat}>
                    Test the bot
                  </Button>
                </div>
              </div>
              <div className="chat-stats">
                <div>
                  <b>{state.tickets.length}</b>
                  <span>Tickets from chat</span>
                </div>
                <div>
                  <b>{openQuestions}</b>
                  <span>Open questions</span>
                </div>
                <div>
                  <b>86%</b>
                  <span>Answered without a person</span>
                </div>
              </div>
            </section>
          </div>
        </div>

        <div className="dash-stack">
          <section className="card">
            <div className="card-head">
              <h3>Needs attention</h3>
              <span className="caption">Today</span>
            </div>
            <div className="card-body" style={{ paddingTop: 4, paddingBottom: 8 }}>
              <div className="stat-row">
                <span className="stat-icon bad">
                  <AlertTriangle aria-hidden="true" />
                </span>
                <span className="stat-main">
                  <strong>{metrics.overdue.length} overdue invoices</strong>
                  <span>{compactMoney(metrics.overdueAmount)} past due</span>
                </span>
                <Button variant="ghost" size="sm" onClick={() => navigate('/invoices?status=Overdue')}>
                  Chase
                </Button>
              </div>
              <div className="stat-row">
                <span className="stat-icon warn">
                  <CalendarClock aria-hidden="true" />
                </span>
                <span className="stat-main">
                  <strong>{renewals.length} renewals this month</strong>
                  <span>Next: {renewals[0] ? fmtDate(renewals[0].next_billing_date ?? renewals[0].expiry_date, false) : 'none'}</span>
                </span>
                <Button variant="ghost" size="sm" onClick={() => navigate('/renewals')}>
                  Review
                </Button>
              </div>
              <div className="stat-row">
                <span className="stat-icon info">
                  <LifeBuoy aria-hidden="true" />
                </span>
                <span className="stat-main">
                  <strong>{state.tickets.filter((ticket) => ticket.status !== 'Resolved').length} open tickets</strong>
                  <span>{openQuestions} unanswered questions</span>
                </span>
                <Button variant="ghost" size="sm" onClick={() => navigate('/tickets')}>
                  Open
                </Button>
              </div>
              {role === 'admin' ? (
                <div className="stat-row">
                  <span className="stat-icon warn">
                    <TrendingDown aria-hidden="true" />
                  </span>
                  <span className="stat-main">
                    <strong>{compactMoney(metrics.leakage)} revenue at risk</strong>
                    <span>{state.leakage.filter((item) => item.status === 'Open').length} open findings</span>
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => navigate('/leakage')}>
                    Review
                  </Button>
                </div>
              ) : null}
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <h3>Activity</h3>
              <Button variant="ghost" size="sm" onClick={() => navigate('/outbox')}>
                Outbox
              </Button>
            </div>
            <div className="card-body" style={{ paddingTop: 4, paddingBottom: 8 }}>
              {state.notifications.slice(0, 6).map((item) => (
                <div key={item.id} className="activity-row">
                  <span className={`activity-dot ${item.tone === 'danger' ? 'bad' : item.tone === 'warn' ? 'warn' : item.tone === 'good' ? 'good' : ''}`} />
                  <span className="activity-main">
                    <strong>{item.title}</strong>
                    <span>{item.detail}</span>
                  </span>
                  <time>{relativeTime(item.time)}</time>
                </div>
              ))}
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <h3>Quick actions</h3>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Button variant="secondary" block icon={Plus} onClick={() => navigate('/subscriptions/new')}>
                Create from a template
              </Button>
              <Button variant="secondary" block icon={FileText} onClick={() => navigate('/invoices')}>
                Review invoices
              </Button>
              <Button variant="secondary" block icon={ArrowUpRight} onClick={() => navigate('/time-machine')}>
                Open billing time machine
              </Button>
              <Button variant="secondary" block icon={Sparkles} onClick={openChat}>
                Ask the support assistant
              </Button>
            </div>
          </section>

          {role === 'admin' ? (
            <section className="card">
              <div className="card-body">
                <div className="row" style={{ gap: 10 }}>
                  <span className="stat-icon good" style={{ width: 34, height: 34 }}>
                    <CheckCircle2 aria-hidden="true" />
                  </span>
                  <div>
                    <strong style={{ fontSize: 13 }}>Last billing run succeeded</strong>
                    <div className="caption">
                      {state.opsRuns[0]?.created ?? 0} invoices · {((state.opsRuns[0]?.duration_ms ?? 0) / 1000).toFixed(1)}s
                    </div>
                  </div>
                </div>
                <div className="inline-actions" style={{ marginTop: 12 }}>
                  <Button size="sm" variant="secondary" onClick={() => navigate('/ops')}>
                    Ops monitor
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => navigate('/invoices')}>
                    Run billing
                  </Button>
                </div>
              </div>
            </section>
          ) : null}
        </div>
      </div>

      {metrics.overdue.length > 0 ? (
        <p className="caption" style={{ marginTop: 18 }}>
          Oldest overdue: {invoiceById(state, overdue[0].id)?.invoice_number} · {customerName(state, overdue[0].customerId)}.
        </p>
      ) : null}
    </div>
  );
}
