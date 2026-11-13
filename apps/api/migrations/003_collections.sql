-- Additive sandbox collection support. Old links remain private until published.
ALTER TABLE sb_payment_links ADD COLUMN expires_at TIMESTAMPTZ NOT NULL DEFAULT (now()+interval '7 days');
ALTER TABLE sb_payment_links ADD COLUMN kind TEXT NOT NULL DEFAULT 'payment_link' CHECK (kind IN ('payment_link','order'));
ALTER TABLE sb_payment_links ADD COLUMN checkout_token_hash TEXT UNIQUE;
ALTER TABLE sb_payment_links ADD COLUMN checkout_token_ciphertext TEXT;
ALTER TABLE sb_payment_links ADD CONSTRAINT sb_checkout_token_pair CHECK (
 (checkout_token_hash IS NULL AND checkout_token_ciphertext IS NULL) OR
 (checkout_token_hash IS NOT NULL AND checkout_token_hash ~ '^[a-f0-9]{64}$' AND checkout_token_ciphertext IS NOT NULL)
);
ALTER TABLE sb_payments ADD COLUMN checkout_link_id UUID;
ALTER TABLE sb_payments ADD CONSTRAINT sb_checkout_payment_tenant FOREIGN KEY (checkout_link_id,merchant_id) REFERENCES sb_payment_links(id,merchant_id);
CREATE INDEX sb_checkout_payment_history ON sb_payments(checkout_link_id,created_at);
ALTER TABLE sb_api_keys ADD COLUMN collections_enabled BOOLEAN NOT NULL DEFAULT false;
-- Public checkout events have no signed-in actor; action names identify the source.
ALTER TABLE sb_audit ALTER COLUMN actor DROP NOT NULL;
