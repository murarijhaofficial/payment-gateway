'use client';
import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { resolveSandboxApiUrl } from '../lib/platform-status';
import QRCode from 'qrcode';

type Row = Record<string, unknown>;
interface Data {
  user: { id: string; email: string; role: string; merchantId: string | null };
  payments: Row[];
  links: Row[];
  refunds: Row[];
  settlements: Row[];
  journals: Row[];
  events: Row[];
  audit: Row[];
  fees: Row[];
  proposals: Row[];
  merchants: Row[];
  keys: Row[];
  totals: { assets: string; merchant_balance: string; commission: string };
}
const api = resolveSandboxApiUrl(
  process.env['NEXT_PUBLIC_SANDBOX_API_URL'],
  process.env['NODE_ENV'] === 'development',
);
const money = (value: unknown) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(
    Number(value ?? 0) / 100,
  );
const date = (value: unknown) =>
  new Date(String(value)).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
const short = (value: unknown) => String(value).slice(0, 8);
function minor(value: FormDataEntryValue | null) {
  const text = String(value ?? '');
  if (!/^\d+(\.\d{1,2})?$/.test(text))
    throw new Error('Enter an amount with at most two decimal places');
  const [whole, part = ''] = text.split('.');
  const result = Number(whole) * 100 + Number(part.padEnd(2, '0'));
  if (!Number.isSafeInteger(result)) throw new Error('Amount is too large');
  return result;
}
function Table({
  rows,
  columns,
}: {
  rows: Row[];
  columns: { label: string; render: (r: Row) => ReactNode }[];
}) {
  return rows.length ? (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.label}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={String(r['id'] ?? i)}>
              {columns.map((c) => (
                <td key={c.label}>{c.render(r)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <div className="workspace-empty">No records yet.</div>
  );
}
const col = (label: string, key: string, format: (v: unknown) => ReactNode = String) => ({
  label,
  render: (r: Row) => format(r[key]),
});
const status = (v: unknown) => (
  <span className={`record-status status-${String(v)}`}>{String(v)}</span>
);
function Field({
  label,
  name,
  type = 'text',
  required = true,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="form-field">
      <span>{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        maxLength={type === 'password' ? 128 : 254}
        autoComplete={type === 'password' ? 'current-password' : name === 'email' ? 'email' : 'off'}
      />
    </label>
  );
}
function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <article className="metric-card">
      <p className="metric-label">{label}</p>
      <p className="metric-value">{value}</p>
      <p className="metric-detail">{note}</p>
    </article>
  );
}

export function Workspace() {
  const pendingKeys = useRef(new Map<string, string>());
  const [token, setToken] = useState(''),
    [data, setData] = useState<Data | null>(null),
    [page, setPage] = useState('Overview'),
    [signup, setSignup] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [search, setSearch] = useState(''),
    [filter, setFilter] = useState('all'),
    [selected, setSelected] = useState<Row | null>(null),
    [secret, setSecret] = useState(''),
    [checkoutShare, setCheckoutShare] = useState<{
      url: string;
      qr: string;
      reference: string;
    } | null>(null),
    [menu, setMenu] = useState(false);
  async function request(
    path: string,
    method = 'GET',
    body?: unknown,
    credential = token,
    idempotent = false,
  ): Promise<unknown> {
    if (!api) throw new Error('Configure NEXT_PUBLIC_SANDBOX_API_URL on Vercel and redeploy.');
    const requestId = JSON.stringify([path, body]);
    if (idempotent && !pendingKeys.current.has(requestId))
      pendingKeys.current.set(requestId, crypto.randomUUID());
    const response = await fetch(`${api}/v1/sandbox${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(credential ? { Authorization: `Bearer ${credential}` } : {}),
        ...(idempotent ? { 'Idempotency-Key': pendingKeys.current.get(requestId)! } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: 'no-store',
      signal: AbortSignal.timeout(45000),
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 401 && path === '/auth/login')
        throw new Error(
          'Check your email and password. Administrators must also enter a fresh six-digit code from their enrolled authenticator app. Fixed, expired or already used codes cannot sign in.',
        );
      if (response.status === 401 && path !== '/auth/login') {
        setToken('');
        setData(null);
      }
      throw new Error(
        payload && typeof payload === 'object' && 'message' in payload
          ? String(payload.message)
          : `Request failed (${response.status})`,
      );
    }
    return payload;
  }
  async function refresh(credential = token) {
    const value = await request('/workspace', 'GET', undefined, credential);
    if (!value || typeof value !== 'object' || !('user' in value) || !('payments' in value))
      throw new Error('Unexpected workspace response');
    setData(value as Data);
    pendingKeys.current.clear();
  }
  async function action(work: () => Promise<void>, success = 'Saved in the sandbox.') {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
      setNotice(success);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }
  function submit(e: FormEvent<HTMLFormElement>, path: string, body: (f: FormData) => unknown) {
    e.preventDefault();
    const form = e.currentTarget,
      f = new FormData(form);
    void action(async () => {
      await request(path, 'POST', body(f), token, true);
      await refresh();
      form.reset();
    });
  }
  async function auth(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    await action(async () => {
      const otp = String(f.get('otp') ?? '').trim();
      if (!signup && otp && !/^[0-9]{6}$/.test(otp))
        throw new Error(
          'Enter the six-digit code from your authenticator app. The setup key belongs in the authenticator app, not this field.',
        );
      const codeField = form.elements.namedItem('otp');
      if (codeField instanceof HTMLInputElement) codeField.value = '';
      const session = await request(
        signup ? '/auth/register' : '/auth/login',
        'POST',
        {
          email: f.get('email'),
          password: f.get('password'),
          ...(signup ? { merchantName: f.get('merchantName') } : { otp }),
        },
        '',
      );
      if (
        !session ||
        typeof session !== 'object' ||
        !('token' in session) ||
        typeof session.token !== 'string'
      )
        throw new Error('Invalid login response');
      await refresh(session.token);
      setToken(session.token);
      setPage('Overview');
    }, 'Signed in to the sandbox.');
  }
  function navigate(next: string) {
    setPage(next);
    setSelected(null);
    setSecret('');
    setCheckoutShare(null);
    setSearch('');
    setFilter('all');
    setError('');
    setNotice('');
    setMenu(false);
  }
  function exportCsv() {
    const fields = [
      'id',
      'reference',
      'method',
      'amount_minor',
      'fee_minor',
      'status',
      'created_at',
    ];
    const escape = (v: unknown) =>
      `"${String(v ?? '')
        .replace(/^[=+@-]/, "'$&")
        .replaceAll('"', '""')}"`;
    const csv = [
      fields.join(','),
      ...filtered.map((r) => fields.map((k) => escape(r[k])).join(',')),
    ].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sandbox-transactions.csv';
    a.click();
    URL.revokeObjectURL(url);
  }
  const admin = data?.user.role === 'platform_admin';
  const nav = admin
    ? [
        'Overview',
        'Transactions',
        'Merchants',
        'Commissions',
        'Wallet & balance sheet',
        'Settlements',
        'Refunds',
        'Audit log',
      ]
    : [
        'Overview',
        'Transactions',
        'Payment links',
        'Wallet & balance sheet',
        'Settlements',
        'Refunds',
        'Developers',
        'Audit log',
      ];
  const filtered = (data?.payments ?? []).filter(
    (r) =>
      (filter === 'all' || r['status'] === filter) &&
      `${r['reference']} ${r['id']} ${r['method']}`.toLowerCase().includes(search.toLowerCase()),
  );
  const paymentColumns = [
    {
      label: 'Reference',
      render: (r: Row) => (
        <button className="text-button" onClick={() => setSelected(r)}>
          {String(r['reference'])}
        </button>
      ),
    },
    col('Method', 'method'),
    col('Gross', 'amount_minor', money),
    col('Commission', 'fee_minor', money),
    col('Status', 'status', status),
    col('Date', 'created_at', date),
  ];
  const shareCheckout = (r: Row) =>
    void action(async () => {
      const result = (await request(`/links/${r['id']}/checkout`, 'POST', {}, token, true)) as {
        checkoutToken: string;
      };
      const url = new URL('/pay', window.location.origin);
      url.hash = new URLSearchParams({ token: result.checkoutToken }).toString();
      setCheckoutShare({
        url: url.toString(),
        qr: await QRCode.toDataURL(url.toString(), { width: 240, margin: 4 }),
        reference: String(r['reference']),
      });
    }, 'Test checkout ready to share. Anyone with the link can complete a simulated payment.');

  if (!data)
    return (
      <main className="auth-shell">
        <section className="auth-intro">
          <a className="brand" href="/">
            <span className="brand-mark">P</span>Payflow
          </a>
          <p className="eyebrow">Merchant payment workspace</p>
          <h1>
            Your business.
            <br />
            One clear view.
          </h1>
          <p>
            Explore test payments, commissions, refunds and settlement accounting in a persistent
            sandbox.
          </p>
          <div className="auth-facts">
            <span>UPI & card simulations</span>
            <span>Merchant-isolated records</span>
            <span>Balanced accounting</span>
          </div>
          <p className="small-copy">Synthetic data only. No real funds are collected or moved.</p>
        </section>
        <section className="auth-card">
          <span className="sandbox-badge">Sandbox only</span>
          <h2>{signup ? 'Create a test merchant' : 'Sign in to your workspace'}</h2>
          <p className="muted-text">
            {signup
              ? 'Use an email ending in .test. New accounts receive merchant access only.'
              : 'Administrators also need a code from their authenticator app.'}
          </p>
          {!api && (
            <div role="alert" className="error-banner">
              API URL is not configured. Set NEXT_PUBLIC_SANDBOX_API_URL in Vercel and rebuild.
            </div>
          )}
          {error && (
            <div className="error-banner" role="alert">
              {error}
            </div>
          )}
          <form onSubmit={auth}>
            <Field label="Email" name="email" type="email" />
            {signup && <Field label="Test merchant name" name="merchantName" />}
            <Field label="Password (12–128 characters)" name="password" type="password" />
            {!signup && (
              <label className="form-field">
                <span>Six-digit authenticator code (admins only)</span>
                <input
                  name="otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  placeholder="123456"
                  title="Enter the current six-digit code shown in your authenticator app."
                  aria-describedby="authenticator-help"
                />
                <small id="authenticator-help" className="muted-text">
                  Add your setup key to an authenticator app first, then enter its current six-digit
                  code here. It changes every 30 seconds. Merchant accounts can leave this blank.
                </small>
              </label>
            )}
            {!signup && (
              <details className="small-copy">
                <summary>Need to set up your administrator authenticator?</summary>
                <ol>
                  <li>Obtain your private setup QR code from the platform owner.</li>
                  <li>In your phone's authenticator app, add an account and scan the QR code.</li>
                  <li>
                    Enter the app's current code here. Keep your phone's time set automatically.
                  </li>
                </ol>
                <p>
                  A fixed code copied from a screenshot will expire. Keep your setup key private.
                </p>
              </details>
            )}
            <button className="primary-button" disabled={busy || !api}>
              {busy ? 'Connecting…' : signup ? 'Create test account' : 'Sign in'}
            </button>
          </form>
          <button
            className="text-button auth-toggle"
            disabled={busy}
            onClick={() => {
              setSignup(!signup);
              setError('');
            }}
          >
            {signup ? 'Already have an account? Sign in' : 'Create a test merchant account'}
          </button>
          <p className="small-copy">
            Sessions stay in memory. Reloading signs you out. Password recovery and real payments
            are not connected.
          </p>
        </section>
      </main>
    );

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="sidebar">
        <div className="sidebar-header">
          <a className="brand" href="/">
            <span className="brand-mark">P</span>Payflow
          </a>
          <button
            className="mobile-menu-button"
            aria-expanded={menu}
            aria-controls="workspace-nav"
            aria-label="Toggle navigation"
            onClick={() => setMenu(!menu)}
          >
            ☰
          </button>
        </div>
        <nav id="workspace-nav" className={menu ? 'primary-nav primary-nav-open' : 'primary-nav'}>
          <ul className="nav-list">
            {nav.map((item) => (
              <li key={item}>
                <button
                  className={`nav-item ${page === item ? 'nav-item-active' : ''}`}
                  aria-current={page === item ? 'page' : undefined}
                  onClick={() => navigate(item)}
                >
                  {item}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="sidebar-footer">
          <span className="environment-dot" />
          Sandbox · No real funds
        </div>
      </aside>
      <div className="content-shell">
        <header className="topbar">
          <div>
            <p className="workspace-name">
              {admin
                ? 'Platform administration'
                : String(data.merchants[0]?.['name'] ?? 'Merchant workspace')}
            </p>
            <span className="small-copy">{data.user.email}</span>
          </div>
          <div className="toolbar">
            <span className="role-label">{admin ? 'Administrator · MFA' : 'Merchant owner'}</span>
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  await request('/auth/logout', 'POST', {});
                  setToken('');
                  setData(null);
                  setSecret('');
                }, 'Signed out.')
              }
            >
              Sign out
            </button>
          </div>
        </header>
        <main id="main-content" className="dashboard-content">
          <section className="welcome-panel">
            <div>
              <p className="eyebrow">{admin ? 'Platform console' : 'Merchant workspace'}</p>
              <h1>{page}</h1>
              <p className="muted-text">
                {page === 'Overview'
                  ? 'Track your test payments and see where every rupee goes.'
                  : 'Sandbox records are saved in your database.'}
              </p>
            </div>
            <div className="toolbar">
              <span className="sandbox-badge">Test mode</span>
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => void action(() => refresh(), 'Workspace refreshed.')}
              >
                Refresh
              </button>
            </div>
          </section>
          <div className="sandbox-strip">
            Test mode: share checkout links and simulate payments. No bank transfer or real funds
            movement is connected.
          </div>
          {error && (
            <div className="error-banner" role="alert">
              {error}
            </div>
          )}
          {notice && (
            <div className="success-banner" role="status">
              {notice}
            </div>
          )}

          {(page === 'Overview' || page === 'Wallet & balance sheet') && (
            <section className="metric-grid">
              <Metric
                label={admin ? 'Merchant liabilities' : 'Available sandbox balance'}
                value={money(data.totals.merchant_balance)}
                note="From immutable journal entries"
              />
              <Metric
                label="Net platform commission"
                value={money(data.totals.commission)}
                note="After test refund reversals"
              />
              <Metric
                label="Current commission rate"
                value={`${Number(data.fees[0]?.['bps'] ?? 0) / 100}%`}
                note="Each payment keeps its original fee policy"
              />
            </section>
          )}
          {page === 'Overview' && (
            <>
              <section className="workspace-card">
                <div className="section-heading">
                  <h2>Recent test payments</h2>
                  <button className="text-button" onClick={() => navigate('Transactions')}>
                    View transactions →
                  </button>
                </div>
                <Table rows={data.payments.slice(0, 6)} columns={paymentColumns} />
              </section>
              <section className="workspace-card">
                <h2>Start exploring</h2>
                <ol className="setup-list">
                  <li>Create a test payment in Transactions.</li>
                  <li>Review its captured amount and commission.</li>
                  <li>Refund it or simulate a settlement.</li>
                  <li>Inspect the balance sheet and audit trail.</li>
                </ol>
              </section>
            </>
          )}
          {page === 'Transactions' && (
            <>
              <section className="workspace-card">
                <div className="toolbar filters">
                  <label>
                    Search
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Reference, ID or method"
                    />
                  </label>
                  <label>
                    Status
                    <select value={filter} onChange={(e) => setFilter(e.target.value)}>
                      <option value="all">All</option>
                      <option>captured</option>
                      <option>failed</option>
                      <option>refunded</option>
                    </select>
                  </label>
                  <button className="secondary-button" onClick={exportCsv}>
                    Export CSV
                  </button>
                </div>
                <p className="small-copy">Latest 100 records. CSV amounts are in paise.</p>
                <Table rows={filtered} columns={paymentColumns} />
              </section>
              {!admin && (
                <section className="workspace-card">
                  <h2>Create a test payment</h2>
                  <form
                    className="inline-form"
                    onSubmit={(e) =>
                      submit(e, '/payments', (f) => ({
                        reference: f.get('reference'),
                        amountMinor: minor(f.get('amount')),
                        method: f.get('method'),
                        outcome: f.get('outcome'),
                      }))
                    }
                  >
                    <Field label="Reference" name="reference" />
                    <Field label="Amount (INR)" name="amount" />
                    <label className="form-field">
                      Method
                      <select name="method">
                        <option value="upi">UPI simulation</option>
                        <option value="card">Card simulation</option>
                      </select>
                    </label>
                    <label className="form-field">
                      Outcome
                      <select name="outcome">
                        <option value="captured">Captured</option>
                        <option value="failed">Failed</option>
                      </select>
                    </label>
                    <button className="primary-button" disabled={busy}>
                      Simulate payment
                    </button>
                  </form>
                </section>
              )}
            </>
          )}
          {selected && ['Transactions', 'Overview'].includes(page) && (
            <section className="workspace-card">
              <div className="section-heading">
                <h2>Payment details</h2>
                <button className="text-button" onClick={() => setSelected(null)}>
                  Close
                </button>
              </div>
              <dl className="detail-list">
                {['id', 'reference', 'method', 'status', 'fee_version_id'].map((key) => (
                  <div key={key}>
                    <dt>{key.replaceAll('_', ' ')}</dt>
                    <dd>{String(selected[key])}</dd>
                  </div>
                ))}
                <div>
                  <dt>Gross / commission</dt>
                  <dd>
                    {money(selected['amount_minor'])} / {money(selected['fee_minor'])}
                  </dd>
                </div>
              </dl>
              {!admin && selected['status'] === 'captured' && (
                <form
                  className="inline-form"
                  onSubmit={(e) => {
                    submit(e, `/payments/${selected['id']}/refund`, (f) => ({
                      reason: f.get('reason'),
                    }));
                    setSelected(null);
                  }}
                >
                  <Field label="Full refund reason" name="reason" />
                  <button className="secondary-button" disabled={busy}>
                    Refund test payment
                  </button>
                  <p className="small-copy">
                    Full test refunds reverse the original commission. Sufficient unsettled balance
                    is required.
                  </p>
                </form>
              )}
            </section>
          )}
          {page === 'Payment links' && (
            <>
              <section className="workspace-card">
                <h2>Create a payment link</h2>
                <p className="small-copy">
                  Share a checkout page or QR code. Customers can complete a test payment without a
                  merchant account.
                </p>
                <form
                  className="inline-form"
                  onSubmit={(e) =>
                    submit(e, '/links', (f) => ({
                      reference: f.get('reference'),
                      amountMinor: minor(f.get('amount')),
                      expiresInMinutes: Number(f.get('expiresInMinutes')),
                    }))
                  }
                >
                  <Field label="Reference" name="reference" />
                  <Field label="Amount (INR)" name="amount" />
                  <label className="form-field">
                    <span>Expires after</span>
                    <select name="expiresInMinutes" defaultValue="1440">
                      <option value="60">1 hour</option>
                      <option value="1440">24 hours</option>
                      <option value="10080">7 days</option>
                    </select>
                  </label>
                  <button className="primary-button" disabled={busy}>
                    Create test link
                  </button>
                </form>
              </section>
              {checkoutShare && (
                <section className="workspace-card checkout-share" aria-label="Share checkout">
                  <div>
                    <p className="eyebrow">Share test checkout</p>
                    <h2>{checkoutShare.reference}</h2>
                    <label className="form-field">
                      <span>Checkout URL</span>
                      <input
                        value={checkoutShare.url}
                        readOnly
                        onFocus={(e) => e.currentTarget.select()}
                      />
                    </label>
                    <div className="toolbar">
                      <button
                        className="secondary-button"
                        onClick={() =>
                          void action(
                            () => navigator.clipboard.writeText(checkoutShare.url),
                            'Checkout link copied.',
                          )
                        }
                      >
                        Copy link
                      </button>
                      <a
                        className="primary-button"
                        href={checkoutShare.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open checkout
                      </a>
                      <button className="text-button" onClick={() => setCheckoutShare(null)}>
                        Close
                      </button>
                    </div>
                    <p className="small-copy">
                      This QR opens the test checkout page. It is not a UPI payment QR.
                    </p>
                  </div>
                  <img
                    src={checkoutShare.qr}
                    width={240}
                    height={240}
                    alt="Scan to open this test checkout"
                  />
                </section>
              )}
              <section className="workspace-card">
                <Table
                  rows={data.links}
                  columns={[
                    col('Reference', 'reference'),
                    col('Amount', 'amount_minor', money),
                    col('Type', 'kind'),
                    {
                      label: 'Status',
                      render: (r) =>
                        status(
                          r['status'] === 'active' &&
                            new Date(String(r['expires_at'])).getTime() <= Date.now()
                            ? 'expired'
                            : r['status'],
                        ),
                    },
                    col('Expires', 'expires_at', date),
                    {
                      label: 'Test checkout',
                      render: (r) =>
                        r['status'] === 'active' &&
                        new Date(String(r['expires_at'])).getTime() > Date.now() ? (
                          <div className="toolbar">
                            <button
                              className="text-button"
                              disabled={busy}
                              onClick={() => shareCheckout(r)}
                            >
                              Share checkout
                            </button>
                            <button
                              className="text-button danger"
                              disabled={busy}
                              onClick={() =>
                                void action(async () => {
                                  await request(
                                    `/links/${r['id']}/cancel`,
                                    'POST',
                                    {},
                                    token,
                                    true,
                                  );
                                  await refresh();
                                })
                              }
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          '—'
                        ),
                    },
                  ]}
                />
              </section>
            </>
          )}
          {page === 'Wallet & balance sheet' && (
            <>
              <section className="workspace-card">
                <h2>Sandbox balance sheet</h2>
                <p className="small-copy">
                  Illustrative accounting, not a bank statement. Assets equal merchant liabilities
                  plus platform income. Taxes and provider fees are not simulated.
                </p>
                <dl className="detail-list">
                  <dt>Simulated provider assets</dt>
                  <dd>{money(data.totals.assets)}</dd>
                  <dt>Merchant liabilities</dt>
                  <dd>{money(data.totals.merchant_balance)}</dd>
                  <dt>Platform income</dt>
                  <dd>{money(data.totals.commission)}</dd>
                </dl>
              </section>
              <section className="workspace-card">
                <h2>Immutable journal</h2>
                <Table
                  rows={data.journals}
                  columns={[
                    col('Event', 'kind'),
                    col('Asset movement', 'asset_delta', money),
                    col('Merchant movement', 'merchant_delta', money),
                    col('Income movement', 'income_delta', money),
                    col('Source', 'source_id', short),
                    col('Date', 'created_at', date),
                  ]}
                />
              </section>
            </>
          )}
          {page === 'Settlements' && (
            <>
              {!admin && (
                <section className="workspace-card">
                  <h2>Simulate a settlement</h2>
                  <p className="small-copy">
                    Available: {money(data.totals.merchant_balance)}. This updates test accounting
                    only and cannot withdraw to a bank.
                  </p>
                  <form
                    className="inline-form"
                    onSubmit={(e) =>
                      submit(e, '/settlements', (f) => ({ amountMinor: minor(f.get('amount')) }))
                    }
                  >
                    <Field label="Amount (INR)" name="amount" />
                    <button className="primary-button" disabled={busy}>
                      Simulate settlement
                    </button>
                  </form>
                </section>
              )}
              <section className="workspace-card">
                <Table
                  rows={data.settlements}
                  columns={[
                    col('Settlement', 'id', short),
                    col('Amount', 'amount_minor', money),
                    col('Status', 'status', status),
                    col('Date', 'created_at', date),
                  ]}
                />
              </section>
            </>
          )}
          {page === 'Refunds' && (
            <section className="workspace-card">
              <h2>Full test refunds</h2>
              <p className="small-copy">
                To refund a captured test payment, open its details in Transactions.
              </p>
              <Table
                rows={data.refunds}
                columns={[
                  col('Refund', 'id', short),
                  col('Payment', 'payment_id', short),
                  col('Amount', 'amount_minor', money),
                  col('Reason', 'reason'),
                  col('Date', 'created_at', date),
                ]}
              />
            </section>
          )}
          {page === 'Developers' && (
            <>
              <section className="workspace-card">
                <h2>Scoped sandbox API keys</h2>
                <p className="small-copy">
                  Keys can list and simulate your merchant’s payments. They cannot access admin,
                  refunds, settlements or key management. Enable collection access below to also
                  create orders and publish checkout links.
                </p>
                <form
                  className="inline-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void action(async () => {
                      const r = (await request('/keys', 'POST', {
                        label: f.get('label'),
                        collectionsEnabled: f.get('collectionsEnabled') === 'on',
                      })) as {
                        secret: string;
                      };
                      setSecret(r.secret);
                      await refresh();
                    }, 'Copy the key now; it will not be shown again.');
                  }}
                >
                  <Field label="Key label" name="label" />
                  <label className="collection-scope">
                    <input type="checkbox" name="collectionsEnabled" /> Allow order creation and
                    checkout links
                  </label>
                  <button className="primary-button" disabled={busy}>
                    Create test key
                  </button>
                </form>
                {secret && (
                  <div className="secret-display">
                    <code>{secret}</code>
                    <button
                      className="secondary-button"
                      onClick={() =>
                        void action(() => navigator.clipboard.writeText(secret), 'Copied.')
                      }
                    >
                      Copy
                    </button>
                    <button className="text-button" onClick={() => setSecret('')}>
                      Hide
                    </button>
                  </div>
                )}
                <Table
                  rows={data.keys}
                  columns={[
                    col('Label', 'label'),
                    col('Prefix', 'prefix'),
                    {
                      label: 'Scope',
                      render: (r) =>
                        r['collections_enabled'] ? 'Payments + collections' : 'Payments',
                    },
                    { label: 'Status', render: (r) => (r['revoked_at'] ? 'Revoked' : 'Active') },
                    {
                      label: 'Action',
                      render: (r) =>
                        !r['revoked_at'] && (
                          <button
                            className="text-button danger"
                            disabled={busy}
                            onClick={() =>
                              void action(async () => {
                                await request(`/keys/${r['id']}`, 'DELETE');
                                await refresh();
                              })
                            }
                          >
                            Revoke
                          </button>
                        ),
                    },
                  ]}
                />
              </section>
              <section className="workspace-card">
                <h2>API quick start</h2>
                <p>Create a key with collection access, then create an order on your server:</p>
                <pre>{`POST ${api}/v1/sandbox/orders\nAuthorization: Bearer <server-side-test-key>\nIdempotency-Key: <unique-request-id>\nContent-Type: application/json\n\n{"amountMinor":100000,"reference":"ORDER-1001","expiresInMinutes":1440}\n\nPOST ${api}/v1/sandbox/orders/<order-id>/checkout\nAuthorization: Bearer <server-side-test-key>\nIdempotency-Key: <another-unique-request-id>\n\nResponse includes checkoutToken. Open /pay#token=<checkoutToken> on this dashboard's origin.\nGET ${api}/v1/sandbox/orders/<order-id> to verify the saved result on your server.`}</pre>
                <h3>Direct payment simulation</h3>
                <pre>{`POST ${api}/v1/sandbox/payments\nAuthorization: Bearer <server-side-test-key>\nIdempotency-Key: <unique-request-id>\nContent-Type: application/json\n\n{"amountMinor":100000,"reference":"ORDER-1001","method":"upi","outcome":"captured"}`}</pre>
                <p className="small-copy">
                  Amounts are integer paise. Reuse the same idempotency key and payload when
                  retrying. Keep keys on your server.
                </p>
              </section>
              <section className="workspace-card">
                <h2>Event log</h2>
                <p className="small-copy">
                  Events are stored for inspection. Outgoing webhook delivery is not connected.
                </p>
                <Table
                  rows={data.events}
                  columns={[
                    col('Event', 'event'),
                    col('Resource', 'resource_id', short),
                    col('Date', 'created_at', date),
                  ]}
                />
              </section>
            </>
          )}
          {page === 'Merchants' && (
            <section className="workspace-card">
              <Table
                rows={data.merchants}
                columns={[
                  col('Merchant', 'name'),
                  col('ID', 'id'),
                  col('Created', 'created_at', date),
                ]}
              />
            </section>
          )}
          {page === 'Commissions' && (
            <>
              <section className="workspace-card">
                <h2>Propose a sandbox commission</h2>
                <p className="small-copy">
                  A different MFA-authenticated administrator must approve. Existing payments retain
                  their original fee.
                </p>
                <form
                  className="inline-form"
                  onSubmit={(e) =>
                    submit(e, '/fees/proposals', (f) => ({
                      bps: minor(f.get('percentage')),
                      reason: f.get('reason'),
                    }))
                  }
                >
                  <Field label="Percentage (0–100)" name="percentage" />
                  <Field label="Reason" name="reason" />
                  <button className="primary-button" disabled={busy}>
                    Submit proposal
                  </button>
                </form>
              </section>
              <section className="workspace-card">
                <h2>Approval queue</h2>
                <Table
                  rows={data.proposals}
                  columns={[
                    col('Rate', 'bps', (v) => `${Number(v) / 100}%`),
                    col('Reason', 'reason'),
                    col('Status', 'status', status),
                    {
                      label: 'Action',
                      render: (r) =>
                        r['status'] === 'pending' ? (
                          r['proposer'] === data.user.id ? (
                            <span className="small-copy">Awaiting another administrator</span>
                          ) : (
                            <button
                              className="text-button"
                              disabled={busy}
                              onClick={() =>
                                void action(async () => {
                                  await request(
                                    `/fees/proposals/${r['id']}/approve`,
                                    'POST',
                                    {},
                                    token,
                                    true,
                                  );
                                  await refresh();
                                }, 'Policy activated for future test payments.')
                              }
                            >
                              Approve and activate
                            </button>
                          )
                        ) : (
                          'Approved'
                        ),
                    },
                  ]}
                />
              </section>
              <section className="workspace-card">
                <h2>Policy history</h2>
                <Table
                  rows={data.fees}
                  columns={[
                    col('Version', 'sequence'),
                    col('Rate', 'bps', (v) => `${Number(v) / 100}%`),
                    col('Reason', 'reason'),
                    col('Date', 'created_at', date),
                  ]}
                />
              </section>
            </>
          )}
          {page === 'Audit log' && (
            <section className="workspace-card">
              <h2>Recorded actions</h2>
              <p className="small-copy">
                Append-only application actions. Latest 100 entries in your scope.
              </p>
              <Table
                rows={data.audit}
                columns={[
                  col('Action', 'action'),
                  col('Actor', 'actor', short),
                  col('Resource', 'resource_id', short),
                  col('Date', 'created_at', date),
                ]}
              />
            </section>
          )}
          <footer className="workspace-footer">
            Payflow sandbox · Synthetic data only · Test payments do not create real funds.
          </footer>
        </main>
      </div>
    </div>
  );
}
