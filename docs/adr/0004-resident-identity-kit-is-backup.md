# ADR 0004: The age identity is resident and the recovery kit is backup

Status: accepted 2026-07-17 (custody grilling, issue #45).

## Context

Packbat originally removed the age identity from a machine after onboarding and treated the
recovery kit as the only copy. That custody model protected less than it appeared to: a machine
already holds its own plaintext archive and live harness sessions. Kit-only custody protected the
remote history of other machines, while also blocking automatic restore and future remote-mirror
work on the current machine.

The model also allowed each machine to mint an unrelated identity. An account could therefore
have remote history encrypted to different recipients, even though recovery and cross-machine use
need one stable identity.

## Decision

Packbat keeps the age identity in `identity.txt` on every configured user machine, with mode 0600.
The recovery kit becomes an off-machine backup of that identity rather than its only copy.

The first machine mints the account identity and creates the recovery kit. Every joining machine
imports that kit and verifies that its identity derives the configured recipient. A machine with
an existing recipient but no resident identity may only import a matching kit; it never rotates
the recipient during migration.

Remote restore uses the resident identity by default. An explicit identity file remains available
for disaster recovery and takes precedence over the resident file.

ADR 0001 is unchanged. The identity is resident only on user machines and never reaches Packbat;
all off-box services, including Packbat Cloud, still receive ciphertext only.

## Consequences

- Restore no longer depends on finding and manually passing the recovery kit during ordinary use.
- Losing one machine does not lose the identity as long as another joined machine or a recovery-kit
  backup remains.
- Compromise of a user machine exposes its resident identity, but that machine already exposes its
  plaintext archive and live sessions. The additional exposure is the other machines' remote
  history.
- One recipient is stable across the account. Joining proves possession by importing the kit, so
  the first-machine custody challenge is not repeated.
- The recovery kit remains sensitive and must stay backed up off the machine.
- A joined machine does not append its remote locator to the original recovery kit. Recovery of
  that remote therefore also depends on configuration retained elsewhere or reconstructing its
  destination details.
