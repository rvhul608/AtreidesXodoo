import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { adminApi } from '../mock/api';
import type { UserRow, Role } from '../mock/data';
import { Empty, dateUs } from '../ui/Bits';
import { Pill } from '../ui/Pill';
import { Button } from '../ui/Button';
import { Input, Select } from '../ui/Field';
import { Dialog } from '../ui/Dialog';
import { useToast } from '../ui/Toast';

const roleLabel: Record<Role, { tone: 'info' | 'good' | 'neutral'; label: string }> = {
  admin: { tone: 'info', label: 'Admin' },
  staff: { tone: 'good', label: 'Staff' },
  customer: { tone: 'neutral', label: 'Customer' },
  viewer: { tone: 'neutral', label: 'Viewer' },
} as Record<Role, { tone: 'info' | 'good' | 'neutral'; label: string }>;

export function UsersPage() {
  const toast = useToast();
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    adminApi.users().then((res) => {
      setRows(res.data);
      setLoading(false);
    });
  }, []);

  function toggleActive(u: UserRow) {
    const next = !u.is_active;
    setRows((prev) => prev.map((r) => (r.id === u.id ? { ...r, is_active: next } : r)));
    toast(next ? `${u.name} re-activated` : `${u.name} deactivated`);
  }

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page-title">Staff</h1>
          <span className="caption">roles decide what people see; the backend enforces permissions too</span>
        </div>
        <Button variant="primary" onClick={() => setOpen(true)}>Create user</Button>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="ds-table">
            <thead>
              <tr><th>Name</th><th>Email</th><th>Role</th><th>Last login</th><th>Status</th><th aria-label="Actions" /></tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (<tr key={i}>{Array.from({ length: 6 }).map((_, j) => (<td key={j}><span className="skeleton" style={{ height: 16, width: '70%' }} /></td>))}</tr>))
                : rows.map((u) => {
                    const r = roleLabel[u.role];
                    return (
                      <tr key={u.id}>
                        <td data-label="Name"><strong style={{ fontWeight: 600 }}>{u.name}</strong></td>
                        <td data-label="Email" className="caption">{u.email}</td>
                        <td data-label="Role"><Pill tone={r.tone}>{r.label}</Pill></td>
                        <td data-label="Last login" className="num">{dateUs(u.last_login)}</td>
                        <td data-label="Status"><Pill tone={u.is_active ? 'good' : 'neutral'}>{u.is_active ? 'Active' : 'Inactive'}</Pill></td>
                        <td data-label="Actions">
                          <div className="row-actions">
                            <Button size="sm" onClick={() => toggleActive(u)}>
                              {u.is_active ? 'Deactivate' : 'Reactivate'}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
          {!loading && rows.length === 0 && (
            <Empty icon={Users} title="No users yet" body="Create staff accounts so they can work the billing queues." />
          )}
        </div>
      </div>

      <Dialog
        title="Create user"
        open={open}
        onClose={() => setOpen(false)}
        footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" onClick={() => { setOpen(false); toast('User created'); }}>Create user</Button></>}
      >
        <div className="stack" style={{ gap: 12 }}>
          <Input label="Name" placeholder="Full name" />
          <Input label="Email" type="email" placeholder="colleague@brightloop.local" />
          <Select label="Role" defaultValue="staff">
            <option value="admin">Admin — everything including admin settings</option>
            <option value="staff">Staff — customers, invoices, payments</option>
            <option value="viewer">Viewer — read-only</option>
          </Select>
          <p className="field__help">A reset link is queued to the outbox; the user sets a password on first login.</p>
        </div>
      </Dialog>
    </div>
  );
}
