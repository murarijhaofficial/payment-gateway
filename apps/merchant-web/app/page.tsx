import { SandboxStatusCard } from '../components/sandbox-status-card';
import { MerchantNavigation } from '../components/merchant-navigation';

export default function HomePage() {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <MerchantNavigation />

      <div className="content-shell">
        <header className="topbar">
          <p className="workspace-name">Acme Merchant · Sandbox</p>
          <span className="role-label">Merchant owner</span>
        </header>
        <main id="main-content" className="dashboard-content">
          <section className="welcome-panel" aria-labelledby="overview-title">
            <div>
              <p className="eyebrow">Merchant overview</p>
              <h1 id="overview-title">Good morning, Acme.</h1>
              <p className="muted-text">
                Your sandbox workspace is ready for secure integration work.
              </p>
            </div>
            <span className="sandbox-badge">Sandbox only</span>
          </section>

          <section className="notice" aria-labelledby="notice-title">
            <div aria-hidden="true" className="notice-icon">
              i
            </div>
            <div>
              <h2 id="notice-title">No payment processing is enabled</h2>
              <p>
                This environment does not accept funds or collect card details. Activation requires
                an approved regulated operating model and partner controls.
              </p>
            </div>
          </section>

          <section className="metric-grid" aria-label="Sandbox overview">
            <article className="metric-card">
              <p className="metric-label">Payment capability</p>
              <p className="metric-value">Disabled</p>
              <p className="metric-detail">Sandbox safeguards active</p>
            </article>
            <article className="metric-card">
              <p className="metric-label">Default commission</p>
              <p className="metric-value">2.00%</p>
              <p className="metric-detail">200 basis points · versioned policy</p>
            </article>
            <article className="metric-card">
              <p className="metric-label">Transactions</p>
              <p className="metric-value">—</p>
              <p className="metric-detail">Available after sandbox orders are implemented</p>
            </article>
          </section>

          <section className="dashboard-grid" aria-label="Integration readiness">
            <SandboxStatusCard />
            <article className="activity-card">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Activity</p>
                  <h2>Recent activity</h2>
                </div>
              </div>
              <div className="empty-state">
                <div className="empty-icon" aria-hidden="true">
                  ↗
                </div>
                <h3>No activity yet</h3>
                <p>
                  Orders, refunds, and webhook deliveries will appear here when their sandbox
                  workflows are available.
                </p>
              </div>
            </article>
          </section>
        </main>
      </div>
    </div>
  );
}
