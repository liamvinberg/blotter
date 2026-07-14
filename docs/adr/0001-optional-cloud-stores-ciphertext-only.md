# ADR 0001: Optional Cloud stores ciphertext only

Status: accepted 2026-07-14 (drafted in the #25 architecture spike, approved by Liam in the #26
productization grilling).

## Context

The original product invariant forbade any hosted service or account: "Local-first, own-your-store.
… No hosted service, no account, no telemetry." Map #15 fixed a narrower position on 2026-07-14:
the core and user-owned remotes require no account, while optional Packbat Cloud may exist only as
a ciphertext store whose key never reaches Packbat. The dashboard performs read-time decryption on
the user's client. Plaintext hosting and key escrow are not future options.

## Decision

Replace the previous invariant bullet in `AGENTS.md` (imported by `CLAUDE.md`) with:

> **Local-first, no required account.** User-owned storage remains the default off-box lane. Every
> off-box copy is encrypted before leaving the machine with a key only the user holds. Optional
> Packbat Cloud stores ciphertext only and decrypts client-side; the key never reaches Packbat,
> plaintext hosting and key escrow are permanently out of scope, and there is no telemetry.

## Consequences

- Any feature that requires Packbat to receive an age identity or session plaintext is rejected by
  invariant, not deferred.
- Cloud auth, quota, and billing data must remain separate from archive contents and minimized to
  what operating the optional service requires.
- Client-side decryption does not excuse active web-client risk. The product must not overstate
  what E2E protects.
- User-owned remotes stay first in init and keep working without any Cloud account or service
  availability.
- Product telemetry remains prohibited. Required security and abuse logging needs an explicit
  minimal schema and retention decision; it cannot silently become behavioral analytics.
