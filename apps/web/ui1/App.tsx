import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, homeFor, useAuth } from './app/AuthContext';
import { Shell } from './app/Shell';
import { ToastProvider } from './ui/Toast';
import { LoginPage } from './pages/LoginPage';
import { ResetPasswordPage } from './live/ResetPassword';
import { DashboardPage, SubscriptionsPage, InvoicesPage, CatalogPage, RenewalsPage, PaymentsPage } from './live/Pages';
import { DiscountsPage, UsersPage } from './live/AdminPages';
import { PlanTemplatesPage } from './live/PlanTemplates';
import { SupportKnowledgePage } from './live/Support';
import './live/live.css';

function Guard({ children, roles }: { children: React.ReactNode; roles: string[] }) {
  const { user, ready } = useAuth();
  if (!ready) return <div className="auth-loading"><span className="live-spinner" />Checking your session…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />;
  return <>{children}</>;
}
function ShellRoute() { const { user, ready } = useAuth(); if (!ready) return <div className="auth-loading"><span className="live-spinner" />Checking your session…</div>; if (!user) return <Navigate to="/login" replace />; return <Shell />; }
function RootRedirect() { const { user, ready } = useAuth(); return !ready ? <div className="auth-loading"><span className="live-spinner" />Checking your session…</div> : <Navigate to={user ? homeFor(user.role) : '/login'} replace />; }
export default function App() {
  return <ToastProvider><AuthProvider><Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/reset-password" element={<ResetPasswordPage />} />
    <Route element={<ShellRoute />}>
      <Route path="/dashboard" element={<Guard roles={['admin', 'staff']}><DashboardPage /></Guard>} />
      <Route path="/subscriptions" element={<Guard roles={['admin', 'staff']}><SubscriptionsPage /></Guard>} />
      <Route path="/invoices" element={<Guard roles={['admin', 'staff']}><InvoicesPage /></Guard>} />
      <Route path="/payments" element={<Guard roles={['admin', 'staff']}><PaymentsPage /></Guard>} />
      <Route path="/catalog" element={<Guard roles={['admin', 'staff']}><CatalogPage /></Guard>} />
      <Route path="/plans-templates" element={<Guard roles={['admin', 'staff']}><PlanTemplatesPage /></Guard>} />
      <Route path="/discounts" element={<Guard roles={['admin']}><DiscountsPage /></Guard>} />
      <Route path="/users" element={<Guard roles={['admin']}><UsersPage /></Guard>} />
      <Route path="/renewals" element={<Guard roles={['admin', 'staff']}><RenewalsPage /></Guard>} />
      <Route path="/support-content" element={<Guard roles={['admin', 'staff']}><SupportKnowledgePage /></Guard>} />
      <Route path="/portal" element={<Guard roles={['customer']}><DashboardPage /></Guard>} />
      <Route path="/portal/subscriptions" element={<Guard roles={['customer']}><SubscriptionsPage /></Guard>} />
      <Route path="/portal/invoices" element={<Guard roles={['customer']}><InvoicesPage /></Guard>} />
    </Route>
    <Route path="*" element={<RootRedirect />} />
  </Routes></AuthProvider></ToastProvider>;
}
