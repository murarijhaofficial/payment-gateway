(() => {
  const root = globalThis.document.getElementById('payflow-test-receipt');
  if (!root) return;
  const message = globalThis.document.getElementById('payflow-test-result');
  const button = globalThis.document.getElementById('payflow-test-refresh');
  let busy = false;
  let attempts = 0;
  let timer;
  async function check() {
    if (busy) return;
    busy = true;
    button.disabled = true;
    globalThis.clearTimeout(timer);
    let terminal = false;
    try {
      const endpoint = new globalThis.URL(root.dataset.statusUrl, globalThis.location.href);
      if (endpoint.origin !== globalThis.location.origin) throw new Error('Unexpected status origin');
      const body = new globalThis.URLSearchParams({ order: root.dataset.order, key: root.dataset.key, nonce: root.dataset.nonce });
      const response = await globalThis.fetch(endpoint, { method: 'POST', body, credentials: 'same-origin', redirect: 'error', cache: 'no-store', signal: globalThis.AbortSignal.timeout(30000) });
      const value = await response.json();
      if (!response.ok || !value.success || value.data.mode !== 'sandbox-only' || value.data.canFulfill !== false) throw new Error('Result not verified');
      const status = value.data.status;
      terminal = ['captured', 'refunded', 'cancelled', 'expired'].includes(status);
      message.textContent = status === 'captured' ? 'Test checkout succeeded. No real payment was collected; this store order remains unpaid.' :
        status === 'refunded' ? 'The test payment was refunded. No real money moved.' :
        terminal ? `Test request ${status}. Create a new store order to try again.` : 'Waiting for a test result. Complete checkout in the other tab.';
    } catch {
      message.textContent = 'The test result could not be verified. Keep this page open and try again. The order has not been marked paid.';
    } finally {
      busy = false;
      button.disabled = false;
      attempts += 1;
      if (!terminal && attempts < 120) timer = globalThis.setTimeout(check, 5000);
    }
  }
  button.addEventListener('click', () => { attempts = 0; void check(); });
  globalThis.addEventListener('pagehide', () => globalThis.clearTimeout(timer));
  void check();
})();
