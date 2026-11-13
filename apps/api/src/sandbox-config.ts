import { URL } from 'node:url';

export function readSandboxConfig(
  env: Record<string, string | undefined>,
): { enabled: false } | { enabled: true; databaseUrl: string; encryptionKey: string } {
  const enabled = env['ENABLE_SANDBOX_WORKSPACE'];
  if (enabled === undefined || enabled === 'false') return { enabled: false };
  if (enabled !== 'true')
    throw new Error(
      'ENABLE_SANDBOX_WORKSPACE must be exactly true or false (without quotes or spaces).',
    );

  const databaseUrl = env['DATABASE_URL'];
  const encryptionKey = env['SANDBOX_ENCRYPTION_KEY'];
  const errors: string[] = [];
  if (!databaseUrl?.trim()) errors.push('DATABASE_URL is missing');
  else {
    try {
      const url = new URL(databaseUrl);
      if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname)
        errors.push('DATABASE_URL must be a PostgreSQL connection URL');
    } catch {
      errors.push('DATABASE_URL must be a valid PostgreSQL connection URL');
    }
  }
  if (!encryptionKey) errors.push('SANDBOX_ENCRYPTION_KEY is missing');
  else if (!/^[a-f0-9]{64}$/i.test(encryptionKey))
    errors.push(
      'SANDBOX_ENCRYPTION_KEY must be exactly 64 hexadecimal characters (0-9, a-f), with no quotes or spaces; an authenticator setup key is not an encryption key',
    );
  if (errors.length)
    throw new Error(
      `Sandbox configuration invalid: ${errors.join('; ')}. On Render, update the service Environment and choose Save and deploy. Use the existing encryption key from the private apps/api/.env used for seeding.`,
    );
  return { enabled: true, databaseUrl: databaseUrl!, encryptionKey: encryptionKey! };
}
