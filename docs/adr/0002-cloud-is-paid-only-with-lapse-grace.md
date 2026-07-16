# ADR 0002: Cloud is paid-only with a lapse grace window

Status: accepted 2026-07-15 (recommended in-session, approved by Liam; amends the #26
productization verdicts).

## Context

#26 fixed a free tier (10 GB ciphertext, keep-forever, over-quota freezes uploads) under one paid
tier (100 GB, $5/mo · $50/yr, storage the only paid axis). Three structural problems surfaced:

- Session archives are too small for storage freemium. Text plus zstd means even heavy multi-year
  use sits far under 10 GB (reference: 4,304 real sessions measured 689 MB at source), so the
  upgrade trigger never fires and paid degrades to patronage. The $5 buys the frictionless lane,
  not gigabytes.
- Free E2E ciphertext storage cannot be moderated. Content inspection is impossible by invariant
  (ADR 0001) and GitHub accounts are free to farm, so quota and payment friction are the only
  abuse levers that exist. A card on file is the abuse filter.
- Keep-forever with no contact channel is an unbounded liability. The account model holds no email
  by design, so frozen free accounts would accrue storage cost forever, unwarnable and
  uncontactable.

## Decision

Packbat Cloud has no free tier.

- One subscription: $5/mo or $50/yr, 100 GB. Checkout completes before the first byte syncs.
- The 100 GB cap is an abuse ceiling, not an upsell axis. Machines, search surfaces, the dashboard
  (#34), and the passkey unlock (#35) are all included. No trial at GA: the free tool and the free
  own-storage lanes are the evaluation path.
- Own storage remains the free lane, remains first in init, and requires no account (ADR 0001
  unchanged).
- Keep-forever is replaced by a stated retention contract. On lapse or cancellation, every new
  upload reservation and presigned URL freezes immediately. A fully quota-reserved upload admitted
  before the lapse may finish within its existing presigned URL lifetime, capped at five minutes.
  Every stored object stays readable and restorable for 90 days; downloads are never charged;
  after the window, ciphertext and control-plane rows are removed by the #31 cascade.
  Re-subscribing inside the window reactivates in place. Re-linking after deletion backfills from
  the local archive, because remotes are replicas.

## Consequences

- The append-only invariant governs the archive at rest (local and user-owned remotes). The Cloud
  replica is a paid replica with a stated retention window; grace-expiry deletion is account
  lifecycle, the same lane as #30's cascade delete. The window must be stated plainly wherever
  Cloud is offered: pricing page, wizard lane (price visible before any account exists), lapse
  notices, and doctor (grace state with the restore deadline, in the #27 copy register).
- Mid-subscription semantics are unchanged: over-quota refuses new reservations and never deletes.
  Only lapse plus the elapsed grace window deletes.
- The bounded in-flight rule preserves direct-to-R2 transfers without claiming an already-issued
  bearer capability can be revoked. Literal zero post-lapse bytes would require a broker or storage
  protocol redesign and is not part of this contract (#41).
- #30's `plan` free/paid enum and free-quota default are superseded by subscription status
  (pre-GA hard cut, no migration bridge). #31 wires one cap. #33 loses the entitlement branch;
  Stripe webhooks drive lifecycle state, and Stripe holds the only email, which becomes the
  communication channel the free design structurally lacked.
- Asymmetry made this the launch posture: a free tier can be added later to applause; one can
  never be removed. Loosen only on evidence.
- AGENTS.md needs no change: no required account, ciphertext only, and no telemetry all stand.
