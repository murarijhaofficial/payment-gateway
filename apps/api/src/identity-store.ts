import type { PoolClient } from 'pg';

/** Trusted infrastructure only. No authorization or password hashing occurs here. */
export async function createSandboxIdentity(
  client: Pick<PoolClient, 'query'>,
  input: {
    userId: string;
    email: string;
    passwordHash: string;
    merchantId: string;
    merchantName: string;
  },
): Promise<void> {
  if (!input.email.trim() || !input.passwordHash.trim() || !input.merchantName.trim()) {
    throw new RangeError('identity fields must not be empty');
  }
  await client.query('BEGIN');
  try {
    await client.query('INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)', [
      input.userId,
      input.email.trim().toLowerCase(),
      input.passwordHash,
    ]);
    await client.query('INSERT INTO merchants (id, name) VALUES ($1, $2)', [
      input.merchantId,
      input.merchantName.trim(),
    ]);
    await client.query('INSERT INTO merchant_memberships (user_id, merchant_id) VALUES ($1, $2)', [
      input.userId,
      input.merchantId,
    ]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
