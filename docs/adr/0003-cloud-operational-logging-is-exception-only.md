# ADR 0003: Cloud operational logging is exception-only

Status: accepted 2026-07-16 as the implementation standards decision for #33.

## Context

ADR 0001 prohibits product telemetry but requires an explicit decision for the security and abuse information needed
to operate Packbat Cloud. Cloudflare Workers Logs can otherwise retain invocation metadata and every arbitrary
`console` value. A permissive log shape would quietly become usage analytics, leak archive metadata, and create a
second cost surface during abuse.

Stripe also retries webhook deliveries and allows manual resend for up to 30 days. Event IDs therefore need a
bounded protocol-deduplication record, but that record is not a product event stream and must disappear with its
account.

## Decision

Workers invocation logs are disabled. Packbat emits custom structured records only when an operator can act:

- `event`: one fixed enum covering rejected webhooks or billing state, rate/quota blocks, accounting repair, grace
  deletion failure, and the aggregate storage-cost threshold.
- `severity`: `warning` or `error`.
- `occurredAt`: UTC timestamp.
- `reason`: one fixed enum; never a provider response, exception message, request value, or free-form string.
- `accountId`: optional opaque Packbat UUID when account-level investigation or deletion requires it.
- `limit`: optional numeric configured ceiling.

No success request is logged. The schema cannot carry IP addresses, GitHub or Stripe IDs, email, object or session
keys, presigned URLs, headers, request bodies, checksums, ETags, archive sizes, recovery material, or plaintext.
Workers Logs retain these exceptional records for at most seven days on the paid plan. There is no Logpush sink or
longer-lived application log table.

Rate and quota records are latched per opaque account and fixed event/reason for five minutes so an attacker cannot
turn rejected traffic into unbounded logs. The latch is deleted after one quiet hour and cascades on account
deletion. Stripe event IDs are protocol state, retained for 31 days to cover Stripe's 30-day manual resend window,
then purged; they also cascade on account deletion. The aggregate storage alert contains no account ID and repeats
at most daily while over its configured threshold.

## Consequences

- Operations can answer why an account was blocked, whether accounting self-repaired, and whether deletion or
  aggregate capacity needs intervention without reconstructing user behavior.
- Ordinary Cloud use leaves no application event trail. D1 still holds current quota, billing lifecycle, and object
  ledger state because those are authoritative service state, not analytics.
- Provider-level infrastructure metadata still exists for Cloudflare and Stripe. Packbat must not claim otherwise.
- Production must keep Workers Logs at the provider's seven-day maximum, leave invocation logs and Logpush off, and
  route billing/usage notifications from the provider consoles separately.

## References

- [Stripe webhook delivery and duplicate-event guidance](https://docs.stripe.com/webhooks)
- [Cloudflare Workers Logs retention and configuration](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)
- [Cloudflare Workers Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
