# Security Specification (ABAC & Zero-Trust Firestore Rules)

## 1. Data Invariants
1. **Global Default Deny**: Any path not explicitly matched is strictly denied (`allow read, write: if false`).
2. **Verified Authentication**: Every write and protected read requires `request.auth != null && request.auth.token.email_verified == true`.
3. **Bootstrapped & Document-Verified Admin**: `isAdmin()` is true only if `isVerifiedUser()` AND (`request.auth.token.email == 'ibroxim6606@gmail.com'` OR `exists(/databases/$(database)/documents/admins/$(request.auth.uid))`).
4. **Path ID Hardening**: All single-document path variables (`adminId`, `pointId`, `docId`, `orderId`) must satisfy `isValidId(id)` (`id is string && id.size() <= 128 && id.matches('^[a-zA-Z0-9_\\-]+$')`).
5. **PII Isolation**: Customer phone numbers and manager names are isolated in `/points/{pointId}/private/{docId}` and readable ONLY by the store `ownerId` (verified via parent `/points/{pointId}`) or `isAdmin()`.
6. **Relational Integrity**: A `CustomerOrder` can only be created if `/points/$(incoming().pointId)` exists and `get(/databases/$(database)/documents/points/$(incoming().pointId)).data.ownerId == request.auth.uid` (or `isAdmin()`).
7. **Terminal State Locking**: Once a `CustomerOrder` reaches `status == 'delivered'` or `status == 'cancelled'`, non-admin users cannot modify it.
8. **Temporal Integrity**: `createdAt` must equal `request.time` on creation and remain immutable on update; `updatedAt` must equal `request.time` on both create and update.

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Payload 1 (Shadow Field Injection on PointOfSale)**:
   `{ "ownerId": "user_1", "name": "Cafe", "type": "coffee", "district": "Chilonzor", "address": "St 1", "latitude": 41.3, "longitude": 69.2, "totalDeliveredPremium": 0, "totalDeliveredCacao": 0, "totalRevenueUZS": 0, "unpaidBalanceUZS": 0, "isVerifiedAdmin": true }`
2. **Payload 2 (Identity Spoofing on PointOfSale)**:
   Authenticated as `user_2`, creating a point with `"ownerId": "user_1"`.
3. **Payload 3 (Unverified Email Spoofing)**:
   Authenticated with `email: "ibroxim6606@gmail.com"` but `email_verified: false`.
4. **Payload 4 (Path ID Poisoning)**:
   Creating `/points/invalid$id!with*bad^chars` or 500-char string ID.
5. **Payload 5 (PII Blanket Read Attack)**:
   Authenticated `user_2` attempting `get` on `/points/point_1/private/contact` owned by `user_1`.
6. **Payload 6 (Query Scraping / Blanket List on Orders)**:
   Authenticated `user_2` executing an unconstrained `list` query on `/orders` without filtering `ownerId == request.auth.uid`.
7. **Payload 7 (Orphaned Order Creation)**:
   Creating an order referencing a non-existent `pointId: "ghost_point_999"`.
8. **Payload 8 (Terminal State Reversal)**:
   Customer attempting to update an order whose `existing().status == 'delivered'` back to `'pending'`.
9. **Payload 9 (Immortal Field Mutation)**:
   Updating `PointOfSale` while changing `ownerId` or `createdAt`.
10. **Payload 10 (Client Timestamp Forgery)**:
    Creating `CustomerOrder` with a forged past or future `createdAt` instead of `request.time`.
11. **Payload 11 (Value Poisoning on Update)**:
    Updating `CustomerOrder` status with a 1MB string or integer `12345` instead of valid enum `['pending', 'confirmed', 'delivered', 'cancelled']`.
12. **Payload 12 (Self-Assigned Admin Escalation)**:
    Non-admin user attempting to create `/admins/user_2` with `"role": "admin"`.
