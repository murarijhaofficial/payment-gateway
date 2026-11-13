# Draft access policy for review

The broader role matrix below is a proposal. The connected sandbox currently
implements only `merchant_owner` and `platform_admin`, as described in
[workspace setup](WORKSPACE_SETUP.md). Owners can access their own test payments,
refunds, links, ledger, simulated settlements and keys. Administrators can read
across test merchants and propose or separately approve commission changes after
MFA login. Self-registration cannot grant administrator privileges. Test API keys
permit their merchant's payment creation and listing. New keys can additionally
receive explicit collection access for tenant-scoped order creation, lookup and
checkout publication; existing keys retain their original scope. Human-only
actions reject API keys. Public checkout tokens authorize only the linked test
request, never merchant workspace or administration access. Other proposed roles
and user administration are not implemented. See [collection controls](PAYMENT_COLLECTION.md).

All access
is denied unless explicitly granted. Authenticated identities and active merchant
memberships must be loaded from trusted server-side storage; client-supplied roles
and merchant IDs are not evidence of access. Every merchant resource and query
must be constrained to an authorized merchant.

| Role                 | Proposed permissions                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------- |
| Platform super admin | Manage platform users; propose, approve, or activate fee changes subject to separate-person approval and MFA. |
| Platform finance     | Read financial reports and reconciliation data; no fee changes.                                               |
| Platform risk        | Review merchant onboarding and risk cases.                                                                    |
| Platform support     | Read limited, masked merchant and payment information.                                                        |
| Merchant owner       | Manage their merchant's users, settings, API keys, payments and reports.                                      |
| Merchant admin       | Manage their merchant's operations and payments, within delegated permissions.                                |
| Merchant developer   | Manage their merchant's API keys and webhook configuration; no financial administration.                      |
| Merchant finance     | Read their merchant's financial reports and request authorized refunds.                                       |
| Merchant viewer      | Read their merchant's permitted reports.                                                                      |

Each permission will need a concrete action and resource definition before it
is enabled. Sensitive operations require appropriate MFA, audit records, and
additional approval where specified in the project operating manual. No user
may approve their own fee change. API credentials must receive explicit scopes
and cannot inherit interactive user privileges.

## Rollback

Keep the previous approved policy version and an audit trail. On a faulty
activation, disable the new policy and restore the last approved version through
a separately authorized administrative procedure, invalidate affected sessions
and credentials where necessary, and review all actions taken while the faulty
policy was active. If a safe previous version is unavailable, deny access to
the affected operations until reviewed. Test rollback before enabling the policy.
