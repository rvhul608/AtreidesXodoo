import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Download, Filter, Plus, RefreshCw } from 'lucide-react';
import {
  useStore,
  customerName,
  planName,
  subscriptionTotal,
  daysUntil,
  subscriptionProgress,
} from '../lib/store';
import { fmtDate, money } from '../lib/format';
import { PageHeader } from '../components/page';
import { Button, EmptyState, Input, Pagination, SearchInput, Select, StatusPill, Tabs } from '../components/ui';
import { RenewalRing } from '../components/brand';
import type { SubscriptionStatus } from '../lib/types';

const statuses: Array<SubscriptionStatus | 'all'> = [
  'all',
  'Active',
  'Confirmed',
  'Quotation',
  'Draft',
  'Paused',
  'Closed',
];

export function SubscriptionsPage() {
  const { state, notify } = useStore();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('all');
  const [plan, setPlan] = useState('all');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const customerFilter = params.get('customer');

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return state.subscriptions
      .filter((subscription) => {
        if (status !== 'all' && subscription.status !== status) return false;
        if (plan !== 'all' && subscription.planId !== Number(plan)) return false;
        if (customerFilter && subscription.customerId !== Number(customerFilter)) return false;
        if (!term) return true;
        return (
          subscription.subscription_number.toLowerCase().includes(term) ||
          customerName(state, subscription.customerId).toLowerCase().includes(term) ||
          planName(state, subscription.planId).toLowerCase().includes(term)
        );
      })
      .sort((a, b) => b.id - a.id);
  }, [state, search, status, plan, customerFilter]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: state.subscriptions.length };
    for (const item of state.subscriptions) {
      map[item.status] = (map[item.status] ?? 0) + 1;
    }
    return map;
  }, [state.subscriptions]);

  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="page page-wide">
      <PageHeader
        title="Subscriptions"
        subtitle="Every plan in the loop, from draft quotation to renewal. Filters run across the full workspace."
        actions={
          <>
            <Button
              variant="secondary"
              icon={Download}
              onClick={() => notify('Export queued', 'The subscription CSV will be emailed to you.', 'info')}
            >
              Export
            </Button>
            <Button icon={Plus} onClick={() => navigate('/subscriptions/new')}>
              New subscription
            </Button>
          </>
        }
      />

      {customerFilter ? (
        <div className="notice info" style={{ marginBottom: 16 }}>
          <Filter aria-hidden="true" />
          <span>
            Showing subscriptions for <strong>{customerName(state, Number(customerFilter))}</strong>.
          </span>
          <button
            type="button"
            className="btn-link"
            style={{ marginLeft: 'auto' }}
            onClick={() => {
              const next = new URLSearchParams(params);
              next.delete('customer');
              setParams(next);
            }}
          >
            Clear filter
          </button>
        </div>
      ) : null}

      <div className="card" style={{ marginBottom: 16 }}>
        <Tabs
          tabs={statuses.map((item) => ({
            value: item,
            label: item === 'all' ? 'All' : item,
            count: counts[item] ?? 0,
          }))}
          value={status}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        />
      </div>

      <div className="toolbar">
        <SearchInput
          className="search"
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          placeholder="Search number, customer or plan"
        />
        <Select
          value={plan}
          onChange={(event) => {
            setPlan(event.target.value);
            setPage(1);
          }}
          aria-label="Filter by plan"
          style={{ width: 190 }}
        >
          <option value="all">All plans</option>
          {state.plans.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </Select>
        <span className="spacer" />
        <span className="caption">
          {filtered.length} subscription{filtered.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="card">
        {paged.length === 0 ? (
          <EmptyState
            icon={RefreshCw}
            title="No subscriptions match these filters."
            description="Try a different status or clear the search. New subscriptions start as a draft."
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setSearch('');
                  setStatus('all');
                  setPlan('all');
                  const next = new URLSearchParams(params);
                  next.delete('customer');
                  setParams(next);
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="data responsive">
                <thead>
                  <tr>
                    <th>Number</th>
                    <th>Customer</th>
                    <th>Plan</th>
                    <th>Status</th>
                    <th>Next bill</th>
                    <th className="num">Period total</th>
                    <th className="actions" />
                  </tr>
                </thead>
                <tbody>
                  {paged.map((subscription) => {
                    const days = daysUntil(subscription.next_billing_date ?? subscription.expiry_date);
                    const progress = subscriptionProgress(subscription);
                    return (
                      <tr
                        key={subscription.id}
                        className="clickable"
                        onClick={() => navigate(`/subscriptions/${subscription.id}`)}
                      >
                        <td data-label="Number">
                          <span className="strong">{subscription.subscription_number}</span>
                          <span className="sub">Started {fmtDate(subscription.start_date)}</span>
                        </td>
                        <td data-label="Customer">{customerName(state, subscription.customerId)}</td>
                        <td data-label="Plan">
                          {planName(state, subscription.planId)}
                          <span className="sub">{subscription.payment_terms}</span>
                        </td>
                        <td data-label="Status">
                          <StatusPill status={subscription.status} />
                        </td>
                        <td data-label="Next bill">
                          <div className="row" style={{ gap: 8 }}>
                            {subscription.status === 'Active' ? (
                              <RenewalRing
                                value={progress}
                                size={28}
                                stroke={3}
                                days={days}
                                tone={days !== null && days <= 4 ? 'warn' : 'loop'}
                              />
                            ) : null}
                            <div>
                              {fmtDate(subscription.next_billing_date)}
                              <span className="sub">
                                {days !== null ? `${days} days` : subscription.status === 'Paused' ? 'Paused' : '—'}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td data-label="Period total" className="num">
                          {money(subscriptionTotal(subscription))}
                        </td>
                        <td data-label="" className="actions">
                          <Button
                            variant="ghost"
                            size="sm"
                            iconRight={ArrowRight}
                            onClick={(event) => {
                              event.stopPropagation();
                              navigate(`/subscriptions/${subscription.id}`);
                            }}
                          >
                            Open
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={pageSize} total={filtered.length} onChange={setPage} />
          </>
        )}
      </div>

      <div className="notice" style={{ marginTop: 16 }}>
        <Input type="hidden" value="" />
        <span>
          Status changes follow the plan flags. A plan that does not allow early close will only close at expiry, and the
          button explains that before you click.
        </span>
      </div>
    </div>
  );
}
