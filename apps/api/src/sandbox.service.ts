import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import {
  checkPassword,
  decryptSecret,
  digest,
  hashPassword,
  newToken,
  verifyTotp,
} from './sandbox-security.js';
import { integerField, objectBody, passwordField, textField, uuid } from './sandbox-input.js';

type Row = Record<string, unknown>;
export interface SandboxContext {
  userId: string;
  merchantId: string | null;
  email: string;
  role: 'merchant_owner' | 'platform_admin';
  keyId: string | null;
  tokenHash: string;
}
export function sandboxPool(connectionString: string): Pool {
  const url = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(url.protocol))
    throw new Error('Invalid database protocol');
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    if (!url.hostname.endsWith('.neon.tech'))
      throw new Error('Use the configured Neon sandbox database');
    url.searchParams.set('sslmode', 'verify-full');
  }
  return new Pool({
    connectionString: url.toString(),
    max: 5,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    statement_timeout: 15000,
  });
}

export class SandboxService {
  private readonly dummyHash = hashPassword(newToken());
  constructor(
    private readonly pool: Pool | null,
    private readonly encryptionKey: string,
  ) {}
  async onModuleDestroy() {
    await this.pool?.end();
  }
  private db(): Pool {
    if (!this.pool)
      throw new ServiceUnavailableException(
        'Sandbox workspace is not configured. Set ENABLE_SANDBOX_WORKSPACE, DATABASE_URL and SANDBOX_ENCRYPTION_KEY on the API.',
      );
    return this.pool;
  }
  private async transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.db().connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  private async rate(key: string, limit: number, seconds = 600) {
    const result = await this.db().query<Row>(
      `INSERT INTO sb_rate_limits (key,hits,reset_at) VALUES ($1,1,now()+$2*interval '1 second')
      ON CONFLICT (key) DO UPDATE SET hits = CASE WHEN sb_rate_limits.reset_at <= now() THEN 1 ELSE sb_rate_limits.hits+1 END,
      reset_at = CASE WHEN sb_rate_limits.reset_at <= now() THEN now()+$2*interval '1 second' ELSE sb_rate_limits.reset_at END RETURNING hits`,
      [digest(key), seconds],
    );
    if (Number(result.rows[0]?.['hits']) > limit)
      throw new HttpException('Too many attempts. Try again later.', 429);
  }
  async login(raw: unknown, ip: string) {
    const body = objectBody(raw, ['email', 'password', 'otp']);
    const email = textField(body, 'email', 3, 254).toLowerCase();
    const password = passwordField(body);
    await this.rate(`auth-ip:${ip}`, 30);
    await this.rate(`auth-email:${email}`, 10);
    const result = await this.db().query<Row>('SELECT * FROM sb_users WHERE email=$1', [email]);
    const user = result.rows[0];
    const matches = await checkPassword(
      user ? String(user['password_hash']) : await this.dummyHash,
      password,
    );
    if (!user || !matches)
      throw new UnauthorizedException('Invalid credentials or authenticator code');
    if (user['role'] === 'platform_admin') {
      const otp = typeof body['otp'] === 'string' ? body['otp'] : '';
      const counter = verifyTotp(
        decryptSecret(String(user['mfa_secret']), this.encryptionKey),
        otp,
        Number(user['mfa_counter']),
      );
      if (counter === null)
        throw new UnauthorizedException('Invalid credentials or authenticator code');
      const used = await this.db().query(
        'UPDATE sb_users SET mfa_counter=$2 WHERE id=$1 AND mfa_counter<$2',
        [user['id'], counter],
      );
      if (used.rowCount !== 1)
        throw new UnauthorizedException('Authenticator code was already used');
    }
    return this.session(String(user['id']), user['role'] === 'platform_admin');
  }
  async register(raw: unknown, ip: string) {
    const body = objectBody(raw, ['email', 'password', 'merchantName']);
    const email = textField(body, 'email', 3, 254).toLowerCase();
    if (!/^[a-z0-9._+-]+@[a-z0-9.-]+\.test$/.test(email))
      throw new BadRequestException(
        'Sandbox registration accepts synthetic .test email addresses only',
      );
    const password = passwordField(body),
      name = textField(body, 'merchantName', 2, 100);
    await this.rate(`register:${ip}`, 5);
    const encoded = await hashPassword(password),
      userId = randomUUID(),
      merchantId = randomUUID();
    await this.transaction(async (client) => {
      if ((await client.query('SELECT id FROM sb_users WHERE email=$1', [email])).rowCount)
        throw new ConflictException('Account could not be created with this email');
      await client.query('INSERT INTO sb_merchants (id,name) VALUES ($1,$2)', [merchantId, name]);
      await client.query(
        "INSERT INTO sb_users (id,email,password_hash,role,merchant_id) VALUES ($1,$2,$3,'merchant_owner',$4)",
        [userId, email, encoded, merchantId],
      );
      await this.audit(client, { userId, merchantId }, 'account.register', userId);
    });
    return this.session(userId, false);
  }
  private async session(userId: string, admin: boolean) {
    const token = newToken();
    const expiresAt = new Date(Date.now() + (admin ? 15 : 60) * 60000).toISOString();
    await this.db().query(
      'INSERT INTO sb_sessions (token_hash,user_id,expires_at) VALUES ($1,$2,$3)',
      [digest(token), userId, expiresAt],
    );
    return { token, expiresAt };
  }
  async authenticate(header: string | undefined): Promise<SandboxContext> {
    if (!header?.startsWith('Bearer ') || header.length > 160)
      throw new UnauthorizedException('Sign in to continue');
    const token = header.slice(7),
      tokenHash = digest(token);
    let user: Row | undefined,
      keyId: string | null = null;
    if (token.startsWith('sb_test_')) {
      const result = await this.db().query<Row>(
        `SELECT u.*,k.id AS key_id FROM sb_api_keys k JOIN sb_users u ON u.id=k.created_by
        WHERE k.key_hash=$1 AND k.revoked_at IS NULL AND u.role='merchant_owner' AND u.merchant_id=k.merchant_id`,
        [tokenHash],
      );
      user = result.rows[0];
      keyId = user ? String(user['key_id']) : null;
    } else {
      const result = await this.db().query<Row>(
        'SELECT u.* FROM sb_sessions s JOIN sb_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()',
        [tokenHash],
      );
      user = result.rows[0];
    }
    if (!user) throw new UnauthorizedException('Session expired or credential revoked');
    await this.rate(`api:${keyId ?? String(user['id'])}`, 120, 60);
    return {
      userId: String(user['id']),
      merchantId: user['merchant_id'] ? String(user['merchant_id']) : null,
      email: String(user['email']),
      role: user['role'] as SandboxContext['role'],
      keyId,
      tokenHash,
    };
  }
  human(ctx: SandboxContext) {
    if (ctx.keyId) throw new ForbiddenException('This action requires an interactive session');
  }
  private owner(ctx: SandboxContext): string {
    if (ctx.role !== 'merchant_owner' || !ctx.merchantId)
      throw new ForbiddenException('Merchant owner permission required');
    return ctx.merchantId;
  }
  private admin(ctx: SandboxContext) {
    this.human(ctx);
    if (ctx.role !== 'platform_admin')
      throw new ForbiddenException('Platform administrator permission required');
  }
  async logout(ctx: SandboxContext) {
    this.human(ctx);
    await this.db().query('DELETE FROM sb_sessions WHERE token_hash=$1', [ctx.tokenHash]);
    return { ok: true };
  }
  private async audit(
    client: PoolClient,
    ctx: { userId: string; merchantId: string | null },
    action: string,
    resourceId: string,
  ) {
    await client.query(
      'INSERT INTO sb_audit (id,actor,merchant_id,action,resource_id) VALUES ($1,$2,$3,$4,$5)',
      [randomUUID(), ctx.userId, ctx.merchantId, action, resourceId],
    );
  }
  private async journal(
    client: PoolClient,
    merchantId: string,
    sourceId: string,
    kind: string,
    asset: number,
    merchant: number,
    income: number,
  ) {
    if (![asset, merchant, income].every(Number.isSafeInteger) || asset !== merchant + income)
      throw new Error('Unbalanced ledger posting');
    await client.query(
      'INSERT INTO sb_journals (id,merchant_id,source_id,kind,asset_delta,merchant_delta,income_delta) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [randomUUID(), merchantId, sourceId, kind, asset, merchant, income],
    );
  }
  private async balance(client: PoolClient, merchantId: string) {
    const r = await client.query<Row>(
      'SELECT COALESCE(sum(merchant_delta),0) AS balance FROM sb_journals WHERE merchant_id=$1',
      [merchantId],
    );
    const value = Number(r.rows[0]?.['balance']);
    if (!Number.isSafeInteger(value))
      throw new ServiceUnavailableException('Balance requires review');
    return value;
  }
  private async event(client: PoolClient, merchantId: string, event: string, id: string) {
    await client.query(
      'INSERT INTO sb_webhook_events (id,merchant_id,event,resource_id) VALUES ($1,$2,$3,$4)',
      [randomUUID(), merchantId, event, id],
    );
  }
  private async mutate(
    ctx: SandboxContext,
    key: string | undefined,
    operation: string,
    body: unknown,
    fn: (client: PoolClient) => Promise<unknown>,
  ) {
    if (!key || !/^[a-zA-Z0-9_-]{16,100}$/.test(key))
      throw new BadRequestException(
        'Use a unique Idempotency-Key (16–100 letters, digits, underscores or hyphens)',
      );
    const principal = ctx.keyId ? `key:${ctx.keyId}` : `user:${ctx.userId}`;
    const requestHash = digest(JSON.stringify([operation, body]));
    return this.transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${principal}:${key}`]);
      const previous = (
        await client.query<Row>(
          'SELECT request_hash,response FROM sb_idempotency WHERE principal=$1 AND key=$2',
          [principal, key],
        )
      ).rows[0];
      if (previous) {
        if (previous['request_hash'] !== requestHash)
          throw new ConflictException('Idempotency key was used for a different request');
        return previous['response'];
      }
      if (ctx.merchantId)
        await client.query('SELECT id FROM sb_merchants WHERE id=$1 FOR UPDATE', [ctx.merchantId]);
      const response = await fn(client);
      await client.query(
        'INSERT INTO sb_idempotency (principal,key,request_hash,response) VALUES ($1,$2,$3,$4)',
        [principal, key, requestHash, JSON.stringify(response)],
      );
      return response;
    });
  }
  async workspace(ctx: SandboxContext) {
    this.human(ctx);
    const merchantId = ctx.merchantId;
    const where = ctx.role === 'platform_admin' ? '' : ' WHERE merchant_id=$1';
    const args = ctx.role === 'platform_admin' ? [] : [merchantId];
    const select = async (table: string, fields = '*') =>
      (
        await this.db().query<Row>(
          `SELECT ${fields} FROM ${table}${where} ORDER BY created_at DESC LIMIT 100`,
          args,
        )
      ).rows;
    const [
      payments,
      links,
      refunds,
      settlements,
      journals,
      events,
      audit,
      fees,
      proposals,
      merchants,
      keys,
    ] = await Promise.all([
      select('sb_payments'),
      select('sb_payment_links'),
      select('sb_refunds'),
      select('sb_settlements'),
      select('sb_journals'),
      select('sb_webhook_events'),
      select('sb_audit'),
      this.db()
        .query<Row>('SELECT * FROM sb_fee_versions ORDER BY sequence DESC LIMIT 20')
        .then((r) => r.rows),
      ctx.role === 'platform_admin'
        ? this.db()
            .query<Row>('SELECT * FROM sb_fee_proposals ORDER BY created_at DESC LIMIT 100')
            .then((r) => r.rows)
        : [],
      this.db()
        .query<Row>(
          ctx.role === 'platform_admin'
            ? 'SELECT * FROM sb_merchants ORDER BY created_at DESC LIMIT 100'
            : 'SELECT * FROM sb_merchants WHERE id=$1',
          args,
        )
        .then((r) => r.rows),
      ctx.role === 'merchant_owner'
        ? select('sb_api_keys', 'id,label,prefix,revoked_at,created_at')
        : [],
    ]);
    const totals = (
      await this.db().query<Row>(
        `SELECT COALESCE(sum(asset_delta),0) AS assets, COALESCE(sum(merchant_delta),0) AS merchant_balance, COALESCE(sum(income_delta),0) AS commission FROM sb_journals${where}`,
        args,
      )
    ).rows[0];
    return {
      mode: 'sandbox-only',
      user: { id: ctx.userId, email: ctx.email, role: ctx.role, merchantId },
      payments,
      links,
      refunds,
      settlements,
      journals,
      events,
      audit,
      fees,
      proposals,
      merchants,
      keys,
      totals,
    };
  }
  async transactions(ctx: SandboxContext) {
    const merchantId = this.owner(ctx);
    return (
      await this.db().query<Row>(
        'SELECT * FROM sb_payments WHERE merchant_id=$1 ORDER BY created_at DESC LIMIT 100',
        [merchantId],
      )
    ).rows;
  }
  async createPayment(ctx: SandboxContext, key: string | undefined, raw: unknown) {
    const merchantId = this.owner(ctx),
      body = objectBody(raw, ['amountMinor', 'reference', 'method', 'outcome', 'linkId']);
    const amount = integerField(body, 'amountMinor'),
      reference = textField(body, 'reference', 1, 100),
      method = textField(body, 'method'),
      outcome = textField(body, 'outcome');
    if (!['upi', 'card'].includes(method) || !['captured', 'failed'].includes(outcome))
      throw new BadRequestException('Invalid test method or outcome');
    const linkId = body['linkId'] ? uuid(textField(body, 'linkId')) : null;
    return this.mutate(ctx, key, 'payment', body, async (client) => {
      if (linkId) {
        const link = (
          await client.query<Row>(
            'SELECT * FROM sb_payment_links WHERE id=$1 AND merchant_id=$2 FOR UPDATE',
            [linkId, merchantId],
          )
        ).rows[0];
        if (!link) throw new NotFoundException('Payment link not found');
        if (
          link['status'] !== 'active' ||
          Number(link['amount_minor']) !== amount ||
          outcome !== 'captured'
        )
          throw new ConflictException('Link is not payable with these parameters');
      }
      const fee = (
        await client.query<Row>('SELECT id,bps FROM sb_fee_versions ORDER BY sequence DESC LIMIT 1')
      ).rows[0];
      if (!fee) throw new ServiceUnavailableException('Fee policy missing');
      const feeMinor =
        outcome === 'captured'
          ? Number((BigInt(amount) * BigInt(Number(fee['bps'])) + 5000n) / 10000n)
          : 0;
      const id = randomUUID();
      await client.query(
        'INSERT INTO sb_payments (id,merchant_id,reference,method,amount_minor,fee_minor,fee_version_id,status,link_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [id, merchantId, reference, method, amount, feeMinor, fee['id'], outcome, linkId],
      );
      if (outcome === 'captured')
        await this.journal(client, merchantId, id, 'payment', amount, amount - feeMinor, feeMinor);
      if (linkId)
        await client.query(
          "UPDATE sb_payment_links SET status='paid' WHERE id=$1 AND merchant_id=$2",
          [linkId, merchantId],
        );
      await this.audit(client, ctx, `sandbox.payment.${outcome}`, id);
      await this.event(client, merchantId, `payment.${outcome}`, id);
      return { id, status: outcome, amountMinor: amount, feeMinor, mode: 'sandbox-only' };
    });
  }
  async refund(ctx: SandboxContext, key: string | undefined, id: string, raw: unknown) {
    this.human(ctx);
    const merchantId = this.owner(ctx);
    uuid(id);
    const body = objectBody(raw, ['reason']),
      reason = textField(body, 'reason', 3, 200);
    return this.mutate(ctx, key, `refund:${id}`, body, async (client) => {
      const payment = (
        await client.query<Row>(
          'SELECT * FROM sb_payments WHERE id=$1 AND merchant_id=$2 FOR UPDATE',
          [id, merchantId],
        )
      ).rows[0];
      if (!payment) throw new NotFoundException('Payment not found');
      if (payment['status'] !== 'captured')
        throw new ConflictException('Only captured test payments can be refunded');
      const amount = Number(payment['amount_minor']),
        fee = Number(payment['fee_minor']);
      if ((await this.balance(client, merchantId)) < amount - fee)
        throw new ConflictException('Insufficient unsettled sandbox balance for this refund');
      const refundId = randomUUID();
      await client.query(
        'INSERT INTO sb_refunds (id,merchant_id,payment_id,reason,amount_minor) VALUES ($1,$2,$3,$4,$5)',
        [refundId, merchantId, id, reason, amount],
      );
      await this.journal(client, merchantId, refundId, 'refund', -amount, -(amount - fee), -fee);
      await client.query(
        "UPDATE sb_payments SET status='refunded' WHERE id=$1 AND merchant_id=$2",
        [id, merchantId],
      );
      await this.audit(client, ctx, 'sandbox.refund', refundId);
      await this.event(client, merchantId, 'payment.refunded', id);
      return { id: refundId, status: 'refunded', amountMinor: amount };
    });
  }
  async settlement(ctx: SandboxContext, key: string | undefined, raw: unknown) {
    this.human(ctx);
    const merchantId = this.owner(ctx),
      body = objectBody(raw, ['amountMinor']),
      amount = integerField(body, 'amountMinor');
    return this.mutate(ctx, key, 'settlement', body, async (client) => {
      if ((await this.balance(client, merchantId)) < amount)
        throw new ConflictException('Insufficient sandbox balance');
      const id = randomUUID();
      await client.query(
        'INSERT INTO sb_settlements (id,merchant_id,amount_minor) VALUES ($1,$2,$3)',
        [id, merchantId, amount],
      );
      await this.journal(client, merchantId, id, 'settlement', -amount, -amount, 0);
      await this.audit(client, ctx, 'sandbox.settlement', id);
      await this.event(client, merchantId, 'settlement.simulated', id);
      return { id, status: 'simulated', amountMinor: amount };
    });
  }
  async createLink(ctx: SandboxContext, key: string | undefined, raw: unknown) {
    this.human(ctx);
    const merchantId = this.owner(ctx),
      body = objectBody(raw, ['amountMinor', 'reference']);
    const amount = integerField(body, 'amountMinor'),
      reference = textField(body, 'reference', 1, 100);
    return this.mutate(ctx, key, 'link', body, async (client) => {
      const id = randomUUID();
      await client.query(
        'INSERT INTO sb_payment_links (id,merchant_id,amount_minor,reference) VALUES ($1,$2,$3,$4)',
        [id, merchantId, amount, reference],
      );
      await this.audit(client, ctx, 'sandbox.link.create', id);
      return { id, status: 'active' };
    });
  }
  async cancelLink(ctx: SandboxContext, key: string | undefined, id: string) {
    this.human(ctx);
    const merchantId = this.owner(ctx);
    uuid(id);
    return this.mutate(ctx, key, `link.cancel:${id}`, {}, async (client) => {
      const r = await client.query(
        "UPDATE sb_payment_links SET status='cancelled' WHERE id=$1 AND merchant_id=$2 AND status='active'",
        [id, merchantId],
      );
      if (r.rowCount !== 1) throw new ConflictException('Active link not found');
      await this.audit(client, ctx, 'sandbox.link.cancel', id);
      return { ok: true };
    });
  }
  async createKey(ctx: SandboxContext, raw: unknown) {
    this.human(ctx);
    const merchantId = this.owner(ctx),
      body = objectBody(raw, ['label']),
      label = textField(body, 'label', 2, 60);
    const secret = `sb_test_${newToken()}`,
      id = randomUUID();
    await this.transaction(async (client) => {
      await client.query(
        'INSERT INTO sb_api_keys (id,merchant_id,created_by,label,key_hash,prefix) VALUES ($1,$2,$3,$4,$5,$6)',
        [id, merchantId, ctx.userId, label, digest(secret), secret.slice(0, 16)],
      );
      await this.audit(client, ctx, 'sandbox.key.create', id);
    });
    return { id, secret, scope: 'sandbox payments read/create; no real funds' };
  }
  async revokeKey(ctx: SandboxContext, id: string) {
    this.human(ctx);
    const merchantId = this.owner(ctx);
    uuid(id);
    return this.transaction(async (client) => {
      const r = await client.query(
        'UPDATE sb_api_keys SET revoked_at=now() WHERE id=$1 AND merchant_id=$2 AND revoked_at IS NULL',
        [id, merchantId],
      );
      if (r.rowCount !== 1) throw new NotFoundException('Active key not found');
      await this.audit(client, ctx, 'sandbox.key.revoke', id);
      return { ok: true };
    });
  }
  async proposeFee(ctx: SandboxContext, key: string | undefined, raw: unknown) {
    this.admin(ctx);
    const body = objectBody(raw, ['bps', 'reason']),
      bps = integerField(body, 'bps', 0, 10000),
      reason = textField(body, 'reason', 5, 200);
    return this.mutate(ctx, key, 'fee.propose', body, async (client) => {
      const id = randomUUID();
      await client.query(
        'INSERT INTO sb_fee_proposals (id,bps,reason,proposer) VALUES ($1,$2,$3,$4)',
        [id, bps, reason, ctx.userId],
      );
      await this.audit(client, ctx, 'fee.propose', id);
      return { id, status: 'pending' };
    });
  }
  async approveFee(ctx: SandboxContext, key: string | undefined, id: string) {
    this.admin(ctx);
    uuid(id);
    return this.mutate(ctx, key, `fee.approve:${id}`, {}, async (client) => {
      const p = (
        await client.query<Row>('SELECT * FROM sb_fee_proposals WHERE id=$1 FOR UPDATE', [id])
      ).rows[0];
      if (!p) throw new NotFoundException('Proposal not found');
      if (p['proposer'] === ctx.userId)
        throw new ForbiddenException('A different MFA-authenticated administrator must approve');
      if (p['status'] !== 'pending') throw new ConflictException('Proposal already approved');
      const version = randomUUID();
      await client.query(
        'INSERT INTO sb_fee_versions (id,bps,reason,proposer,approver) VALUES ($1,$2,$3,$4,$5)',
        [version, p['bps'], p['reason'], p['proposer'], ctx.userId],
      );
      await client.query(
        "UPDATE sb_fee_proposals SET status='approved',approved_by=$2 WHERE id=$1",
        [id, ctx.userId],
      );
      await this.audit(client, ctx, 'fee.approve', id);
      return { id, version, status: 'approved' };
    });
  }
}
