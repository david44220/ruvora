# Security

Ruvora enforces authentication, account ownership, independent financial approval and immutable accounting on the server. These are implemented foundations, not a security certification or authorization to handle live funds. See [PROVIDERS.md](PROVIDERS.md), [WEBHOOKS.md](WEBHOOKS.md) and [LEDGER.md](LEDGER.md) for the payment and audit boundaries.

## Accounts and sessions

Passwords use salted scrypt and timing-safe comparison. Public registration cannot grant ADMIN and cannot create financial attribution from a submitted creator handle. Opaque server-issued attribution is bound separately. Login rejects suspended accounts and rejects demo accounts outside development. Password login creates a seven-day opaque session; only its digest is stored. Password login never grants an MFA elevation.

Cookies are HTTP-only, same-site and secure outside development; the deployment must provide HTTPS and preserve the intended application origin. Mutating cookie-authenticated routes require the exact configured `APP_URL` Origin and acceptable fetch-site context. Input schemas, parameterized database access, persistent rate limits and restrictive security headers provide separate controls. The current CSP permits inline framework scripts/styles; nonce-based tightening remains follow-up work.

The Security page provides session inventory, password-proven session revocation, email verification, password recovery and authenticator enrollment. `POST /api/security/sessions/revoke` accepts a password and an optional owned session ID; without an ID it revokes every session, including the current one. A password reset or MFA recovery revokes every session. Session metadata excludes credential digests.

## Email verification and password recovery

Verification links expire after 24 hours; password-reset links after 30 minutes. PostgreSQL stores purpose-bound token digests, account/email binding, expiry and one-use consumption. Requesting a new link invalidates older unused links of that purpose. Consumption and the resulting user/session changes occur in one serializable transaction. A verification link cannot reset a password. Reset revokes every session and queues a password-change notification; it does not disable the existing authenticator.

`POST /api/security/password/request` returns the same accepted response for eligible known and unknown addresses. Security encryption/origin configuration is checked before account lookup so configuration failure does not reveal existence. Rate limits remain per identifier; this is not a claim of resistance to every timing or delivery side channel. Request endpoints also need operational edge abuse controls before launch.

Raw link tokens occur only in an encrypted durable mail payload and the private delivery channel. URLs use a `#token=` fragment so a browser request does not send the token in the path/query. Public production responses never reveal tokens. The application must clear fragments after redemption and avoid third-party scripts on recovery pages.

`MailOutbox` encrypts the whole message with AES-256-GCM and record-specific associated data. Workers claim a lease, retry with backoff, and stop after five attempts. They store error codes, never raw transport messages. The development adapter simulates delivery without external network access. A real delivery adapter, sender-domain configuration and delivery/recovery testing are launch requirements.

The authenticated development mailbox shows only the signed-in user's messages. Locked-out local accounts can be inspected by a trusted local operator using `scripts/inspect-dev-mail.ts`: set `APP_ENV=development`, `EMAIL_PROVIDER=development`, and the separate `ALLOW_DEV_MAIL_INSPECTION=true`, then run `pnpm exec tsx scripts/inspect-dev-mail.ts --email <local-account-email>`. It writes plaintext mail to ignored `.local/private-mail/` and prints paths only. Restrictive POSIX modes are requested; Windows ACL isolation is the operator's responsibility. These files contain temporary credentials: inspect privately and remove after use. There is no public logged-out mailbox, and the command rejects staging/production.

## Authenticator MFA and fresh authentication

