export interface PlatformStatus {
  readonly status: 'ok';
  readonly mode: 'sandbox-only';
  readonly payments: 'not-enabled';
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
