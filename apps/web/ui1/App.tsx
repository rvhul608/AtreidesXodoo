import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, homeFor, useAuth } from './app/AuthContext';
import { Shell } from './app/Shell';
import { Chatbot } from './chat/Chatbot';
import { ToastProvider } from './ui/Toast';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { SubscriptionsPage } from './pages/SubscriptionsPage';
import { InvoicesPage } from './pages/InvoicesPage';
import { PaymentsPage } from './pages/PaymentsPage';
import { CatalogPage } from './pages/CatalogPage';
import { DiscountsPage } from './pages/DiscountsPage';
import { UsersPage } from './pages/UsersPage';
import { SupportContentPage } from './pages/SupportContentPage';
import { PortalPage } from './pages/PortalPage';
import { invoices } from './mock/data';

function Guard({ children, roles }: { children: React.ReactNode; roles: string[] }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />;
  return <>{children}</>;
}

function ChatLayer() {
  const { user } = useAuth();
  if (!user) return null;

  /* Paying from the chat card flips the same mock invoice the portal lists. */
  const handlePaid = (ref: string) => {
    const inv = invoices.find((i) => i.ref === ref);
    if (inv) inv.status = 'paid';
  };

  return <Chatbot onPaid={handlePaid} />;
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ShellRoute />}>
            <Route path="/dashboard" element={<Guard roles={['admin', 'staff']}><DashboardFor /></Guard>} />
            <Route path="/subscriptions" element={<Guard roles={['admin', 'staff']}><SubscriptionsPage /></Guard>} />
            <Route path="/invoices" element={<Guard roles={['admin', 'staff']}><InvoicesPage /></Guard>} />
            <Route path="/payments" element={<Guard roles={['admin', 'staff']}><PaymentsPage /></Guard>} />
            <Route path="/catalog" element={<Guard roles={['admin', 'staff']}><CatalogPage /></Guard>} />
            <Route path="/discounts" element={<Guard roles={['admin']}><DiscountsPage /></Guard>} />
            <Route path="/support-content" element={<Guard roles={['admin', 'staff']}><SupportContentPage /></Guard>} />
            <Route path="/users" element={<Guard roles={['admin']}><UsersPage /></Guard>} />
            <Route path="/portal" element={<Guard roles={['customer', 'admin']}><PortalPage section="subs" /></Guard>} />
            <Route path="/portal/invoices" element={<Guard roles={['customer', 'admin']}><PortalPage section="invoices" /></Guard>} />
          </Route>
          <Route path="*" element={<RootRedirect />} />
        </Routes>
        <ChatLayer />
      </AuthProvider>
    </ToastProvider>
  );
}

function ShellRoute() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <Shell />;
}

function DashboardFor() {
  const { user } = useAuth();
  if (!user) return null;
  return <DashboardPage role={user.role === 'admin' ? 'admin' : 'staff'} />;
}

function RootRedirect() {
  const { user } = useAuth();
  return <Navigate to={user ? homeFor(user.role) : '/login'} replace />;
}
