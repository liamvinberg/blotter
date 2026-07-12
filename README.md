# blotter

Every agent session, kept.

A desk blotter sits under the page and soaks up a copy of everything written on it. `blotter` does that for your AI coding agents: it preserves every session — Claude Code, Codex, any harness — as raw, append-only archives in a store you own, before retention timers silently delete them.

- **Raw, not derivative.** Archives are the original session files, compressed — not markdown exports. Put a file back and your harness resumes it, even years later.
- **Turnkey.** `blotter init` detects your harnesses and schedules the sync. After that you do nothing.
- **Yours.** Local-first, with an optional encrypted copy to a remote you own (S3-compatible, git, restic). No account, no server, no telemetry.

## Status

Pre-v1. Planning in progress; nothing to install yet.

## Layout

Monorepo: `apps/cli` (the tool) and `apps/web` (site + docs), TypeScript throughout.

## License

[MIT](LICENSE)
