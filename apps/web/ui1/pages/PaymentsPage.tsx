import { useCallback, useEffect, useState } from 'react';
import { CreditCard } from 'lucide-react';
import { paymentsApi } from '../mock/api';
import type { Payment } from '../mock/data';
import { Empty, Pagination, dateUs, money } from '../ui/Bits';
import { Pill } from '../ui/Pill';

const methodLabel: Record<string, string> = {
  bank_transfer: 'Bank transfer', upi: 'UPI', card: 'Card', cash: 'Cash',
};

export function PaymentsPage() {
  const [rows, setRows] = useState<Payment[]>([]);
  const [meta, setMeta] = useState({ page: 1, pageSize: 25, total: 0 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    paymentsApi.list(page, 25, search || undefined).then((res) => {
      setRows(res.data.data);
      setMeta(res.data.meta);
      setLoading(false);
    });
  }, [page, search]);

  useEffect(load, [load]);

  let collected = 0;
  rows.forEach((p) => { if (p.status === 'succeeded') collected += Number(p.amount); });

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page-title">Payments</h1>
          <span className="caption">recorded against invoices · failures stay visible until reconciled</span>
        </div>
      </div>

      <input
        className="field__input"
        placeholder="Search payment, invoice or customer"
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        aria-label="Search payments"
        style={{ maxWidth: 300 }}
      />

      <div className="card">
        <div className="table-wrap">
          <table className="ds-table">
            <thead>
              <tr>
                <th>Ref</th>
                <th>Invoice</th>
                <th>Customer</th>
                <th>Method</th>
                <th className="is-money">Amount</th>
                <th>Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>{Array.from({ length: 7 }).map((_, j) => (<td key={j}><span className="skeleton" style={{ height: 16, width: '70%' }} /></td>))}</tr>
                  ))
                : rows.map((p) => {
                    const tone = p.status === 'succeeded' ? 'good' : p.status === 'failed' ? 'bad' : 'warn';
                    const label = p.status === 'succeeded' ? 'Paid' : p.status === 'failed' ? 'Failed' : 'Pending';
                    return (
                      <tr key={p.id}>
                        <td data-label="Ref">{p.ref}</td>
                        <td data-label="Invoice">{p.invoice_ref}</td>
                        <td data-label="Customer">{p.customer}</td>
                        <td data-label="Method">{methodLabel[p.method]}</td>
                        <td className="is-money" data-label="Amount">{money(p.amount)}</td>
                        <td data-label="Date" className="num">{dateUs(p.paid_on)}</td>
                        <td data-label="Status"><Pill tone={tone}>{label}</Pill></td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
          {!loading && rows.length === 0 && (
            <Empty icon={CreditCard} title="No payments match" body="Try a different search, or record one from the invoice." />
          )}
        </div>
        <div className="row row--between" style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
          <span className="caption">Collected on this page (successful): <strong className="num">{money(String(collected))}</strong></span>
          <Pagination page={meta.page} pageSize={meta.pageSize} total={meta.total} onPage={setPage} />
        </div>
      </div>
    </div>
  );
}
