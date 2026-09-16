# SMTP and password reset

The dashboard's sign-in card has a "forgot password?" flow that asks the backend to
mail a numeric reset code. That mail goes out over **this deployment's own SMTP
account** — InsForge ships without one, so until it is configured the request
succeeds (202) and no mail is ever delivered.

## What has to be set

One row in `email.config`. The backend reads it through
`SmtpConfigService`, and `EncryptionManager` decrypts the stored password with
`sha256(ENCRYPTION_KEY)` (AES-256-GCM, 16-byte IV, hex, `iv:tag:ciphertext`).

| Field | Meaning |
|---|---|
| `enabled` | master switch; the service only validates host/port when it is true |
| `host` / `port` | SMTP server. **465** is the implicit-TLS port and the schema default |
| `username` | full mailbox address for most providers |
| `password_encrypted` | encrypted with the scheme above — never store it in plain text |
| `sender_email` / `sender_name` | From header on outgoing mail |
| `min_interval_seconds` | throttle between sends (default 60) |

Providers that require the From address to match the authenticated mailbox (most
shared hosts do) need `sender_email = username`.

## Configuring it

Preferred: the admin API, which does the encryption for you.

```bash
# an admin token, not the anon key — this route is behind verifyAdmin
curl -X PUT https://<host>/api/auth/smtp-config \
  -H "Authorization: Bearer <ADMIN_TOKEN>" -H 'Content-Type: application/json' \
  -d '{"enabled":true,"host":"mail.example.com","port":465,
       "username":"noreply@example.com","password":"<smtp password>",
       "senderEmail":"noreply@example.com","senderName":"Token Tracker ZzH",
       "minIntervalSeconds":60}'
```

Without an admin token, write the row directly — but then the password must be
encrypted with the same scheme, or every send fails with a decryption error:

```js
// key from the deployment's ENCRYPTION_KEY (see the insforge container env)
const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
const iv = crypto.randomBytes(16);
const c = crypto.createCipheriv('aes-256-gcm', key, iv);
const enc = c.update(password, 'utf8', 'hex') + c.final('hex');
const ciphertext = [iv.toString('hex'), c.getAuthTag().toString('hex'), enc].join(':');
```

## Verifying

```bash
curl -X POST https://<host>/api/auth/email/send-reset-password \
  -H 'Content-Type: application/json' -d '{"email":"<a real account>"}'
# expect 202 {"success":true,...}
docker logs insforge-insforge-1 --since 60s | grep -i smtp
# expect: "Email sent via SMTP"  template=reset-password-code
```

The API returns 202 whether or not the address exists (it must not leak which
addresses are registered), so the log line — not the response — is the proof.

## Notes

- Enabling SMTP does **not** turn on mandatory email verification. `auth.config`
  is empty on this deployment, so signup keeps its defaults and stays instant.
- Templates live in `email.templates` (`reset-password-code`,
  `reset-password-link`, `email-verification-*`, `request-otp`) and can be
  edited in the InsForge console without touching this repository.
- A fresh deployment needs this configured by hand; the values are deployment
  secrets and deliberately not part of the repo.
