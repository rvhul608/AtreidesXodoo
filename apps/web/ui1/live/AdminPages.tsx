import { useCallback, useEffect, useState } from 'react';
import { BadgePercent, RefreshCw, UserPlus, Users } from 'lucide-react';
import { useAuth } from '../app/AuthContext';
import { Button } from '../ui/Button';
import { Pill } from '../ui/Pill';
import { apiErrorMessage, http, loadProducts, type ListResult, type Product } from './api';
import './admin-pages.css';

interface Discount {
  id: number;
  name: string;
  description: string | null;
  kind: 'percentage' | 'fixed';
  value: string;
  applies_to: 'subscription' | 'products';
  min_purchase: string;
  min_quantity: string;
  starts_on: string | null;
  ends_on: string | null;
  usage_limit: number | null;
  times_used: number;
  remaining_uses: number | null;
  is_active: boolean;
  state: string;
  product_ids: number[];
}

interface UserRow {
  id: number;
  email: string;
  name: string | null;
  customer_id: number | null;
  role: 'admin' | 'staff' | 'customer';
  is_active: boolean;
  created_at: string;
}

const PAGE_SIZE = 20;

function Pager({ page, total, onPage }: { page: number; total: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return <div className="live-admin-pager"><span>{total} records · page {page} of {pages}</span>
    <div><Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
      <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</Button></div>
  </div>;
}

export function DiscountsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Discount[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<'percentage' | 'fixed'>('percentage');
  const [value, setValue] = useState('10.00');
  const [appliesTo, setAppliesTo] = useState<'subscription' | 'products'>('subscription');
  const [productIds, setProductIds] = useState<number[]>([]);
  const [minPurchase, setMinPurchase] = useState('0');
  const [minQuantity, setMinQuantity] = useState('0');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [usageLimit, setUsageLimit] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await http.get<ListResult<Discount>>('/discounts', {
        params: { page, pageSize: PAGE_SIZE, ...(filter.trim() ? { q: filter.trim() } : {}) },
      });
      setRows(response.data.data);
      setTotal(response.data.meta.total);
    } catch (cause) { setError(apiErrorMessage(cause)); }
    finally { setLoading(false); }
  }, [page, filter]);
  const [total, setTotal] = useState(0);

  useEffect(() => { if (user?.role === 'admin') void refresh(); }, [user?.role, refresh]);
  useEffect(() => {
    if (appliesTo !== 'products' || user?.role !== 'admin') return;
    let active = true;
    loadProducts(1).then((result) => { if (active) setProducts(result.data); }).catch((cause) => {
      if (active) setFormError(`Could not load products: ${apiErrorMessage(cause)}`);
    });
    return () => { active = false; };
  }, [appliesTo, user?.role]);

  if (user?.role !== 'admin') return <div className="page live-page"><div className="live-error">Administrator access is required to manage discounts.</div></div>;

  function resetForm() {
    setName(''); setDescription(''); setKind('percentage'); setValue('10.00'); setAppliesTo('subscription');
    setProductIds([]); setMinPurchase('0'); setMinQuantity('0'); setStartsOn(''); setEndsOn(''); setUsageLimit('');
    setFormError(''); setShowForm(false);
  }

  async function createDiscount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true); setFormError('');
    try {
      await http.post('/discounts', {
        name: name.trim(), description: description.trim() || null, kind, value, appliesTo,
        ...(appliesTo === 'products' ? { productIds } : {}), minPurchase, minQuantity,
        startsOn: startsOn || null, endsOn: endsOn || null,
        usageLimit: usageLimit ? Number(usageLimit) : null, isActive: true,
      });
      resetForm(); setPage(1); await refresh();
    } catch (cause) { setFormError(apiErrorMessage(cause)); }
    finally { setCreating(false); }
  }

  async function toggle(discount: Discount) {
    setBusyId(discount.id); setError('');
    try { await http.post(`/discounts/${discount.id}/${discount.is_active ? 'deactivate' : 'activate'}`); await refresh(); }
    catch (cause) { setError(apiErrorMessage(cause)); }
    finally { setBusyId(null); }
  }

  return <div className="page live-page">
    <div className="page__header live-header"><div><h1 className="page-title">Discounts</h1><span className="caption">Manage subscription and product discount rules.</span></div>
      <Button onClick={() => { setError(''); setFormError(''); setShowForm((shown) => !shown); }}><BadgePercent size={15} />{showForm ? 'Close form' : 'New discount'}</Button>
    </div>
    {showForm && <form className="card live-create-form live-admin-form" onSubmit={(event) => void createDiscount(event)}>
      <h2>Create discount rule</h2>
      <label>Name<input className="field__input" required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label>Type<select className="field__select" value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}><option value="percentage">Percentage</option><option value="fixed">Fixed amount</option></select></label>
      <label>Value<input className="field__input" required inputMode="decimal" pattern="\d{1,10}(\.\d{1,2})?" value={value} onChange={(event) => setValue(event.target.value)} /><small>{kind === 'percentage' ? 'Enter a value up to 100.' : 'Enter a fixed currency amount.'}</small></label>
      <label>Applies to<select className="field__select" value={appliesTo} onChange={(event) => { setAppliesTo(event.target.value as typeof appliesTo); setProductIds([]); }}><option value="subscription">Subscriptions</option><option value="products">Selected products</option></select></label>
      <label>Minimum purchase<input className="field__input" inputMode="decimal" pattern="\d{1,10}(\.\d{1,2})?" required value={minPurchase} onChange={(event) => setMinPurchase(event.target.value)} /></label>
      <label>Minimum quantity<input className="field__input" inputMode="decimal" pattern="\d{1,10}(\.\d{1,2})?" required value={minQuantity} onChange={(event) => setMinQuantity(event.target.value)} /></label>
      <label>Starts on<input className="field__input" type="date" value={startsOn} onChange={(event) => setStartsOn(event.target.value)} /></label>
      <label>Ends on<input className="field__input" type="date" value={endsOn} onChange={(event) => setEndsOn(event.target.value)} /></label>
      <label>Usage limit<input className="field__input" type="number" min="1" step="1" value={usageLimit} onChange={(event) => setUsageLimit(event.target.value)} placeholder="Unlimited" /></label>
      <label className="live-admin-wide">Description<textarea className="field__textarea" maxLength={1000} rows={2} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
      {appliesTo === 'products' && <fieldset className="live-admin-products"><legend>Product targets</legend>{products.length ? products.map((product) => <label key={product.id}><input type="checkbox" checked={productIds.includes(product.id)} onChange={(event) => setProductIds((current) => event.target.checked ? [...current, product.id] : current.filter((id) => id !== product.id))} />{product.name} <small>({product.sku})</small></label>) : <span className="live-muted">Loading products or no products are available.</span>}</fieldset>}
      {formError && <div className="live-error live-admin-wide" role="alert">{formError}</div>}
      <div className="live-admin-wide live-actions"><Button type="submit" disabled={creating}>{creating ? 'Creating…' : 'Create discount'}</Button><Button variant="secondary" onClick={resetForm} disabled={creating}>Cancel</Button></div>
    </form>}
    <div className="live-toolbar"><input className="field__input" value={filter} onChange={(event) => { setFilter(event.target.value); setPage(1); }} placeholder="Search discount rules" aria-label="Search discounts" /><span className="caption">Showing {rows.length} of {total} records</span><Button onClick={() => void refresh()}><RefreshCw size={15} />Refresh</Button></div>
    {error && <div className="live-error" role="alert">{error}</div>}
    <section className="card live-table-card">{loading ? <div className="live-state"><span className="live-spinner" />Loading discount rules…</div> : rows.length ? <div className="live-table-scroll"><table className="ds-table live-table"><thead><tr><th>Rule</th><th>Value</th><th>Applies to</th><th>Usage</th><th>Schedule</th><th>Status</th><th>Action</th></tr></thead><tbody>{rows.map((discount) => <tr key={discount.id}><td><strong>{discount.name}</strong>{discount.description && <small className="live-subline">{discount.description}</small>}</td><td>{discount.kind === 'percentage' ? `${discount.value}%` : discount.value}</td><td>{discount.applies_to === 'subscription' ? 'Subscriptions' : `${discount.product_ids.length} products`}</td><td>{discount.times_used}{discount.usage_limit === null ? ' · unlimited' : ` / ${discount.usage_limit}`}</td><td>{discount.starts_on || 'Now'} – {discount.ends_on || 'No end'}</td><td><Pill tone={discount.state === 'active' ? 'good' : discount.state === 'inactive' ? 'neutral' : discount.state === 'exhausted' ? 'bad' : 'warn'}>{discount.state}</Pill></td><td><Button size="sm" variant="secondary" disabled={busyId === discount.id} onClick={() => void toggle(discount)}>{busyId === discount.id ? 'Saving…' : discount.is_active ? 'Deactivate' : 'Activate'}</Button></td></tr>)}</tbody></table></div> : <div className="live-empty"><BadgePercent /><strong>No discount rules found</strong><span>Create a rule to make discounts available to billing.</span></div>}<Pager page={page} total={total} onPage={setPage} /></section>
  </div>;
}

