import { useCallback, useEffect, useState } from 'react';
import { BookOpen, CalendarClock, Layers3, Plus, RefreshCw } from 'lucide-react';
import { useAuth } from '../app/AuthContext';
import { apiErrorMessage, http, type ListResult, type Plan, type Product } from './api';
import { Button } from '../ui/Button';
import { Pill } from '../ui/Pill';

interface Template {
  id: number;
  name: string;
  description: string | null;
  plan_id: number;
  validity_days: number;
  expires_on: string;
  is_expired: boolean;
  lines: Array<{ id: number; product_id: number; variant_id: number | null; quantity: string; unit_price: string }>;
}
type Pane = 'plans' | 'templates';

const money = (value: string) => {
  const [whole, fraction = ''] = value.split('.');
  return `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Number(whole))}.${fraction.padEnd(2, '0').slice(0, 2)}`;
};
function availability(plan: Plan) {
  const dates = plan as Plan & { available_from?: string | null; available_until?: string | null };
  return `${dates.available_from ?? 'Any date'}${dates.available_until ? ` – ${dates.available_until}` : ''}`;
}
export function PlanTemplatesPage() {
  const { user } = useAuth();
  const canCreate = user?.role === 'admin';
  const [pane, setPane] = useState<Pane>('plans');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Array<Plan | Template>>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [optionsError, setOptionsError] = useState('');

  const [planNumber, setPlanNumber] = useState('');
  const [planName, setPlanName] = useState('');
  const [planDescription, setPlanDescription] = useState('');
  const [price, setPrice] = useState('');
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('monthly');
  const [minQuantity, setMinQuantity] = useState('1');
  const [availableFrom, setAvailableFrom] = useState('');
  const [availableUntil, setAvailableUntil] = useState('');
  const [autoClose, setAutoClose] = useState(false);
  const [allowEarlyClose, setAllowEarlyClose] = useState(true);
  const [allowPause, setAllowPause] = useState(true);
  const [allowRenew, setAllowRenew] = useState(true);

  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [templatePlanId, setTemplatePlanId] = useState('');
  const [validityDays, setValidityDays] = useState('30');
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('1.00');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const route = pane === 'plans' ? '/plans' : '/templates';
      const response = await http.get<ListResult<Plan | Template>>(route, { params: { page, pageSize: 50 } });
      setRows(response.data.data);
      setTotal(response.data.meta.total);
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [pane, page]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    let active = true;
    setOptionsError('');
    Promise.all([
      http.get<ListResult<Plan>>('/plans', { params: { page: 1, pageSize: 100 } }),
      http.get<ListResult<Product>>('/products', { params: { page: 1, pageSize: 100 } }),
    ]).then(([planResponse, productResponse]) => {
      if (!active) return;
      setPlans(planResponse.data.data);
      setProducts(productResponse.data.data);
    }).catch((cause: unknown) => {
      if (active) setOptionsError(apiErrorMessage(cause));
    });
    return () => { active = false; };
  }, []);

  function resetForm() {
    setPlanNumber(''); setPlanName(''); setPlanDescription(''); setPrice(''); setPeriod('monthly'); setMinQuantity('1');
    setAvailableFrom(''); setAvailableUntil(''); setAutoClose(false); setAllowEarlyClose(true); setAllowPause(true); setAllowRenew(true);
    setTemplateName(''); setTemplateDescription(''); setTemplatePlanId(''); setValidityDays('30'); setProductId(''); setQuantity('1.00');
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreate) return;
    setSaving(true); setError('');
    try {
      if (pane === 'plans') {
        await http.post('/plans', {
          planNumber: planNumber.trim(), name: planName.trim(), description: planDescription.trim() || undefined,
          price, period, minQuantity: Number(minQuantity),
          ...(availableFrom ? { availableFrom } : {}), ...(availableUntil ? { availableUntil } : {}),
          autoClose, allowEarlyClose, allowPause, allowRenew,
        });
      } else {
        await http.post('/templates', {
          name: templateName.trim(), description: templateDescription.trim() || undefined,
          planId: Number(templatePlanId), validityDays: Number(validityDays),
          lines: [{ productId: Number(productId), quantity }],
        });
      }
      setCreateOpen(false); resetForm(); await load();
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  const pages = Math.max(1, Math.ceil(total / 50));
  return <div className="page live-page">
    <div className="page__header live-header">
      <div><h1 className="page-title">Plans &amp; templates</h1><span className="caption">Live catalog records and quotation templates.</span></div>
      <div className="live-header-actions">
        <Button variant="secondary" onClick={() => void load()}><RefreshCw size={15} /> Refresh</Button>
        {canCreate && <Button onClick={() => { setError(''); setCreateOpen((value) => !value); }}>{createOpen ? 'Close form' : <><Plus size={15} /> New {pane === 'plans' ? 'plan' : 'template'}</>}</Button>}
      </div>
    </div>

    <div className="tabs" role="tablist" aria-label="Catalog view">
      <button type="button" role="tab" aria-selected={pane === 'plans'} className={`tabs__tab ${pane === 'plans' ? 'is-active' : ''}`} onClick={() => { setPane('plans'); setPage(1); setCreateOpen(false); setError(''); }}><Layers3 size={16} /> Plans</button>
      <button type="button" role="tab" aria-selected={pane === 'templates'} className={`tabs__tab ${pane === 'templates' ? 'is-active' : ''}`} onClick={() => { setPane('templates'); setPage(1); setCreateOpen(false); setError(''); }}><BookOpen size={16} /> Quotation templates</button>
    </div>

    {createOpen && canCreate && <form className="card live-create-form" onSubmit={(event) => void submit(event)}>
      {pane === 'plans' ? <>
        <h2>Create plan</h2>
        <div className="live-form-fields">
          <label>Plan number<input className="field__input" value={planNumber} onChange={(e) => setPlanNumber(e.target.value)} required /></label>
          <label>Name<input className="field__input" value={planName} onChange={(e) => setPlanName(e.target.value)} required /></label>
          <label>Price<input className="field__input" inputMode="decimal" pattern="\d+(\.\d{1,2})?" value={price} onChange={(e) => setPrice(e.target.value)} required /></label>
          <label>Period<select className="field__select" value={period} onChange={(e) => setPeriod(e.target.value as typeof period)}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></label>
          <label>Minimum quantity<input className="field__input" type="number" min="1" step="1" value={minQuantity} onChange={(e) => setMinQuantity(e.target.value)} required /></label>
          <label>Available from<input className="field__input" type="date" value={availableFrom} onChange={(e) => setAvailableFrom(e.target.value)} /></label>
          <label>Available until<input className="field__input" type="date" value={availableUntil} onChange={(e) => setAvailableUntil(e.target.value)} /></label>
          <label className="live-form-wide">Description<input className="field__input" value={planDescription} onChange={(e) => setPlanDescription(e.target.value)} /></label>
        </div>
        <div className="live-plan-tags plan-flags">
          <label><input type="checkbox" checked={autoClose} onChange={(e) => setAutoClose(e.target.checked)} /> Auto-close at expiry</label>
          <label><input type="checkbox" checked={allowEarlyClose} onChange={(e) => setAllowEarlyClose(e.target.checked)} /> Allow early close</label>
          <label><input type="checkbox" checked={allowPause} onChange={(e) => setAllowPause(e.target.checked)} /> Allow pause</label>
          <label><input type="checkbox" checked={allowRenew} onChange={(e) => setAllowRenew(e.target.checked)} /> Allow renewal</label>
        </div>
      </> : <>
        <h2>Create quotation template</h2>
        {optionsError && <div className="live-error">Couldn’t load plans and products: {optionsError}</div>}
        <div className="live-form-fields">
          <label>Name<input className="field__input" value={templateName} onChange={(e) => setTemplateName(e.target.value)} required /></label>
          <label>Plan<select className="field__select" value={templatePlanId} onChange={(e) => setTemplatePlanId(e.target.value)} required><option value="">Select a plan</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {money(plan.price)} / {plan.period}</option>)}</select></label>
          <label>Validity (days)<input className="field__input" type="number" min="1" step="1" value={validityDays} onChange={(e) => setValidityDays(e.target.value)} required /></label>
          <label>Product<select className="field__select" value={productId} onChange={(e) => setProductId(e.target.value)} required><option value="">Select a product</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name} · {money(product.sales_price)}</option>)}</select></label>
          <label>Quantity<input className="field__input" inputMode="decimal" pattern="\d+(\.\d{1,2})?" value={quantity} onChange={(e) => setQuantity(e.target.value)} required /></label>
          <label className="live-form-wide">Description<input className="field__input" value={templateDescription} onChange={(e) => setTemplateDescription(e.target.value)} /></label>
        </div>
        <p className="caption"><CalendarClock size={14} /> Template product pricing is resolved by the API when saved.</p>
      </>}
      {error && <div className="live-error" role="alert">{error}</div>}
      <div className="live-header-actions"><span className="caption">Only admins can create catalog records. Request fields are validated again by the API.</span><Button type="submit" disabled={saving || (pane === 'templates' && (!plans.length || !products.length))}>{saving ? 'Saving…' : `Create ${pane === 'plans' ? 'plan' : 'template'}`}</Button></div>
    </form>}

    {error && !createOpen && <div className="live-error" role="alert">{error}<button onClick={() => void load()}>Try again</button></div>}
    <section className="card live-table-card">
      <div className="live-card-heading"><div><h2>{pane === 'plans' ? 'Plans' : 'Quotation templates'}</h2><p>Page {page} · {total} total records</p></div></div>
      {loading ? <div className="live-state"><span className="live-spinner" />Loading {pane}…</div> : error ? <div className="live-empty"><BookOpen /><strong>Could not load {pane}</strong><span>{error}</span></div> : rows.length === 0 ? <div className="live-empty"><BookOpen /><strong>No {pane} yet</strong><span>{pane === 'plans' ? 'Create a plan to make it available in the catalog.' : 'Create a template to reuse quotation line items.'}</span></div> : pane === 'plans' ? <div className="live-table-scroll"><table className="ds-table live-table"><thead><tr><th>Plan</th><th>Plan number</th><th>Price</th><th>Period</th><th>Minimum</th><th>Availability</th><th>Options</th></tr></thead><tbody>{(rows as Plan[]).map((plan) => <tr key={plan.id}><td><strong>{plan.name}</strong><small className="live-subline">{plan.description || 'No description'}</small></td><td>{plan.plan_number}</td><td>{money(plan.price)}</td><td>{plan.period}</td><td>{plan.min_quantity}</td><td>{availability(plan)}</td><td>{[plan.auto_close && 'Auto-close', plan.allow_pause && 'Pause', plan.allow_renew && 'Renew'].filter(Boolean).join(' · ') || 'Standard'}</td></tr>)}</tbody></table></div> : <div className="live-table-scroll"><table className="ds-table live-table"><thead><tr><th>Template</th><th>Plan</th><th>Items</th><th>Valid until</th><th>Status</th></tr></thead><tbody>{(rows as Template[]).map((template) => <tr key={template.id}><td><strong>{template.name}</strong><small className="live-subline">{template.description || 'No description'}</small></td><td>{plans.find((plan) => plan.id === template.plan_id)?.name ?? `Plan ${template.plan_id}`}</td><td>{template.lines.length} line{template.lines.length === 1 ? '' : 's'}</td><td>{new Date(`${template.expires_on}T00:00:00`).toLocaleDateString()}</td><td><Pill tone={template.is_expired ? 'bad' : 'good'}>{template.is_expired ? 'Expired' : 'Valid'}</Pill></td></tr>)}</tbody></table></div>}
      {total > 50 && <div className="live-pager"><span>Page {page} of {Math.ceil(total / 50)}</span><div><Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</Button><Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => setPage((current) => current + 1)}>Next</Button></div></div>}
    </section>
  </div>;
}
