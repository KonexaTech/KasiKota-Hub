# In-app ordering rollout — security gate

This branch replaces WhatsApp checkout with Firestore orders, live owner updates, and customer tracking. Do not merge to production until the deployed Firestore rules are inspected and verified.

## Required Firestore authorization
- Authenticated anonymous customers may create an order only with customerUid == request.auth.uid, approved shop ID and matching ownerUid, valid priced items, bounded quantities and totals, testOrder == false, orderStatus == pending. Reject untrusted privileged fields.
- Customers may read only their own orders. Customer clients must not change ownerUid, shopId, confirmedTotal, payment status, or orderStatus.
- Approved shop owners may read orders only where ownerUid == request.auth.uid and update only allowed order-status, note, delay, confirmedTotal and updatedAt fields, with legal status transitions and appropriate completion rules.
- Admin read access must be restricted to the known administrator UID or a securely provisioned admin claim. Never grant collection-wide reads to anonymous users.
- Validate monetary totals against trusted menu prices or clearly treat them as quotes requiring shop confirmation. Client-only totals are not authoritative.
- Test using two anonymous browsers, two different shop owners, and admin to prove isolation. Check existing rules in Firebase Console first; do not overwrite them blindly.

## Release gates
1. Confirm anonymous Firebase Auth is enabled and Firestore orders create succeeds.
2. Place a real marked test order; owner sees it without refresh.
3. Owner accepts, prepares and completes; same customer session tracks status live.
4. Another browser/account cannot read that order.
5. Admin dashboard sees the order; commission remains governed by existing policy.
6. Confirm service worker cache updates and Android PWA installation.
7. Closed-app push alerts require separate Firebase Cloud Messaging configuration, notification permission, and real-device testing. This branch does not claim to provide background push.
8. Validate payment collection policy; no payment gateway has been added.
