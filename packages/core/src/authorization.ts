/** A trusted, already authenticated identity and its active merchant memberships. */
export interface MerchantGrant {
  readonly merchantId: string;
  readonly permissions: readonly string[];
}

/**
 * Checks an explicit grant for a merchant resource. This is a building block,
 * not authentication: callers must load grants from trusted server-side storage
 * and apply this check to every resource and query.
 */
export function canAccessMerchantResource(
  grants: readonly MerchantGrant[],
  merchantId: string,
  permission: string,
): boolean {
  if (!merchantId.trim() || !permission.trim()) return false;
  return grants.some(
    (grant) => grant.merchantId === merchantId && grant.permissions.includes(permission),
  );
}
