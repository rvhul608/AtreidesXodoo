# Resend email delivery

Migration `0014_email_delivery.sql` extends the earlier Resend migration with lease-based delivery. The API starts the mail worker in `modules/outbox/delivery.ts`; the outbox API derives legacy status fields from its delivery state.

Password resets, invoice Send actions, and renewal chases all write to `outbox_emails` inside their
business transaction. Once committed, the API's background mail worker sends those messages through
`POST https://api.resend.com/emails`. API requests do not wait for the provider.

## Configuration

Create a Resend account and a sending API key. Verify a domain you own in Resend, then use a sender
on that domain. Resend's `onboarding@resend.dev` sandbox sender only supports sending to the account
owner's address. A custom sending domain requires the DNS records shown in Resend.

Set these values in the local, ignored `.env` file:

```dotenv
RESEND_API_KEY=your-resend-sending-key
MAIL_FROM=Brightloop <billing@your-verified-domain.com>
WEB_ORIGIN=http://localhost:5173
```

Then run `docker compose up -d --build`. Compose passes the settings into the API container. Without
both mail values the worker is disabled; messages remain queued. `WEB_ORIGIN` must match the browser
address, because reset links use it. `/reset-password?token=...` now opens a functional reset form.

## Reliability and status

- A short database claim with `FOR UPDATE SKIP LOCKED` prevents competing workers claiming the same
  message. A two-minute lease permits recovery after a crash without holding connections during HTTP.
- Every message has a random stable delivery key. The sender and body are frozen on first attempt,
  so retries use the same payload and Resend `Idempotency-Key`.
- Timeouts, HTTP 429, 409, and 5xx retry with exponential backoff (honoring `Retry-After`), up to eight
  attempts. Permanent rejections become `failed`. A single worker sends at most about 1.7 requests/sec.
- Resend retains idempotency keys for 24 hours. Uncertain attempts older than 23 hours become failed
  for manual investigation, preventing blind retries after the deduplication window.
- Expired reset messages and reserved `.local`/`.test` demo addresses are skipped. Migration `0012`
  skips the historical demo backlog rather than sending old reset links or invoice notices.
- Admin `GET /api/admin/outbox` includes `delivery_status`, `attempts`, `provider_id`, `sent_at`, and
  `last_error`. `sent` means accepted by Resend; inbox delivery and bounces require provider logs or
  a future webhook integration. Provider failure cannot silently mark a message sent.

Tests use a fake HTTP transport to verify the real queued records, claims, error handling, retries,
expired messages, provider IDs, and a complete password reset using the email's token. They do not
send real messages. Live delivery requires a configured account/key and verified recipient/sender.

Provider references: [Send Email](https://resend.com/docs/api-reference/emails/send-email),
[Idempotency Keys](https://resend.com/docs/dashboard/emails/idempotency-keys).
