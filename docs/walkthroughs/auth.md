# Authentication and users walkthrough

## Account model

Brightloop uses three roles: `admin`, `staff`, and `customer`. Signup creates a customer row and a user linked to it in one transaction. The display name is optional; when omitted, the email's local part is used for the customer's legal name. Email addresses are trimmed and normalized to lowercase, and a case-insensitive unique index prevents multiple accounts for the same email.

Staff and admin users are employees, so `users.customer_id` may be null for them. A database check prevents a customer account from being created without a customer row. Public signup can only create the `customer` role. Admin-only user routes create staff accounts, list accounts, and deactivate an account. Deactivation is immediate because protected requests reload the active user's current role from Postgres rather than relying only on role data cached in a token.

## Session flow

Login verifies a bcrypt password hash and returns an eight-hour JWT in the `session` cookie. The cookie is `httpOnly`, uses `COOKIE_SECURE` and `COOKIE_SAME_SITE` from the environment, and is scoped to `/`. The JWT secret comes from `JWT_SECRET`; `.env.example` contains a replaceable development placeholder, not a production secret. `/api/auth/me` and the admin user routes require a valid cookie. Logout clears it.

Password input must have at least nine characters, one uppercase letter, one lowercase letter, and one non-alphanumeric character. The password is SHA-256 pre-hashed before bcrypt so bcrypt's 72-byte input limit does not silently truncate longer valid passwords. Login errors deliberately use the same response for an unknown account, a wrong password, and a deactivated account. Login and password-reset requests have in-memory per-process rate limits; deployments with multiple API processes should put a shared limiter in front of them if a cluster-wide limit is needed.

## Password reset and email outbox

`POST /api/auth/forgot-password` and the contract-compatible `/api/auth/request-reset` return the same response whether the email exists or not. For an active user, the service creates a random token, stores only its SHA-256 hash in `reset_tokens`, and writes the link to `outbox_emails` in the same transaction. No email provider is called. The token expires after 30 minutes. A transaction locks and marks a valid token used before changing the bcrypt password hash, so a token cannot be replayed. A new reset request invalidates earlier unused tokens for that account.

The older `email_outbox` table remains part of the original schema. Auth reset messages use `outbox_emails`, as required by the current backend brief; the migration keeps the older table intact for other workstreams.

## API shape and authorization

Successful responses use `{ "data": ... }`; user lists include `{ "meta": { "page", "pageSize", "total" } }`. Errors use `{ "error": { "code", "message", "details?" } }`. Bodies, list queries, and user id path parameters are validated with Zod. SQL is parameterized and lives in repository files. The implementation is split into route, service, and repository files under `apps/api/src/modules`, with the small shared DB, validation, error, authorization, rate-limit, audit, and outbox helpers under `apps/api/src/common`.

Protected routes use `requireAuth`; admin user routes also use `requireRole('admin')`. Creating staff and deactivating a user write audit rows in the same transaction as the change. The schema migration makes `audit_log.customer_id` nullable for global employee actions.

## Schema and local verification

`db/schema.sql` is the idempotent baseline. The migration runner records `0000-schema.sql` first, then applies new numbered files in order. Auth-related schema changes are in `db/migrations/0001_auth_users.sql`; later changes should be added as new append-only migration files. The runner applies the baseline even when a migrations directory exists and skips already-recorded migrations.

Local development uses the `brightloop_dev` database. `npm run seed` creates an admin using `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`; the example file documents development defaults. Integration tests use only `brightloop_test`, reset that database before running, and apply the baseline and migrations there.

## Edge cases

- Repeated email addresses, including case-only differences, return a conflict without leaving an orphan customer row.
- Reset requests for unknown addresses do not create outbox rows and do not reveal whether an account exists.
- Reset tokens are stored hashed, expire after 30 minutes, and are invalid after their first successful use or after a newer reset request.
- Deactivated accounts cannot log in and existing sessions stop working on their next protected request.
- A user cannot deactivate their own account. Repeating deactivation for an already inactive account is safe and does not add another audit event.
- List page sizes must be from 1 to 100; invalid query and path values return a validation error.
