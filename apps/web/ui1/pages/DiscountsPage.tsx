import { useEffect, useState } from 'react';
import { Percent, Plus } from 'lucide-react';
import { catalogApi } from '../mock/api';
import type { Discount } from '../mock/data';
import { Empty, ProgressBar, dateUs, money } from '../ui/Bits';
import { Pill } from '../ui/Pill';
import { Button } from '../ui/Button';

export function DiscountsPage() {
  const [rows, setRows] = useState<Discount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    catalogApi.discounts().then((res) => {
      setRows(res.data);
      setLoading(false);
    });
  }, []);

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page-title">Discount rules</h1>
          <span className="caption">fixed or percent, with minimums, dates, scope and usage limits</span>
        </div>
        <Button variant="primary"><Plus size={16} /> New rule</Button>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="ds-table">
            <thead>
              <tr>
                <th>Rule</th><th>Type</th><th className="is-money">Value</th><th>Scope</th>
                <th>Valid</th><th>Used</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 4 }).map((_, i) => (<tr key={i}>{Array.from({ length: 7 }).map((_, j) => (<td key={j}><span className="skeleton" style={{ height: 16, width: '70%' }} /></td>))}</tr>))
                : rows.map((d) => {
                    const tone = d.status === 'active' ? 'good' : d.status === 'expiring' ? 'warn' : 'neutral';
                    const label = d.status === 'active' ? 'Active' : d.status === 'expiring' ? 'Expiring' : 'Expired';
                    return (
                      <tr key={d.id}>
                        <td data-label="Rule"><strong style={{ fontWeight: 600 }}>{d.name}</strong></td>
                        <td data-label="Type">{d.kind === 'percent' ? 'Percent' : 'Fixed'}</td>
                        <td className="is-money" data-label="Value">
                          {d.kind === 'percent' ? `${Number(d.value).toLocaleString('en-IN')}%` : money(d.value)}
                        </td>
                        <td data-label="Scope" className="caption">{d.scope}<br />min qty {d.min_quantity}</td>
                        <td data-label="Valid" className="num caption">{dateUs(d.valid_from)}<br />{dateUs(d.valid_to)}</td>
                        <td data-label="Used" style={{ minWidth: 110 }}>
                          <span className="caption num">{d.used}{d.usage_limit ? ` / ${d.usage_limit}` : ' / ∞'}</span>
                          <ProgressBar value={d.usage_limit ? (d.used / d.usage_limit) * 100 : 4} tone={d.usage_limit ? (d.used >= d.usage_limit ? 'bad' : 'loop') : 'loop'} />
                        </td>
                        <td data-label="Status"><Pill tone={tone}>{label}</Pill></td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
          {!loading && rows.length === 0 && (
            <Empty icon={Percent} title="No discount rules" body="Create a rule so quotations can apply it automatically." />
          )}
        </div>
      </div>
    </div>
  );
}