export function UsersPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<UserRow[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await http.get<ListResult<UserRow>>('/users', { params: { page, pageSize: PAGE_SIZE } });
      setRows(response.data.data); setTotal(response.data.meta.total);
    } catch (cause) { setError(apiErrorMessage(cause)); }
    finally { setLoading(false); }
  }, [page]);
  useEffect(() => { if (user?.role === 'admin') void refresh(); }, [user?.role, refresh]);

  if (user?.role !== 'admin') return <div className="page live-page"><div className="live-error">Administrator access is required to manage users.</div></div>;

  async function createStaff(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setCreating(true); setFormError('');
    try {
      await http.post('/users', { name: name.trim() || undefined, email: email.trim(), password });
      setName(''); setEmail(''); setPassword(''); setPage(1); await refresh();
    } catch (cause) { setFormError(apiErrorMessage(cause)); }
    finally { setCreating(false); }
  }

  async function deactivate(row: UserRow) {
    setBusyId(row.id); setError('');
    try { await http.post(`/users/${row.id}/deactivate`); await refresh(); }
    catch (cause) { setError(apiErrorMessage(cause)); }
    finally { setBusyId(null); }
  }

  return <div className="page live-page">
    <div className="page__header live-header"><div><h1 className="page-title">Users</h1><span className="caption">Manage staff access and review customer accounts.</span></div></div>
    <form className="card live-create-form live-admin-form" onSubmit={(event) => void createStaff(event)}>
      <h2><UserPlus size={17} />Create staff account</h2>
      <label>Name<input className="field__input" maxLength={120} value={name} onChange={(event) => setName(event.target.value)} placeholder="Optional" /></label>
      <label>Email<input className="field__input" type="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label>Password<input className="field__input" type="password" required minLength={9} value={password} onChange={(event) => setPassword(event.target.value)} /><small>At least 9 characters with uppercase, lowercase, and a special character.</small></label>
      {formError && <div className="live-error live-admin-wide" role="alert">{formError}</div>}
      <div className="live-admin-wide"><Button type="submit" disabled={creating}>{creating ? 'Creating…' : 'Create staff account'}</Button></div>
    </form>
    <div className="live-toolbar"><span className="caption">{total} accounts</span><Button onClick={() => void refresh()}><RefreshCw size={15} />Refresh</Button></div>
    {error && <div className="live-error" role="alert">{error}</div>}
    <section className="card live-table-card">{loading ? <div className="live-state"><span className="live-spinner" />Loading users…</div> : rows.length ? <div className="live-table-scroll"><table className="ds-table live-table"><thead><tr><th>User</th><th>Role</th><th>Customer account</th><th>Status</th><th>Created</th><th>Action</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><strong>{row.name || row.email}</strong>{row.name && <small className="live-subline">{row.email}</small>}</td><td>{row.role}</td><td>{row.customer_id ?? '—'}</td><td><Pill tone={row.is_active ? 'good' : 'neutral'}>{row.is_active ? 'Active' : 'Inactive'}</Pill></td><td>{new Date(row.created_at).toLocaleDateString()}</td><td>{row.is_active && row.id !== user.id && <Button size="sm" variant="secondary" disabled={busyId === row.id} onClick={() => void deactivate(row)}>{busyId === row.id ? 'Saving…' : 'Deactivate'}</Button>}{row.id === user.id && <span className="live-muted">Current account</span>}</td></tr>)}</tbody></table></div> : <div className="live-empty"><Users /><strong>No users found</strong><span>Registered accounts will appear here.</span></div>}<Pager page={page} total={total} onPage={setPage} /></section>
  </div>;
}
