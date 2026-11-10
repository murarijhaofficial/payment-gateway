'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  getPlatformStatus,
  resolveSandboxApiUrl,
  type PlatformStatus,
} from '../lib/platform-status';

type StatusState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly value: PlatformStatus }
  | { readonly kind: 'error' };

const apiBaseUrl = resolveSandboxApiUrl(
  process.env['NEXT_PUBLIC_SANDBOX_API_URL'],
  process.env['NODE_ENV'] === 'development',
);

export function SandboxStatusCard() {
  const [status, setStatus] = useState<StatusState>({ kind: 'loading' });

  const refreshStatus = useCallback(async () => {
    setStatus({ kind: 'loading' });
    if (!apiBaseUrl) {
      setStatus({ kind: 'error' });
      return;
    }
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
            ? apiBaseUrl
              ? 'Could not connect. Check that the API is running and allows this site’s origin.'
              : 'The sandbox API URL is missing or invalid. Configure it in the deployment settings and redeploy.'
            : 'Connecting to the sandbox API.'}
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
