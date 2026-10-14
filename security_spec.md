# Security Specification for NITA Cloud Firestore

## 1. Data Invariants
1. **User Isolation (Zero-Trust)**: Every user document and nested sub-resource exists exclusively under `/users/{userId}`. A document can only be read, created, updated, or deleted if `request.auth != null` and `request.auth.uid == userId`.
2. **Identity Integrity**: No user can impersonate another user. The document ID `userId` must strictly match `request.auth.uid`. For documents with an internal `userId` field, `resource.data.userId == request.auth.uid` and `request.resource.data.userId == request.auth.uid`.
3. **No Unauthenticated Access**: Unauthenticated requests (`request.auth == null`) are unconditionally denied for all reads, writes, and listings.
4. **No Cross-User Access**: User A (`auth.uid = "user_A"`) cannot read, list, modify, or delete any data belonging to User B (`/users/user_B`).
5. **No Blind Top-Level Scraping**: Root collection queries or wildcard collection group queries are strictly forbidden; default catch-all rule denies all operations.
6. **Path Hardening**: Path variables `{userId}`, `{monthKey}`, `{docId}` must satisfy `isValidId()` (safe regex, max size, non-empty) to guard against injection.
7. **Budget & Movement Integrity**: Financial data (months, categories, income, expenses) must adhere to defined object structures and not inject malicious code or unbounded strings.

---

## 2. The "Dirty Dozen" Payloads (Designed to Break Identity, Integrity, and State)

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
- Payload: `{"uid": "victim_user", "email": "spoof@hack.com"}` (UID mismatch with path)
- Expected: PERMISSION_DENIED

### Payload 5: Unauthenticated Month Creation
- Operation: `CREATE /users/user_123/months/2026-10`
- Auth: `null`
- Expected: PERMISSION_DENIED

### Payload 6: Cross-User Month Manipulation
- Operation: `SET /users/victim_user/months/2026-10`
- Auth: `request.auth.uid = "attacker_user"`
- Payload: `{"income": 0, "fixedExpenses": [], "variableExpenses": []}`
- Expected: PERMISSION_DENIED

### Payload 7: Cross-User Expense Deletion
- Operation: `DELETE /users/victim_user/months/2026-10`
- Auth: `request.auth.uid = "attacker_user"`
- Expected: PERMISSION_DENIED

### Payload 8: Path Injection / ID Poisoning
- Operation: `GET /users/attacker_user/months/..%2F..%2Fvictim`
- Auth: `request.auth.uid = "attacker_user"`
- Expected: PERMISSION_DENIED

### Payload 9: Oversized ID / Buffer Overflow Attempt
- Operation: `CREATE /users/attacker_user/months/` + 2000 'A' characters
- Auth: `request.auth.uid = "attacker_user"`
- Expected: PERMISSION_DENIED

### Payload 10: Cross-User Global Categories Read
- Operation: `GET /users/victim_user/categories/global`
- Auth: `request.auth.uid = "attacker_user"`
- Expected: PERMISSION_DENIED

### Payload 11: Cross-User Global Categories Hijacking
- Operation: `SET /users/victim_user/categories/global`
- Auth: `request.auth.uid = "attacker_user"`
- Payload: `{"categories": []}`
- Expected: PERMISSION_DENIED

### Payload 12: Global Catch-All Scraping (Collection Group)
- Operation: `LIST /{document=**}`
- Auth: `request.auth.uid = "attacker_user"`
- Expected: PERMISSION_DENIED
