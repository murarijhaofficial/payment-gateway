// Server-side sandbox client. Never import this module into browser bundles.
import { URL } from 'node:url';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function origin(value, allowLocalHttp) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Invalid Payflow origin'); }
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
      !(url.protocol === 'https:' || (allowLocalHttp && local && url.protocol === 'http:')))
    throw new Error('Use an HTTPS origin without a path or credentials');
  return url.origin;
}
function amount(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 100000000) throw new Error('Use integer paise from 1 to 100000000');
}
function identifier(value) {
  if (typeof value !== 'string' || !uuidPattern.test(value)) throw new Error('Invalid order ID');
}
function idempotency(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{16,100}$/.test(value)) throw new Error('A persistent Idempotency-Key is required');
}
export class PayflowSandboxClient {
  #api;
  #checkout;
  #key;
  #fetch;
  constructor({ apiOrigin, checkoutOrigin, secretKey, allowLocalHttp = false, fetchImpl = globalThis.fetch }) {
    if (typeof secretKey !== 'string' || !/^sb_test_[A-Za-z0-9_-]{43}$/.test(secretKey)) throw new Error('A collection-enabled sb_test_ key is required');
    this.#api = origin(apiOrigin, allowLocalHttp);
    this.#checkout = origin(checkoutOrigin, allowLocalHttp);
    this.#key = secretKey;
    this.#fetch = fetchImpl;
  }
  async #request(path, method, body, key) {
    const response = await this.#fetch(`${this.#api}/v1/sandbox${path}`, {
      method, headers: { Authorization: `Bearer ${this.#key}`, 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: 'error', credentials: 'omit', cache: 'no-store', signal: globalThis.AbortSignal.timeout(45000),
    });
    if (!response.ok) {
      const error = new Error(`Payflow API request failed (${response.status})`);
      error.status = response.status;
      throw error;
    }
    const result = await response.json();
    if (!result || result.mode !== 'sandbox-only') throw new Error('Unexpected payment environment; result rejected');
    return result;
  }
  async createOrder({ amountMinor, reference, expiresInMinutes = 1440 }, key) {
    amount(amountMinor);
    idempotency(key);
    if (typeof reference !== 'string' || !reference.trim() || reference.length > 100) throw new Error('A reference of 1-100 characters is required');
    if (!Number.isInteger(expiresInMinutes) || expiresInMinutes < 1 || expiresInMinutes > 10080) throw new Error('Invalid expiry');
    const result = await this.#request('/orders', 'POST', { amountMinor, reference: reference.trim(), expiresInMinutes }, key);
    identifier(result.id);
    if (result.amountMinor !== amountMinor || result.currency !== 'INR') throw new Error('Order amount/currency mismatch');
    return result;
  }
  async checkoutForOrder(orderId, key) {
    identifier(orderId);
    idempotency(key);
    const result = await this.#request(`/orders/${orderId}/checkout`, 'POST', undefined, key);
    if (result.id !== orderId || typeof result.checkoutToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(result.checkoutToken)) throw new Error('Invalid checkout capability');
    const url = new URL('/pay', this.#checkout);
    url.hash = new URLSearchParams({ token: result.checkoutToken }).toString();
    return { orderId, checkoutUrl: url.toString(), expiresAt: result.expiresAt, mode: 'sandbox-only' };
  }
  async getOrder(orderId) {
    identifier(orderId);
    const result = await this.#request(`/orders/${orderId}`, 'GET');
    if (result.id !== orderId || result.currency !== 'INR' || !['active', 'paid', 'expired', 'cancelled'].includes(result.status)) throw new Error('Unexpected order result');
    amount(result.amountMinor);
    return result;
  }
  async verifyOrder(orderId, expected) {
    amount(expected.amountMinor);
    const order = await this.getOrder(orderId);
    if (order.amountMinor !== expected.amountMinor || order.reference !== expected.reference || order.currency !== (expected.currency ?? 'INR')) throw new Error('Order does not match the local purchase');
    if (order.payment && order.payment.amountMinor !== expected.amountMinor) throw new Error('Payment amount mismatch');
    const captured = order.status === 'paid' && order.payment?.status === 'captured';
    return { verified: true, mode: 'sandbox-only', result: captured ? 'simulated-captured' : order.payment?.status ?? order.status, canFulfill: false, order };
  }
}
