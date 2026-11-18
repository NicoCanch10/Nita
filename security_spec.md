# Security Specification for NITA Cloud Firestore

## 1. Data Invariants
1. **User Isolation (Zero-Trust)**: Every user document and nested sub-resource exists exclusively under `/users/{userId}`. A document can only be read, created, or updated if `request.auth != null`, `request.auth.uid == userId`, and the caller is non-anonymous.
2. **Backend-Only Sensitive Collections Lockdown**: `/accounts/{usernameLower}`, `/accountSecrets/{usernameLower}`, `/userSecurity/{uid}`, and `/authRateLimits/{bucketKey}` are strictly reserved for Firebase Cloud Functions Admin SDK (`allow read, write: if false;` for all client SDK requests).
3. **Custom Token (`usr_*`) & Session Epoch Revocation Gate**: Whenever `userId` matches `^usr_.*` or `request.auth.token.provider == 'nita_password'`, Firestore Rules enforce fail-closed validation:
   - `userId` must match `^usr_.+$` (non-empty `usr_*` UID).
   - `request.auth.token.provider == 'nita_password'`.
   - `request.auth.token.sessionEpoch` is an integer `>= 1`.
   - `/userSecurity/$(userId)` MUST exist (`exists(...)`), have `uid == userId`, and have `minSessionEpoch` integer `>= 1`.
   - `request.auth.token.sessionEpoch >= get(/databases/$(database)/documents/userSecurity/$(userId)).data.minSessionEpoch` (tokens issued before a password change are immediately rejected by Firestore Rules even before token expiration).
4. **Identity Integrity & Field Immutability**: No user can impersonate another user. `uid` (on `/users/{userId}`) and `userId`/`monthKey` (on subcollections), plus `createdAt` if present, are immutable after creation. Every `create` and `update` enforces strict `hasAll`, `hasOnly`, and `diff(resource.data).affectedKeys().hasOnly(...)` allowlists.
5. **No Unauthenticated Access**: Unauthenticated requests (`request.auth == null`) are unconditionally denied for all user reads, lists, writes, and deletes (only `/test/connection` allows single-doc `get`).
6. **No Cross-User Access**: User A cannot read, list, create, update, or delete any data belonging to User B, across Google and `usr_*` accounts alike.
7. **No Blind Top-Level Scraping & No Destructive Deletes**: Root collection listing on `/users`, wildcard collection-group queries, and client document deletion (`delete: if false`) are denied.
8. **Path & Schema Hardening**: Path variables (`{userId}`, `{monthKey}`, `docId == 'global'`) and nested arrays (`categories`, `fixedExpenses`, `variableExpenses`) are validated for safe IDs, coherent `YYYY-MM` year/month values, strict ISO `YYYY-MM-DD` expense dates, and valid Latin-America/Euro/USD 23-currency codes.

---

## 2. Adversarial Payloads (Dirty Dozen + Etapa 2A.3 Backend/Session Payloads)

### Payload 1: Unauthenticated Read Attempt
- Operation: `GET /users/user_123`
- Auth: `null` (Unauthenticated)
- Expected: PERMISSION_DENIED

### Payload 2: Cross-User Profile Read
- Operation: `GET /users/victim_user`
- Auth: `request.auth.uid = "attacker_user"`
- Expected: PERMISSION_DENIED

### Payload 3: Cross-User Profile Write / Takeover
- Operation: `SET /users/victim_user`
- Auth: `request.auth.uid = "attacker_user"`
- Payload: `{"uid": "victim_user", "email": "attacker@hack.com"}`
- Expected: PERMISSION_DENIED

### Payload 4: Identity Spoofing Inside User Document
- Operation: `CREATE /users/attacker_user`
- Auth: `request.auth.uid = "attacker_user"`
- Payload: `{"uid": "victim_user", "email": "spoof@hack.com"}`
- Expected: PERMISSION_DENIED

### Payload 5: Unauthenticated Month Creation
- Operation: `CREATE /users/user_123/months/2026-10`
- Auth: `null`
- Expected: PERMISSION_DENIED

### Payload 6: Cross-User Month Manipulation
- Operation: `SET /users/victim_user/months/2026-10`
- Auth: `request.auth.uid = "attacker_user"`
- Expected: PERMISSION_DENIED

### Payload 7: Cross-User or Owner Deletion
- Operation: `DELETE /users/victim_user/months/2026-10` or `/users/user_123/months/2026-10`
- Auth: any user
- Expected: PERMISSION_DENIED

### Payload 8: Path Injection / ID Poisoning
- Operation: `GET /users/attacker_user/months/..%2F..%2Fvictim`
- Auth: `request.auth.uid = "attacker_user"`
- Expected: PERMISSION_DENIED

### Payload 9: Oversized ID / Invalid `monthKey`
- Operation: `CREATE /users/attacker_user/months/` + 2000 'A' characters
- Auth: `request.auth.uid = "attacker_user"`
- Expected: PERMISSION_DENIED

### Payload 10: Cross-User Global Categories Read
- Operation: `GET /users/victim_user/categories/global`
- Auth: `request.auth.uid = "attacker_user"`
- Expected: PERMISSION_DENIED

### Payload 11: Non-Global Categories Document Creation
- Operation: `SET /users/user_123/categories/spam_doc_id`
- Auth: `request.auth.uid = "user_123"`
- Expected: PERMISSION_DENIED

### Payload 12: Global Catch-All Scraping / `/users` Listing
- Operation: `LIST /{document=**}` or `LIST /users`
- Auth: `request.auth.uid = "attacker_user"`
- Expected: PERMISSION_DENIED

### Payload 13: Client Access to Server-Only Auth Collections
- Operation: `GET / LIST / SET` on `/accounts/*`, `/accountSecrets/*`, `/userSecurity/*`, `/authRateLimits/*`
- Auth: unauthenticated, Google user, or `usr_*` user
- Expected: PERMISSION_DENIED

### Payload 14: `usr_*` Missing `userSecurity` Document (Fail-Closed)
- Operation: `GET` or `SET` `/users/usr_orphan/months/2026-10`
- Auth: `uid = "usr_orphan"`, `{ provider: "nita_password", sessionEpoch: 1 }`, no `/userSecurity/usr_orphan`
- Expected: PERMISSION_DENIED

### Payload 15: `usr_*` Stale `sessionEpoch` (Revoked Session Post-Password-Change)
- Operation: `GET` or `SET` `/users/usr_alice/months/2026-10`
- Auth: `uid = "usr_alice"`, `{ provider: "nita_password", sessionEpoch: 1 }`, `/userSecurity/usr_alice.minSessionEpoch == 2`
- Expected: PERMISSION_DENIED

### Payload 16: `usr_*` Without `nita_password` Provider Claim or Non-`usr_*` Forging `nita_password`
- Operation: `GET /users/usr_alice` without `provider == 'nita_password'` OR `GET /users/google_123` with `provider == 'nita_password'`
- Expected: PERMISSION_DENIED

### Payload 17: Immutable `createdAt` or `monthKey` Tampering on Update
- Operation: `UPDATE /users/user_123` changing `createdAt`
- Auth: `request.auth.uid = "user_123"`
- Expected: PERMISSION_DENIED
