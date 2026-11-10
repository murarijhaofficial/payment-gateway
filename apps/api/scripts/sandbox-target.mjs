import { URL } from 'node:url';

export function validateSandboxTarget(connectionString, appEnv, migrationTarget) {
  if (appEnv !== 'development' || !connectionString) {
    throw new Error('Set APP_ENV=development and DATABASE_URL for the sandbox database');
  }
  let url;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error('DATABASE_URL is invalid');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('DATABASE_URL must be a PostgreSQL URL');
  }
  if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return connectionString;
  if (
    migrationTarget !== 'neon-sandbox' ||
    !/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.neon\.tech$/.test(url.hostname) ||
    url.searchParams.getAll('sslmode').length !== 1 ||
    !['require', 'verify-full'].includes(url.searchParams.get('sslmode')) ||
    [...url.searchParams.keys()].some((key) => !['sslmode', 'channel_binding'].includes(key))
  ) {
    throw new Error(
      'Remote migrations require an explicitly selected Neon sandbox with TLS enabled',
    );
  }
  url.searchParams.set('sslmode', 'verify-full');
  return url.toString();
}
