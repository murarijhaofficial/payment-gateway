'use client';

import { useCallback, useEffect, useState } from 'react';

import { getPlatformStatus, type PlatformStatus } from '../lib/platform-status';

type StatusState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly value: PlatformStatus }
  | { readonly kind: 'error' };

const apiBaseUrl = process.env['NEXT_PUBLIC_SANDBOX_API_URL'] ?? 'http://127.0.0.1:3001';

export function SandboxStatusCard() {
  const [status, setStatus] = useState<StatusState>({ kind: 'loading' });

  const refreshStatus = useCallback(async () => {
    setStatus({ kind: 'loading' });
    try {
      const value = await getPlatformStatus(fetch, apiBaseUrl);
      setStatus({ kind: 'ready', value });
    } catch {
      setStatus({ kind: 'error' });
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const statusText =
    status.kind === 'loading'
      ? 'Checking service…'
      : status.kind === 'ready'
        ? 'API connected'
        : 'API unavailable';

  return (
    <article className="connection-card" aria-labelledby="connection-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Integration status</p>
          <h2 id="connection-title">Sandbox API</h2>
        </div>
        <span className={`status-pill status-${status.kind}`} aria-live="polite">
          <span aria-hidden="true" className="status-indicator" />
          {statusText}
        </span>
      </div>
      <p className="connection-copy">
        {status.kind === 'ready'
          ? `The API reports ${status.value.mode}; payment creation remains ${status.value.payments.replace('-', ' ')}.`
          : status.kind === 'error'
            ? 'Start the local sandbox API, then try again. No data has been sent.'
            : 'Connecting to the local sandbox API.'}
      </p>
      <button
        className="secondary-button"
        type="button"
        onClick={() => void refreshStatus()}
        disabled={status.kind === 'loading'}
      >
        {status.kind === 'loading' ? 'Checking…' : 'Refresh status'}
      </button>
    </article>
  );
}