TOTP follows [RFC 6238](https://www.rfc-editor.org/rfc/rfc6238) using the [RFC 4226](https://www.rfc-editor.org/rfc/rfc4226) SHA-1 construction, six digits and 30-second steps. Secrets are random per account and encrypted at rest with record binding. Enrollment requires the current password, is tied to one live session, expires after ten minutes and can be confirmed once. Enrollment reveals its secret only for the user to configure their authenticator.

Verification allows the current step and one adjacent step in each direction. Every accepted counter is stored transactionally; the same or an older counter cannot be accepted again, including simultaneous requests from different sessions. After using a code for enrollment or step-up, wait for the next code before attempting another elevation. Server clock synchronization is required.

Financial execution requires an active ADMIN account and a live session whose password proof and MFA proof are both less than 15 minutes old. This requirement applies in development too. The API guards distribution finalization, event settlement/disqualification, rule changes, financial reversal and economic holds. Independent approval requests/reviews and webhook operator retries also require fresh MFA. Ordinary reads and evidence review do not grant financial execution authority.

Enrollment returns ten high-entropy recovery codes once; only their digests are stored. Password plus one unused recovery code disables the authenticator, consumes all remaining recovery codes and revokes every session. The user must sign in and enroll again. Enabling or recovering MFA queues an encrypted account-security-change notification in the same transaction. This avoids leaving old recovery codes usable after a recovery event. Passkeys and externally verified operator recovery procedures remain follow-up work.

For repeatable development only, `seedDevelopmentMfa(userId)` requires `ALLOW_DEV_SEED=true`, an explicit `DEMO_TOTP_SECRET` and an existing demo ADMIN. It derives a unique per-account secret, refuses to overwrite a differing enrollment and never resets an accepted counter. The seed includes `admin@ruvora.test` and `demo-admin-reviewer@ruvora.test`; they must never be production administrators. Never print the seed or generated authenticator codes in logs or reports.

## Independent financial approval

Financial approvals bind the operation, target, canonical payload hash and rule version, expire after 30 minutes, and progress through REQUESTED, APPROVED/REJECTED/EXPIRED and EXECUTED. Request inputs and reviewed/terminal history are protected by database triggers. The requester cannot approve their own operation. Only that requester may execute the separately approved payload, and both actors must remain eligible.

The approval is consumed in the same serializable transaction as the financial mutation. Failed execution rolls back consumption. Changed inputs or rule versions require a new approval. Domain idempotent replay returns before attempting to consume the already executed approval. Event settlement checks the exact preview/event/fingerprint and excludes the owner, sponsor, host and any recipient of a positive prize from both approval roles.

The framework supports distribution finalization, event settlement, rule updates, financial reversals, account holds, manual ledger operations and payout overrides. Support in this vocabulary does not itself enable a manual-ledger or payout endpoint. See the API/domain wiring for enabled operations; there is no live payout delivery.

## Secrets, environments and operations

`APP_ENV` classifies development, staging and production. `NODE_ENV=production` cannot be downgraded to development by `APP_ENV`; explicit staging remains staging. Staging rejects development data/providers even if the framework runs with `NODE_ENV=development`. Readiness validates the environment and existing demo provenance. Development accounts, credentials, seed/funding flags and payment/mail adapters must not be deployed into staging/production.

`SECURITY_ENCRYPTION_KEY` must be exactly 32 random bytes encoded as canonical base64. It protects authenticator enrollment, active TOTP secrets and mail outbox payloads. Keep it in a secret manager with encrypted backups. Key rotation needs a controlled re-encryption migration using the old and new keys; replacing the variable alone makes existing encrypted records unreadable. No automatic key rotation is claimed. Nothing prefixed `NEXT_PUBLIC_` may be secret.

The local PostgreSQL helper binds loopback and refuses staging/production. Its published development credentials are never suitable for a deployment. First-operator bootstrap requires explicit `ALLOW_ADMIN_BOOTSTRAP`, email and a password of at least 16 characters, refuses an existing admin, and creates no funds. Remove bootstrap variables afterward. Provision and independently verify a second non-demo administrator before using two-person financial operations; no production default account/password is supplied.

Before launch: connect and test real providers; complete privacy, retention/export/deletion and consent procedures without deleting accounting history; validate HTTPS/proxy/cookies; enforce least privilege, backups and restore drills; scan dependencies/images; configure edge protection and queue alerts; test recovery, reconciliation and incident response in the target environment; obtain the required operator/legal/payment policies. No live payments, penetration-test completion, legal certification or production readiness is claimed.

Report vulnerabilities privately to the operator of the private `david44220/ruvora` repository. A dedicated verified reporting channel remains a launch requirement. Do not post credentials, personal data or exploit details publicly.
