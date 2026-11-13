'use client';

import { useEffect, useRef, useState } from 'react';
import { resolveSandboxApiUrl } from '../lib/platform-status';

interface Receipt {
  id: string;
  status: string;
  amountMinor: number;
}
interface Details {
  id: string;
  merchantName: string;
  reference: string;
  amountMinor: number;
  status: string;
  expiresAt: string;
  payment: { id: string; status: string; amountMinor: number } | null;
  mode: string;
}
const api = resolveSandboxApiUrl(
  process.env['NEXT_PUBLIC_SANDBOX_API_URL'],
  process.env['NODE_ENV'] === 'development',
);
const money = (paise: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(paise / 100);

async function checkoutRequest(path: string, body: unknown, key?: string): Promise<unknown> {
  if (!api) throw new Error('Checkout is temporarily unavailable. Contact the merchant.');
  const response = await fetch(`${api}/v1/sandbox/checkout/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) },
    body: JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(45000),
  });
  const value: unknown = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      value && typeof value === 'object' && 'message' in value
        ? String(value.message)
        : 'Unable to reach checkout. Try again.',
    );
  return value;
}

function readDetails(value: unknown): Details {
  if (
    !value ||
    typeof value !== 'object' ||
    !('mode' in value) ||
    value.mode !== 'sandbox-only' ||
    !('amountMinor' in value) ||
    !Number.isSafeInteger(value.amountMinor)
  )
    throw new Error('Unexpected checkout response');
  return value as Details;
}

export function Checkout() {
  const [token, setToken] = useState('');
  const [details, setDetails] = useState<Details | null>(null);
  const [method, setMethod] = useState('upi');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const attempt = useRef<{ key: string; method: string; outcome: string } | null>(null);
  const activeToken = useRef('');

  useEffect(() => {
    let disposed = false;
    let generation = 0;
    function loadLink() {
      const current = ++generation;
      const checkoutToken = new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '';
      activeToken.current = checkoutToken;
      attempt.current = null;
      setToken(checkoutToken);
      setDetails(null);
      setReceipt(null);
      setError('');
      setBusy(false);
      setLoading(true);
      if (!/^[A-Za-z0-9_-]{43}$/.test(checkoutToken)) {
        setError('This checkout link is incomplete. Ask the merchant for a new link.');
        setLoading(false);
        return;
      }
      void checkoutRequest('details', { token: checkoutToken })
        .then((value) => {
          if (!disposed && current === generation) setDetails(readDetails(value));
        })
        .catch((e: unknown) => {
          if (!disposed && current === generation)
            setError(e instanceof Error ? e.message : 'Checkout unavailable');
        })
        .finally(() => {
          if (!disposed && current === generation) setLoading(false);
        });
    }
    loadLink();
    window.addEventListener('hashchange', loadLink);
    return () => {
      disposed = true;
      activeToken.current = '';
      window.removeEventListener('hashchange', loadLink);
    };
  }, []);

  async function pay(outcome: string) {
    if (busy || !details || details.status !== 'active') return;
    setBusy(true);
    setError('');
    if (
      !attempt.current ||
      attempt.current.method !== method ||
      attempt.current.outcome !== outcome
    )
      attempt.current = { key: crypto.randomUUID(), method, outcome };
    try {
      const value = await checkoutRequest('pay', { token, method, outcome }, attempt.current.key);
      if (activeToken.current !== token) return;
      if (
        !value ||
        typeof value !== 'object' ||
        !('id' in value) ||
        !('status' in value) ||
        !('amountMinor' in value)
      )
        throw new Error('Payment result could not be confirmed. Retry the same action.');
      setReceipt(value as Receipt);
      attempt.current = null;
      const updated = await checkoutRequest('details', { token });
      if (activeToken.current === token) setDetails(readDetails(updated));
    } catch (e) {
      if (activeToken.current !== token) return;
      setError(
        e instanceof Error ? e.message : 'Payment result could not be confirmed. Try again.',
      );
      // A concurrent checkout may already have succeeded; recover its recorded receipt.
      try {
        const updated = await checkoutRequest('details', { token });
        if (activeToken.current === token) setDetails(readDetails(updated));
      } catch {
        /* Keep the actionable original error. */
      }
    } finally {
      if (activeToken.current === token) setBusy(false);
    }
  }

  const paid = details?.status === 'paid';
  const refunded = details?.payment?.status === 'refunded';
  const paymentId = details?.payment?.id ?? receipt?.id;
  return (
    <main className="checkout-shell">
      <header className="checkout-header">
        <span className="brand-mark">P</span>
        <strong>Payflow</strong>
        <span className="sandbox-badge">Test checkout</span>
      </header>
      <div className="checkout-grid">
        <aside className="checkout-summary">
          <p className="eyebrow">Payment request</p>
          <h1>{details?.merchantName ?? 'Merchant checkout'}</h1>
          <p className="checkout-amount">{details ? money(details.amountMinor) : '—'}</p>
          {details && (
            <dl>
              <dt>Reference</dt>
              <dd>{details.reference}</dd>
              <dt>Link expires</dt>
              <dd>{new Date(details.expiresAt).toLocaleString('en-IN')}</dd>
            </dl>
          )}
          <div className="checkout-test-note">
            <strong>No real money moves.</strong>
            <p>
              This is a sandbox payment request. Do not enter card details, UPI PINs or bank
              information.
            </p>
          </div>
        </aside>
        <section className="checkout-card" aria-live="polite" aria-busy={busy || loading}>
          {loading ? (
            <p>Loading payment request…</p>
          ) : (
            <>
              {error && (
                <div className="error-banner" role="alert">
                  {error}
                </div>
              )}
              {paid ? (
                <>
                  <div className="checkout-success-mark" aria-hidden="true">
                    ✓
                  </div>
                  <h2>{refunded ? 'Test payment refunded' : 'Test payment successful'}</h2>
                  <p>
                    {refunded
                      ? 'The merchant has recorded a full test refund.'
                      : 'The merchant’s test transaction and balance have been updated.'}
                  </p>
                  <div className="checkout-receipt">
                    <span>Test receipt</span>
                    <strong>{money(details.amountMinor)}</strong>
                    <code>{paymentId}</code>
                  </div>
                  <p className="small-copy">
                    This receipt records a simulation. It is not proof of a bank payment.
                  </p>
                  <button className="secondary-button" onClick={() => window.print()}>
                    Print test receipt
                  </button>
                </>
              ) : details?.status === 'active' ? (
                <>
                  <p className="eyebrow">Choose a test payment method</p>
                  <h2>Complete your test payment</h2>
                  <fieldset className="checkout-methods" disabled={busy}>
                    <legend className="small-copy">Payment method</legend>
                    <label
                      className={method === 'upi' ? 'checkout-method selected' : 'checkout-method'}
                    >
                      <input
                        type="radio"
                        name="method"
                        value="upi"
                        checked={method === 'upi'}
                        onChange={() => setMethod('upi')}
                      />
                      <span>
                        <strong>UPI test</strong>
                        <small>Simulate an instant payment</small>
                      </span>
                    </label>
                    <label
                      className={method === 'card' ? 'checkout-method selected' : 'checkout-method'}
                    >
                      <input
                        type="radio"
                        name="method"
                        value="card"
                        checked={method === 'card'}
                        onChange={() => setMethod('card')}
                      />
                      <span>
                        <strong>Card test</strong>
                        <small>No card number or CVV needed</small>
                      </span>
                    </label>
                  </fieldset>
                  {receipt?.status === 'failed' && (
                    <p className="checkout-failure" role="status">
                      Test payment declined. No balance was credited. You can try again.
                    </p>
                  )}
                  <button
                    className="primary-button checkout-pay"
                    disabled={busy}
                    onClick={() => void pay('captured')}
                  >
                    {busy ? 'Confirming…' : `Complete test payment · ${money(details.amountMinor)}`}
                  </button>
                  <button
                    className="text-button checkout-fail"
                    disabled={busy}
                    onClick={() => void pay('failed')}
                  >
                    Simulate a declined payment
                  </button>
                  <p className="small-copy">
                    A successful test records the merchant’s commission and net balance
                    automatically.
                  </p>
                </>
              ) : details ? (
                <>
                  <h2>Payment request {details.status}</h2>
                  <p>This link is no longer payable. Contact the merchant for a new request.</p>
                </>
              ) : (
                <>
                  <h2>Checkout unavailable</h2>
                  <p>Check that you opened the complete link provided by the merchant.</p>
                </>
              )}
            </>
          )}
        </section>
      </div>
      <footer className="checkout-footer">Payflow sandbox · No live payment processing</footer>
    </main>
  );
}
