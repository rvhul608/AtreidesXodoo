import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { catalogApi } from '../mock/api';
import type { Product, Plan, TaxRule, Template } from '../mock/data';
import { Empty, money } from '../ui/Bits';
import { Pill } from '../ui/Pill';
import { Button } from '../ui/Button';
import { Input, Select } from '../ui/Field';
import { useToast } from '../ui/Toast';
import { Dialog } from '../ui/Dialog';
import { Tabs } from '../ui/Bits';

const TABS = [
  { id: 'products', label: 'Products' },
  { id: 'plans', label: 'Plans' },
  { id: 'templates', label: 'Templates' },
  { id: 'taxes', label: 'Taxes' },
];

const periodLabel = { monthly: 'per month', quarterly: 'per quarter', yearly: 'per year' } as const;

export function CatalogPage() {
  const [tab, setTab] = useState('products');
  const [products, setProducts] = useState<Product[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [taxes, setTaxes] = useState<TaxRule[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  const [productOpen, setProductOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);

  useEffect(() => {
    Promise.all([
      catalogApi.products(),
      catalogApi.plans(),
      catalogApi.taxes(),
      catalogApi.templates(),
    ]).then(([p, pl, t, tp]) => {
      setProducts(p.data);
      setPlans(pl.data);
      setTaxes(t.data);
      setTemplates(tp.data);
      setLoading(false);
    });
  }, []);

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page-title">Catalog</h1>
          <span className="caption">products, plans, quotation templates and the tax rules that price them</span>
        </div>
        <div className="row">
          {tab === 'products' && <Button variant="primary" onClick={() => setProductOpen(true)}><Plus size={16} /> New product</Button>}
          {tab === 'plans' && <Button variant="primary" onClick={() => setPlanOpen(true)}><Plus size={16} /> New plan</Button>}
        </div>
      </div>

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'products' && (
        <div className="card">
          <div className="table-wrap">
            <table className="ds-table">
              <thead>
                <tr><th>SKU</th><th>Name</th><th>Category</th><th className="is-money">Price / seat</th><th>Variants</th></tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 4 }).map((_, i) => (<tr key={i}>{Array.from({ length: 5 }).map((_, j) => (<td key={j}><span className="skeleton" style={{ height: 16, width: '70%' }} /></td>))}</tr>))
                  : products.map((p) => (
                      <tr key={p.id}>
                        <td data-label="SKU">{p.sku}</td>
                        <td data-label="Name"><strong style={{ fontWeight: 600 }}>{p.name}</strong><div className="caption">{p.description}</div></td>
                        <td data-label="Category">{p.category}</td>
                        <td className="is-money" data-label="Price">{money(p.price)}</td>
                        <td data-label="Variants">
                          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                            {p.variants.map((v) => (
                              <span key={v.key} className="caption" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-pill)', padding: '2px 10px' }}>
                                {v.key}{Number(v.add_on) > 0 && <span className="num"> +{money(v.add_on)}</span>}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
            {!loading && products.length === 0 && <Empty icon={Plus} title="No products yet" body="Add your first product so plans and templates can reference it." />}
          </div>
        </div>
      )}

      {tab === 'plans' && (
        <div className="card">
          <div className="table-wrap">
            <table className="ds-table">
              <thead>
                <tr><th>Plan</th><th>Period</th><th className="is-money">Price</th><th className="is-money">Min qty</th><th>Availability</th><th>Flags</th><th>Status</th></tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 4 }).map((_, i) => (<tr key={i}>{Array.from({ length: 7 }).map((_, j) => (<td key={j}><span className="skeleton" style={{ height: 16, width: '70%' }} /></td>))}</tr>))
                  : plans.map((pl) => (
                      <tr key={pl.id}>
                        <td data-label="Plan"><strong style={{ fontWeight: 600 }}>{pl.name}</strong></td>
                        <td data-label="Period">{pl.period}</td>
                        <td className="is-money" data-label="Price">{money(pl.price)}</td>
                        <td className="is-money" data-label="Min qty">{pl.min_quantity}</td>
                        <td data-label="Availability" className="caption">
                          from {pl.available_from}{pl.available_to ? ` to ${pl.available_to}` : ' · no end'}
                        </td>
                        <td data-label="Flags">
                          <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
                            {Object.entries(pl.flags).filter(([, on]) => on).map(([flag]) => (
                              <span key={flag} className="caption" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-pill)', padding: '2px 8px' }}>{flag.replace('_', ' ')}</span>
                            ))}
                          </div>
                        </td>
                        <td data-label="Status"><Pill tone={pl.status === 'active' ? 'good' : 'neutral'}>{pl.status === 'active' ? 'Active' : 'Draft'}</Pill></td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'templates' && (
        <div className="grid grid--3">
          {loading
            ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 140 }} />)
            : templates.map((tp) => (
                <div className="card card--pad" key={tp.id}>
                  <div className="stack" style={{ gap: 8 }}>
                    <h3 className="card-title">{tp.name}</h3>
                    <span className="muted" style={{ fontSize: 14 }}>{tp.description}</span>
                    <div className="stack" style={{ gap: 4, marginTop: 4 }}>
                      {tp.lines.map((l) => (
                        <div className="row row--between" key={l.plan} style={{ fontSize: 14 }}>
                          <span>{l.plan}</span>
                          <span className="num muted">× {l.quantity}</span>
                        </div>
                      ))}
                    </div>
                    <span className="caption num">valid {tp.validity_days} days</span>
                  </div>
                </div>
              ))}
        </div>
      )}

      {tab === 'taxes' && (
        <div className="card">
          <div className="table-wrap">
            <table className="ds-table">
              <thead>
                <tr><th>Jurisdiction</th><th>Tax code</th><th className="is-money">Rate</th></tr>
              </thead>
              <tbody>
                {taxes.map((t) => (
                  <tr key={t.id}>
                    <td data-label="Jurisdiction">{t.jurisdiction}</td>
                    <td data-label="Code">{t.code}</td>
                    <td className="is-money" data-label="Rate">{Math.round(Number(t.rate) * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ProductDialog
        open={productOpen}
        onClose={() => setProductOpen(false)}
        onSave={() => {
          setProductOpen(false);
          toast('Product saved');
        }}
      />
      <PlanDialog
        open={planOpen}
        onClose={() => setPlanOpen(false)}
        onSave={() => {
          setPlanOpen(false);
          toast('Plan saved');
        }}
      />
    </div>
  );
}

function ProductDialog({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: () => void }) {
  return (
    <Dialog
      title="New product"
      open={open}
      onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={onSave}>Save product</Button></>}
    >
      <div className="stack" style={{ gap: 12 }}>
        <Input label="SKU" placeholder="LOOP-NEW" />
        <Input label="Name" placeholder="Product name" />
        <Select label="Category" defaultValue="Core app">
          <option>Core app</option>
          <option>Add-on app</option>
        </Select>
        <Input label="Price / seat" type="number" placeholder="0.00" />
        <p className="field__help">Variants such as a brand surcharge (e.g. "Odoo" adds 560) are added after the product is saved.</p>
      </div>
    </Dialog>
  );
}

function PlanDialog({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: () => void }) {
  return (
    <Dialog
      title="New plan"
      open={open}
      onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={onSave}>Save plan</Button></>}
      width={520}
    >
      <div className="stack" style={{ gap: 12 }}>
        <div className="row" style={{ gap: 12 }}>
          <Input label="Name" placeholder="Pro" />
          <Select label="Period" defaultValue="monthly">
            <option value="monthly">monthly</option>
            <option value="quarterly">quarterly</option>
            <option value="yearly">yearly</option>
          </Select>
        </div>
        <div className="row" style={{ gap: 12 }}>
          <Input label="Price" type="number" placeholder="1050" />
          <Input label="Minimum quantity" type="number" placeholder="1" />
        </div>
        <p className="field__help">Flags decide what customers may do themselves: pause, renew, early close, auto close.</p>
        <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
          <label className="row" style={{ gap: 8, fontSize: 14 }}><input type="checkbox" defaultChecked /> Allow pause</label>
          <label className="row" style={{ gap: 8, fontSize: 14 }}><input type="checkbox" defaultChecked /> Allow renew</label>
          <label className="row" style={{ gap: 8, fontSize: 14 }}><input type="checkbox" /> Auto close</label>
          <label className="row" style={{ gap: 8, fontSize: 14 }}><input type="checkbox" defaultChecked /> Early close</label>
        </div>
        <p className="caption num">{periodLabel.monthly} billing follows the period chosen above.</p>
      </div>
    </Dialog>
  );
}
