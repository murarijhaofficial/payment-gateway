export interface PlatformStatus {
  readonly status: 'ok';
  readonly mode: 'sandbox-only';
  readonly payments: 'not-enabled';
}

export function resolveSandboxApiUrl(
  configuredUrl: string | undefined,
  isDevelopment: boolean,
): string | null {
  const value = configuredUrl?.trim() || (isDevelopment ? 'http://127.0.0.1:3001' : '');
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      (url.protocol !== 'https:' && !(isDevelopment && url.protocol === 'http:')) ||
      (!isDevelopment && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function isPlatformStatus(value: unknown): value is PlatformStatus {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    candidate['status'] === 'ok' &&
    candidate['mode'] === 'sandbox-only' &&
    candidate['payments'] === 'not-enabled'
  );
}

export async function getPlatformStatus(
  fetcher: typeof fetch,
  apiBaseUrl: string,
): Promise<PlatformStatus> {
  const response = await fetcher(`${apiBaseUrl}/health`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Sandbox API health request failed');
  }

  const payload: unknown = await response.json();
  if (!isPlatformStatus(payload)) {
    throw new Error('Sandbox API returned an unexpected response');
  }

  return payload;
}
