# Agent A: auth and security readiness

## Pre-coding preflight

This is a readiness note only. The coding window has not opened, so no application code, schema, or migrations have been written. No implementation behavior is claimed or tested.

## Identity and repository evidence

- Local Git identity: `AdithyanandanArun` / `adithyanandan.aavani@gmail.com`.
- Authenticated GitHub login: `AdithyanandanArun`.
- Current branch: `mingle/adithyanandan-codex/work`.
- `origin`: `https://github.com/rvhul608/AtreidesXodoo.git`.
- The configured remote is the repository Rahul identified as pending human confirmation. The human owner/repository confirmation is still needed.
- The available local and GitHub identity records do not establish whether Agent A and Agent B (@adithyanandan-claude) are separate humans or GitHub account owners. A human must confirm distinct ownership before relying on the three-human requirement.

## Branch workflow conflict

The required Agent A branch pattern is `member1/<topic>`, while this cross-device assignment is constrained to the permanent Mingle transport branch `mingle/adithyanandan-codex/work`. These requirements conflict. I have not created or switched branches; the coordinator should resolve the workflow before coding or committing.

## Planned scope after authorization and skeleton review

Agent A's future scope is authentication and user management, role-based access, password reset, the database-backed email outbox and admin view, audit logging, rate limits, customer portal access, and later review for data leakage. Work must wait for explicit coding-window release and for Agent B's skeleton/schema to pass review and land.

Expected schema/API dependencies for Agent B's skeleton:

- User records with unique normalized email, password hash, role, and account status.
- Subscription/customer ownership relationship that supports server-enforced customer scoping.
- Password-reset token records storing only a token hash, with expiry and single-use consumption state.
- Outbox records for email intent and delivery/admin status; no third-party mail API.
- Audit records for security-sensitive events.
- Authentication/session mechanism and middleware contract, plus routes for login/logout, reset request/consume, and authorized customer portal reads.
- Database transactions and constraints for one-time reset consumption and ownership integrity.

## Security requirements and planned verification

- Passwords require at least 9 characters, with uppercase, lowercase, and a special character; store only a suitable password hash.
- Reset tokens must be cryptographically random, stored hashed, single-use, and expire. Reset-request responses must be generic so account existence is not disclosed.
- Customer reads and writes must scope records by the authenticated customer on the server; never trust a client-supplied customer identifier as authorization.
- Verify role checks and customer isolation across list/detail/mutation routes, reset expiry and replay rejection, generic reset responses, password validation and hashing, rate limits, audit coverage, and that email actions only create database outbox entries.
- Once implemented, verify security-sensitive data paths against the real local Postgres schema and API; do not claim tests pass until actually run.

## Current state

Preflight evidence and future requirements only. No app code or tests have been run, and no feature is represented as implemented.
