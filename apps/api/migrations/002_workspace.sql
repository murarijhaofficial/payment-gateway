-- Isolated test-only workspace. Existing identity fixture tables are preserved.
CREATE TABLE sb_merchants (
 id UUID PRIMARY KEY, name TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE sb_users (
 id UUID PRIMARY KEY, email TEXT NOT NULL UNIQUE CHECK (email = lower(email)),
 password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('merchant_owner','platform_admin')),
 merchant_id UUID REFERENCES sb_merchants(id), mfa_secret TEXT, mfa_counter BIGINT NOT NULL DEFAULT -1,
 CHECK ((role = 'merchant_owner' AND merchant_id IS NOT NULL) OR (role = 'platform_admin' AND merchant_id IS NULL)),
 CHECK (role <> 'platform_admin' OR mfa_secret IS NOT NULL), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE sb_sessions (
 token_hash TEXT PRIMARY KEY, user_id UUID NOT NULL REFERENCES sb_users(id),
 expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE sb_rate_limits (key TEXT PRIMARY KEY, hits INTEGER NOT NULL, reset_at TIMESTAMPTZ NOT NULL);
CREATE TABLE sb_fee_versions (
 sequence BIGSERIAL UNIQUE,
 id UUID PRIMARY KEY, bps INTEGER NOT NULL CHECK (bps BETWEEN 0 AND 10000),
 proposer UUID REFERENCES sb_users(id), approver UUID REFERENCES sb_users(id), reason TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), CHECK (proposer IS NULL OR proposer <> approver)
);
INSERT INTO sb_fee_versions (id,bps,reason) VALUES ('00000000-0000-4000-8000-000000000200',200,'Initial sandbox policy; excludes taxes and provider fees');
CREATE TABLE sb_fee_proposals (
 id UUID PRIMARY KEY, bps INTEGER NOT NULL CHECK (bps BETWEEN 0 AND 10000), reason TEXT NOT NULL,
 proposer UUID NOT NULL REFERENCES sb_users(id), approved_by UUID REFERENCES sb_users(id),
 status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), CHECK (proposer <> approved_by)
);
CREATE TABLE sb_payment_links (
 id UUID PRIMARY KEY, merchant_id UUID NOT NULL REFERENCES sb_merchants(id),
 reference TEXT NOT NULL, amount_minor BIGINT NOT NULL CHECK (amount_minor BETWEEN 1 AND 100000000),
 status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paid','cancelled')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (id,merchant_id)
);
CREATE TABLE sb_payments (
 id UUID PRIMARY KEY, merchant_id UUID NOT NULL REFERENCES sb_merchants(id),
 reference TEXT NOT NULL, method TEXT NOT NULL CHECK (method IN ('upi','card')),
 amount_minor BIGINT NOT NULL CHECK (amount_minor BETWEEN 1 AND 100000000),
 fee_minor BIGINT NOT NULL CHECK (fee_minor >= 0 AND fee_minor <= amount_minor),
 fee_version_id UUID NOT NULL REFERENCES sb_fee_versions(id),
 status TEXT NOT NULL CHECK (status IN ('captured','failed','refunded')),
 link_id UUID UNIQUE, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE (id,merchant_id), FOREIGN KEY (link_id,merchant_id) REFERENCES sb_payment_links(id,merchant_id)
);
CREATE INDEX sb_payments_merchant_date ON sb_payments(merchant_id,created_at DESC);
CREATE TABLE sb_refunds (
 id UUID PRIMARY KEY, merchant_id UUID NOT NULL REFERENCES sb_merchants(id),
 payment_id UUID NOT NULL UNIQUE, reason TEXT NOT NULL, amount_minor BIGINT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY (payment_id,merchant_id) REFERENCES sb_payments(id,merchant_id)
);
CREATE TABLE sb_settlements (
 id UUID PRIMARY KEY, merchant_id UUID NOT NULL REFERENCES sb_merchants(id),
 amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
 status TEXT NOT NULL DEFAULT 'simulated' CHECK (status = 'simulated'),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Signed deltas represent balanced entries in the three-account sandbox ledger.
-- provider_asset = merchant_liability + platform_income; entries cannot be edited.
CREATE TABLE sb_journals (
 id UUID PRIMARY KEY, merchant_id UUID NOT NULL REFERENCES sb_merchants(id),
 source_id UUID NOT NULL UNIQUE, kind TEXT NOT NULL CHECK (kind IN ('payment','refund','settlement')),
 asset_delta BIGINT NOT NULL, merchant_delta BIGINT NOT NULL, income_delta BIGINT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), CHECK (asset_delta = merchant_delta + income_delta)
);
CREATE INDEX sb_journals_merchant ON sb_journals(merchant_id);
CREATE TABLE sb_api_keys (
 id UUID PRIMARY KEY, merchant_id UUID NOT NULL REFERENCES sb_merchants(id), label TEXT NOT NULL,
 created_by UUID NOT NULL REFERENCES sb_users(id),
 key_hash TEXT NOT NULL UNIQUE, prefix TEXT NOT NULL, revoked_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE sb_webhook_events (
 id UUID PRIMARY KEY, merchant_id UUID NOT NULL REFERENCES sb_merchants(id), event TEXT NOT NULL,
 resource_id UUID NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE sb_audit (
 id UUID PRIMARY KEY, actor UUID NOT NULL REFERENCES sb_users(id), merchant_id UUID REFERENCES sb_merchants(id),
 action TEXT NOT NULL, resource_id UUID NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE sb_idempotency (
 principal TEXT NOT NULL, key TEXT NOT NULL, request_hash TEXT NOT NULL,
 response JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (principal,key)
);
CREATE FUNCTION sb_prevent_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Immutable sandbox record'; END;
$$;
CREATE TRIGGER sb_journals_immutable BEFORE UPDATE OR DELETE ON sb_journals FOR EACH ROW EXECUTE FUNCTION sb_prevent_change();
CREATE TRIGGER sb_audit_immutable BEFORE UPDATE OR DELETE ON sb_audit FOR EACH ROW EXECUTE FUNCTION sb_prevent_change();
CREATE TRIGGER sb_fee_versions_immutable BEFORE UPDATE OR DELETE ON sb_fee_versions FOR EACH ROW EXECUTE FUNCTION sb_prevent_change();
