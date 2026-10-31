import { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

interface HealthStatus {
  status: string;
  timestamp: string;
  database: {
    connected: boolean;
    timestamp?: string;
  };
}

export default function App() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const response = await axios.get<HealthStatus>('/health');
        setHealth(response.data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to connect to API');
        setHealth(null);
      } finally {
        setLoading(false);
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="app">
      <header>
        <h1>Brightloop Subscription System</h1>
        <p>Phase 1 - Infrastructure Skeleton</p>
      </header>

      <main>
        <section className="status">
          <h2>System Status</h2>
          {loading ? (
            <p>Loading...</p>
          ) : error ? (
            <div className="error">
              <p>⚠ API Connection Error: {error}</p>
            </div>
          ) : health ? (
            <div className="healthy">
              <p>✓ API Status: {health.status}</p>
              <p>✓ Database: {health.database.connected ? 'Connected' : 'Disconnected'}</p>
              <pre>{JSON.stringify(health, null, 2)}</pre>
            </div>
          ) : (
            <p>No status available</p>
          )}
        </section>

        <section className="features">
          <h2>Planned Features</h2>
          <ul>
            <li><strong>Agent A (Auth/Portal):</strong> User authentication, outbox, admin portal</li>
            <li><strong>Agent B (Billing/Payments):</strong> Invoicing, payments, real-time updates</li>
            <li><strong>Agent C (Catalog):</strong> Product catalog, plans, subscription lifecycle</li>
          </ul>
        </section>

        <section className="docs">
          <h2>Documentation</h2>
          <ul>
            <li><a href="/docs/api-contract.md">API Contract</a></li>
            <li><a href="/docs/walkthroughs/infra.md">Infrastructure Guide</a></li>
          </ul>
        </section>
      </main>

      <footer>
        <p>Brightloop © 2024 | Phase 1 Skeleton Build</p>
      </footer>
    </div>
  );
}
